import crypto from "crypto";
import { stableStringify } from "./stable-json";

export type SignableCommand = {
  node_id: string;
  command: string;
  payload: Record<string, unknown>;
  project_id: string;
  ts: string;
};

export function signCommand(cmd: SignableCommand): string {
  const secret = process.env.HOCKER_COMMAND_SIGNING_SECRET ?? "";
  if (!secret) throw new Error("Missing HOCKER_COMMAND_SIGNING_SECRET");

  const canonical = stableStringify(cmd);
  const key = Buffer.from(secret, "base64");
  return crypto.createHmac("sha256", key).update(canonical).digest("hex");
}

export function verifySignature(cmd: SignableCommand, signature: string): boolean {
  const expected = signCommand(cmd);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}