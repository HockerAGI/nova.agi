import crypto from "node:crypto";
import { stableJson } from "./stable-json.js";

function normalizeSignedTimestamp(value: string): string {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toISOString();
}

export function signCommand(
  secret: string,
  id: string,
  project_id: string,
  node_id: string,
  command: string,
  payload: unknown,
  created_at: string,
): string {
  const signedCreatedAt = normalizeSignedTimestamp(created_at);
  const base = [id, project_id, node_id, command, signedCreatedAt, stableJson(payload)].join("|");
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

  const signedCreatedAt = normalizeSignedTimestamp(created_at);
  const ts = new Date(signedCreatedAt).getTime();
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