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

function toActionRowFromCommand(row: Record<string, unknown>, virtualStatus?: ActionRow["status"]): ActionRow {
  const commandPayload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as JsonObject)
      : {};

  const commandResult =
    row.result && typeof row.result === "object" && !Array.isArray(row.result)
      ? (row.result as JsonObject)
      : null;

  return {
    id: String(row.id),
    project_id: String(row.project_id),
    thread_id: null,
    node_id: row.node_id ? String(row.node_id) : null,
    command: String(row.command),
    payload: commandPayload,
    status:
      virtualStatus ??
      (String(row.status ?? "queued") as ActionRow["status"]),
    needs_approval: Boolean(row.needs_approval),
    approved_by: null,
    rejected_by: null,
    result: commandResult,
    error: row.error ? String(row.error) : null,
    created_at: String(row.created_at),
    updated_at: String(
      row.finished_at ??
        row.started_at ??
        row.executed_at ??
        row.approved_at ??
        row.created_at,
    ),
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
    throw new Error("Falta HOCKER_COMMAND_HMAC_SECRET / COMMAND_HMAC_SECRET para firmar commands.");
  }

  const rows: ActionRow[] = [];

  for (const action of args.actions) {
    const node_id = defaultNodeId(args.node_id, action.node_id);
    const payload = (action.payload ?? {}) as JsonObject;
    const id = randomUUID();

    const signature = signCommand(
      secret,
      id,
      args.project_id,
      node_id,
      action.command,
      payload,
      now,
    );

    const status = args.needsApproval || action.needs_approval ? "needs_approval" : "queued";

    const { data, error } = await sb
      .from("commands")
      .insert({
        id,
        project_id: args.project_id,
        node_id,
        command: action.command,
        payload,
        status,
        needs_approval: args.needsApproval || action.needs_approval === true,
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

    rows.push(toActionRowFromCommand(data as Record<string, unknown>));
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
      approved_at: now,
      error: null,
    })
    .eq("id", action_id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo aprobar la acción.");
  }

  const row = toActionRowFromCommand(data as Record<string, unknown>, "approved");
  row.approved_by = approved_by;
  row.updated_at = now;
  return row;
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
      error: `Rejected by ${rejected_by}`,
      finished_at: now,
    })
    .eq("id", action_id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo rechazar la acción.");
  }

  const row = toActionRowFromCommand(data as Record<string, unknown>, "rejected");
  row.rejected_by = rejected_by;
  row.updated_at = now;
  return row;
}