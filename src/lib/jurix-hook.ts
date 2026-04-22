import { randomUUID } from "node:crypto";
import type { JsonObject } from "../types.js";
import { sbAdmin } from "./supabase.js";

export async function auditCriticalAction(args: {
  project_id: string;
  event_type: string;
  entity_type: string;
  entity_id?: string | null;
  actor_type: "user" | "nova" | "system" | "worker";
  actor_id?: string | null;
  role: string;
  action: string;
  severity?: "info" | "warn" | "error" | "critical";
  payload?: JsonObject;
}) {
  const severity = args.severity ?? "info";
  const level: "info" | "warn" | "error" =
    severity === "critical" || severity === "error"
      ? "error"
      : severity === "warn"
        ? "warn"
        : "info";

  const context: JsonObject = {
    event_type: args.event_type,
    entity_type: args.entity_type,
    entity_id: args.entity_id ?? null,
    actor_type: args.actor_type,
    actor_id: args.actor_id ?? null,
    role: args.role,
    action: args.action,
    severity,
    payload: args.payload ?? {},
  };

  const sb = sbAdmin();

  const [auditRes, eventRes] = await Promise.all([
    sb.from("audit_logs").insert({
      id: randomUUID(),
      project_id: args.project_id,
      actor_user_id: args.actor_type === "user" ? (args.actor_id ?? null) : null,
      action: args.action,
      context,
    }),
    sb.from("events").insert({
      id: randomUUID(),
      project_id: args.project_id,
      node_id: null,
      level,
      type: args.event_type,
      message: `${args.entity_type}${args.entity_id ? `:${args.entity_id}` : ""} -> ${args.action}`,
      data: context,
    }),
  ]);

  if (auditRes.error) {
    throw new Error(`Jurix audit_logs insert failed: ${auditRes.error.message}`);
  }

  if (eventRes.error) {
    throw new Error(`Jurix events insert failed: ${eventRes.error.message}`);
  }

  return {
    ok: true,
    project_id: args.project_id,
    action: args.action,
    severity,
    context,
  };
}
