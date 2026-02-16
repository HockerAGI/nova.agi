import crypto from "node:crypto";
import { config } from "../config.js";
import { supabase } from "./supabase.js";
import { signCommandV2 } from "./security.js";
import type { Action } from "../types.js";

type Controls = { kill_switch: boolean; allow_write: boolean };

const ALLOWED_COMMANDS = new Set(["ping", "status", "read_dir", "read_file_head"]);

// Misma idea del panel: sensibles van a needs_approval (aunque aquí no los permitimos en allowlist)
const SENSITIVE_COMMANDS = new Set(["run_sql", "shell.exec", "fs.write"]);

function nowIso() {
  return new Date().toISOString();
}

async function getControls(project_id: string): Promise<Controls> {
  try {
    const { data } = await supabase
      .from("system_controls")
      .select("kill_switch, allow_write")
      .eq("project_id", project_id)
      .eq("id", "global")
      .maybeSingle();

    return { kill_switch: Boolean(data?.kill_switch), allow_write: Boolean(data?.allow_write) };
  } catch {
    // si aún no existe tabla/row, no frenamos el server
    return { kill_switch: false, allow_write: false };
  }
}

async function emitEvent(level: "info" | "warn" | "error", type: string, message: string, data?: any) {
  try {
    await supabase.from("events").insert({
      project_id: config.commands.projectId,
      node_id: "nova.agi",
      level,
      type,
      message,
      data: data ?? null
    });
  } catch {
    // observabilidad best-effort, no tumba producción
  }
}

export async function executeActions(
  project_id: string,
  allowActionsHeaderValue: string | undefined,
  allowActionsBody: boolean | undefined,
  actions: Action[]
) {
  if (!config.actionsEnabled) return [];

  // Seguridad: requiere header + body
  if (config.actionsRequireHeader) {
    if (allowActionsHeaderValue !== "1") return [];
    if (allowActionsBody !== true) return [];
  }

  // Si no hay secreto, NO firmamos, NO encolamos (real y honesto)
  const secret = config.commands.signingSecret;
  if (!secret) {
    await emitEvent("warn", "actions.disabled", "No hay COMMAND_HMAC_SECRET/HOCKER_COMMAND_SIGNING_SECRET. Acciones desactivadas.");
    return [];
  }

  // Kill switch real
  const controls = await getControls(project_id);
  if (controls.kill_switch) {
    await emitEvent("warn", "actions.killswitch", "Kill Switch ON: acciones bloqueadas.", { project_id });
    return [];
  }

  const results: any[] = [];

  for (const a of actions || []) {
    const command = String(a?.command || "").trim();
    if (!ALLOWED_COMMANDS.has(command)) {
      results.push({ ok: false, error: `Comando no permitido: ${command}` });
      continue;
    }

    const node_id = String(a?.node_id || config.commands.defaultNodeId).trim() || config.commands.defaultNodeId;
    const payload = a?.payload ?? {};

    const id = crypto.randomUUID();
    const created_at = nowIso();

    const signature = signCommandV2(secret, id, project_id, node_id, command, payload, created_at);

    const needs_approval = SENSITIVE_COMMANDS.has(command);
    const status = needs_approval ? "needs_approval" : "queued";

    try {
      const { data, error } = await supabase
        .from("commands")
        .insert({
          id,
          project_id,
          node_id,
          command,
          payload,
          status,
          needs_approval,
          signature,
          created_at
        })
        .select("id, status, node_id, command, created_at")
        .single();

      if (error) {
        results.push({ ok: false, error: error.message, command });
        await emitEvent("error", "actions.enqueue_error", "Error encolando comando", { command, error: error.message });
        continue;
      }

      results.push({ ok: true, item: data });
      await emitEvent("info", "actions.enqueued", "Acción encolada", { command, node_id, id });
    } catch (e: any) {
      results.push({ ok: false, error: String(e?.message || e), command });
      await emitEvent("error", "actions.enqueue_exception", "Excepción encolando comando", { command, error: String(e?.message || e) });
    }
  }

  return results;
}