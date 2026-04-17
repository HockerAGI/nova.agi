import { auditTrailEvent } from "./audit-chain.js";

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
  payload?: Record<string, unknown>;
}) {
  return auditTrailEvent({
    project_id: args.project_id,
    event_type: args.event_type,
    entity_type: args.entity_type,
    entity_id: args.entity_id ?? null,
    actor_type: args.actor_type,
    actor_id: args.actor_id ?? null,
    role: args.role,
    action: args.action,
    severity: args.severity ?? "info",
    payload: args.payload ?? {}
  });
}