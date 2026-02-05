import crypto from "node:crypto";
import { stableStringify } from "./stable-json.js";

export function signCommand(secret: string, input: { id: string; node_id: string; command: string; payload: any }) {
  const canonical = stableStringify({
    id: input.id,
    node_id: input.node_id,
    command: input.command,
    payload: input.payload ?? {},
  });

  return crypto.createHmac("sha256", secret).update(canonical).digest("base64");
}

export function timingSafeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}