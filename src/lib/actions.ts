import { randomUUID } from "node:crypto";

import type { AdminSupabase } from "./supabase.js";
import { signCommand } from "./security.js";
import type { ActionItem, ActionRow, JsonObject } from "../types.js";

function commandSecret(): string {
  return String(
    process.env.HOCKER_COMMAND_HMAC_SECRET ??
      process.env.COMMAND_HMAC_SECRET ??
      process.env.NOVA_COMMAND_HMAC_SECRET ??
      "",
  ).trim();
}

function defaultNodeId(argsNodeId: string | null, actionNodeId?: string): string {
  return String(
    actionNodeId ??
      argsNodeId ??
      process.env.DEFAULT_COMMAND_NODE_ID ??
      "hocker-node-1",
  ).trim();
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function asActionStatus(value: unknown): ActionRow["status"] {
  switch (String(value ?? "").trim()) {
    case "queued":
    case "needs_approval":
    case "running":
    case "done":
    case "error":
    case "canceled":
      return String(value) as ActionRow["status"];
    default:
      return "queued";
  }
}

function latestTimestamp(row: Record<string, unknown>): string {
  return String(
    row.finished_at ??
      row.executed_at ??
      row.started_at ??
      row.approved_at ??
      row.created_at ??
      new Date().toISOString(),
  );
}

function toActionRowFromCommand(
  row: Record<string, unknown>,
  options?: {
    threadId?: string | null;
    approvedBy?: string | null;
    rejectedBy?: string | null;
  },
): ActionRow {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    thread_id: options?.threadId ?? null,
    node_id: row.node_id ? String(row.node_id) : null,
    command: String(row.command),
    payload: asJsonObject(row.payload),
    status: asActionStatus(row.status),
    needs_approval: Boolean(row.needs_approval),
    approved_by: options?.approvedBy ?? null,
    rejected_by: options?.rejectedBy ?? null,
    approved_at: asNullableString(row.approved_at),
    started_at: asNullableString(row.started_at),
    executed_at: asNullableString(row.executed_at),
    finished_at: asNullableString(row.finished_at),
    result:
      row.result && typeof row.result === "object" && !Array.isArray(row.result)
        ? (row.result as JsonObject)
        : null,
    error: row.error ? String(row.error) : null,
    created_at: String(row.created_at),
    updated_at: latestTimestamp(row),
  };
}

export async function enqueueActions(
  sb: AdminSupabase,
  args: {
    project_id: string;
    thread_id: string | null;
    node_id: string | null;
    actions: ActionItem[];
    needsApproval: boolean;
  },
): Promise<ActionRow[]> {
  const now = new Date().toISOString();
  const secret = commandSecret();

  if (!secret) {
    throw new Error(
      "Falta HOCKER_COMMAND_HMAC_SECRET / COMMAND_HMAC_SECRET para firmar commands.",
    );
  }

  const rows: ActionRow[] = [];

  for (const action of args.actions) {
    const node_id = defaultNodeId(args.node_id, action.node_id);
    const payload = (action.payload ?? {}) as JsonObject;
    const id = randomUUID();
    const needsApproval = args.needsApproval || action.needs_approval === true;
    const status: ActionRow["status"] = needsApproval ? "needs_approval" : "queued";

    const signature = signCommand(
      secret,
      id,
      args.project_id,
      node_id,
      action.command,
      payload,
      now,
    );

    const { data, error } = await sb
      .from("commands")
      .insert({
        id,
        project_id: args.project_id,
        node_id,
        command: action.command,
        payload,
        status,
        needs_approval: needsApproval,
        signature,
        result: null,
        error: null,
        created_at: now,
        started_at: null,
        executed_at: null,
        finished_at: null,
        approved_at: null,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "No se pudo encolar la acción en commands.");
    }

    rows.push(
      toActionRowFromCommand(data as Record<string, unknown>, {
        threadId: args.thread_id,
      }),
    );
  }

  return rows;
}

export async function approveAction(
  sb: AdminSupabase,
  action_id: string,
  approved_by: string,
): Promise<ActionRow> {
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("commands")
    .update({
      status: "queued",
      needs_approval: false,
      approved_at: now,
      finished_at: null,
      error: null,
    })
    .eq("id", action_id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo aprobar la acción.");
  }

  return toActionRowFromCommand(data as Record<string, unknown>, {
    approvedBy: approved_by,
  });
}

export async function rejectAction(
  sb: AdminSupabase,
  action_id: string,
  rejected_by: string,
): Promise<ActionRow> {
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("commands")
    .update({
      status: "canceled",
      needs_approval: false,
      approved_at: null,
      error: `Rejected by ${rejected_by}`,
      finished_at: now,
    })
    .eq("id", action_id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo rechazar la acción.");
  }

  return toActionRowFromCommand(data as Record<string, unknown>, {
    rejectedBy: rejected_by,
  });
}
