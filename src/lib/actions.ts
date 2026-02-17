import { config } from "../config.js";
import type { Action } from "../types.js";
import { supabase } from "./supabase.js";
import { signCommandV2 } from "./security.js";

const ALLOWED_COMMANDS = new Set(["ping", "status", "read_dir", "read_file_head"]);

function nowIso() {
  return new Date().toISOString();
}

async function getControls(project_id: string): Promise<{ kill_switch: boolean; allow_write: boolean }> {
  try {
    const { data } = await supabase
      .from("system_controls")
      .select("kill_switch, allow_write")
      .eq("project_id", project_id)
      .eq("id", "global")
      .maybeSingle();
    return { kill_switch: Boolean((data as any)?.kill_switch), allow_write: Boolean((data as any)?.allow_write) };
  } catch {
    return { kill_switch: false, allow_write: false };
  }
}

function sanitizeAction(action: any): Action | null {
  if (!action || typeof action !== "object") return null;
  const command = String(action.command || "").trim();
  if (!ALLOWED_COMMANDS.has(command)) return null;
  const node_id = action.node_id ? String(action.node_id) : undefined;
  const payload = action.payload ?? {};
  return { command, node_id, payload };
}

export async function enqueueActions(args: {
  project_id: string;
  allow_actions: boolean;
  allow_actions_header: string | null;
  actions: any[];
}): Promise<{ enqueued: any[]; blocked: any[] }> {
  const project_id = String(args.project_id || "global").trim() || "global";

  if (!config.actions.enabled) return { enqueued: [], blocked: args.actions || [] };
  if (!args.allow_actions) return { enqueued: [], blocked: args.actions || [] };

  if (config.actions.requireHeader) {
    if (String(args.allow_actions_header || "") !== "1") {
      return { enqueued: [], blocked: args.actions || [] };
    }
  }

  const controls = await getControls(project_id);
  if (controls.kill_switch) return { enqueued: [], blocked: args.actions || [] };
  if (!controls.allow_write) return { enqueued: [], blocked: args.actions || [] };

  const clean = (Array.isArray(args.actions) ? args.actions : []).map(sanitizeAction).filter(Boolean) as Action[];
  if (!clean.length) return { enqueued: [], blocked: args.actions || [] };

  const enqueued: any[] = [];
  const blocked: any[] = [];

  for (const a of clean) {
    const id = crypto.randomUUID();
    const created_at = nowIso();
    const node_id = (a.node_id || config.actions.defaultNodeId).trim();
    const needs_approval = config.actions.defaultNeedsApproval;

    const signature = signCommandV2(
      config.commandHmacSecret,
      id,
      project_id,
      node_id,
      a.command,
      a.payload ?? {},
      created_at
    );

    const row = {
      id,
      project_id,
      node_id,
      status: needs_approval ? "needs_approval" : "queued",
      needs_approval,
      command: a.command,
      payload: a.payload ?? {},
      signature,
      created_at
    };

    const { error } = await supabase.from("commands").insert(row);
    if (error) {
      blocked.push({ action: a, error: error.message });
      continue;
    }

    enqueued.push({ id, node_id, command: a.command, needs_approval });

    // best-effort event
    try {
      await supabase.from("events").insert({
        project_id,
        actor_type: "system",
        actor_id: "nova.agi",
        type: "command.enqueued",
        data: { command_id: id, node_id, command: a.command }
      });
    } catch {
      // ignore
    }
  }

  return { enqueued, blocked };
}