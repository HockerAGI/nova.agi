import crypto from "node:crypto";
import { sbAdmin } from "./supabase.js";
import { config } from "../config.js";
import { signCommand } from "./security.js";
import type { Action } from "../types.js";

const ALLOWED_COMMANDS = new Set(["ping", "status", "read_dir", "read_file_head", "write_file"]);
const SENSITIVE_COMMANDS = new Set(["read_dir", "read_file_head", "write_file"]);

export async function executeActions(params: {
  project_id: string;
  actions: Action[];
  allowActionsHeaderValue: string;
}): Promise<number> {
  if (!config.actionsEnabled) return 0;
  if (config.actionsRequireHeader && params.allowActionsHeaderValue !== "1") return 0;

  const sb = sbAdmin();
  let count = 0;

  const secret = process.env.HOCKER_COMMAND_SIGNING_SECRET ?? "";

  for (const a of params.actions) {
    if (a.type === "event") {
      await sb.from("events").insert({
        project_id: params.project_id,
        node_id: a.node_id ?? null,
        level: a.level ?? "info",
        type: a.event_type,
        message: a.message,
        data: a.data ?? null
      });
      count++;
      continue;
    }

    if (a.type === "enqueue_command") {
      if (!secret) continue;
      if (!ALLOWED_COMMANDS.has(a.command)) continue;

      const id = crypto.randomUUID();
      const payload = a.payload ?? {};
      const signature = signCommand(secret, { id, node_id: a.node_id, command: a.command, payload });

      const needs_approval = SENSITIVE_COMMANDS.has(a.command);
      const status = needs_approval ? "needs_approval" : "queued";

      await sb.from("commands").insert({
        id,
        project_id: params.project_id,
        node_id: a.node_id,
        command: a.command,
        payload,
        signature,
        needs_approval,
        status
      });

      count++;
      continue;
    }
  }

  return count;
}