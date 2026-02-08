import crypto from "node:crypto";
import { stableStringify } from "./stable-json.js";

export function signCommand(
  secret: string,
  payload: { id: string; node_id: string; command: string; payload: any }
) {
  const canonical = stableStringify({
    id: payload.id,
    node_id: payload.node_id,
    command: payload.command,
    payload: payload.payload ?? {}
  });

  return crypto.createHmac("sha256", secret).update(canonical).digest("base64");
}