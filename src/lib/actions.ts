import { randomUUID } from "node:crypto";
import type { AdminSupabase } from "./supabase.js";
import type { ActionItem, ActionRow, JsonObject } from "../types.js";

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
  const rows: ActionRow[] = [];

  for (const action of args.actions) {
    const { data, error } = await sb
      .from("actions")
      .insert({
        id: randomUUID(),
        project_id: args.project_id,
        thread_id: args.thread_id,
        node_id: action.node_id ?? args.node_id,
        command: action.command,
        payload: (action.payload ?? {}) as JsonObject,
        status: args.needsApproval || action.needs_approval ? "needs_approval" : "queued",
        needs_approval: args.needsApproval || action.needs_approval === true,
        approved_by: null,
        rejected_by: null,
        result: null,
        error: null,
        created_at: now,
        updated_at: now
      })
      .select("*")
      .single();

    if (error || !data) throw new Error(error?.message || "No se pudo encolar la acción.");
    rows.push(data as ActionRow);
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
    .from("actions")
    .update({
      status: "approved",
      approved_by,
      updated_at: now
    })
    .eq("id", action_id)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo aprobar.");
  return data as ActionRow;
}

export async function rejectAction(
  sb: AdminSupabase,
  action_id: string,
  rejected_by: string,
): Promise<ActionRow> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("actions")
    .update({
      status: "rejected",
      rejected_by,
      updated_at: now
    })
    .eq("id", action_id)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo rechazar.");
  return data as ActionRow;
}