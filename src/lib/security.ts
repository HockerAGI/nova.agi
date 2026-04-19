import crypto from "node:crypto";
import { stableJson } from "./stable-json.js";

export function signCommand(
  secret: string,
  id: string,
  project_id: string,
  node_id: string,
  command: string,
  payload: unknown,
  created_at: string,
): string {
  const base = [id, project_id, node_id, command, created_at, stableJson(payload)].join("|");
  return crypto.createHmac("sha256", secret).update(base).digest("hex");
}

export function verifyCommandSignature(
  secret: string,
  signature: string | null | undefined,
  id: string,
  project_id: string,
  node_id: string,
  command: string,
  payload: unknown,
  created_at: string,
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  if (!secret || !signature) return false;

  const ts = new Date(created_at).getTime();
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxAgeMs) return false;

  const expected = signCommand(secret, id, project_id, node_id, command, payload, created_at);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

export function safeBearerEquals(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}