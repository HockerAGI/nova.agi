import crypto from "node:crypto";
import { stableStringify } from "./stable-json.js";

export function timingSafeEqual(a: string, b: string) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function signCommand(
  secret: string,
  input: { id: string; project_id: string; node_id: string; command: string; payload: any }
) {
  const base = [
    String(input.id),
    String(input.project_id),
    String(input.node_id),
    String(input.command),
    stableStringify(input.payload ?? {})
  ].join(".");
  return crypto.createHmac("sha256", secret).update(base).digest("hex");
}