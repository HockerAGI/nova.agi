import crypto from "node:crypto";
import { config } from "../config.js";
import { sb } from "./supabase.js";
import { signCommand } from "./security.js";

const SENSITIVE_COMMANDS = new Set([
  "run_sql", 
  "shell.exec", 
  "fs.write", 
  "stripe.charge", 
  "meta.send_msg", 
  "crypto.transfer"
]);

type EnqueueOptions = {
  project_id: string;
  allow_actions: boolean;
  allow_actions_header: string | null;
  actions: any[];
};

export async function enqueueActions(opts: EnqueueOptions) {
  const { project_id, allow_actions, allow_actions_header, actions } = opts;

  if (!config.actions.enabled) return { enqueued: [], blocked: [] };
  if (!allow_actions) return { enqueued: [], blocked: actions };
  if (config.actions.requireHeader && allow_actions_header !== "1") {
    return { enqueued: [], blocked: actions };
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    return { enqueued: [], blocked: [] };
  }

  const enqueued = [];
  const blocked = [];

  for (const act of actions) {
    if (!act || typeof act !== "object" || !act.command) {
      continue;
    }

    const command = String(act.command).trim();
    
    // CORRECCIÓN: Respetamos la variable de entorno, si no hay, asume nodo físico base.
    const node_id = String(act.node_id || config.actions.defaultNodeId).trim();
    const payload = act.payload || {};

    const isSensitive = SENSITIVE_COMMANDS.has(command);
    const needs_approval = config.actions.defaultNeedsApproval || isSensitive;
    const status = needs_approval ? "needs_approval" : "queued";

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    if (!config.commandHmacSecret) {
      console.warn("ADVERTENCIA VERTX: No hay COMMAND_HMAC_SECRET. Bloqueando comando.");
      blocked.push(act);
      continue;
    }

    const signature = signCommand(
      config.commandHmacSecret,
      id,
      project_id,
      node_id,
      command,
      payload,
      created_at
    );

    // Inserción directa en Base de Datos:
    // Esto es el mecanismo IDEAL para tu Nodo Físico, ya que el nodo físico 
    // constantemente lee (polling) esta tabla buscando comandos 'queued'.
    const { error } = await sb.from("commands").insert({
      id,
      project_id,
      node_id,
      command,
      payload,
      status,
      needs_approval,
      signature,
      created_at
    });

    if (error) {
      console.error(`Error encolando acción ${command}:`, error.message);
      blocked.push(act);
    } else {
      enqueued.push({
        id,
        node_id,
        command,
        status,
        needs_approval
      });
    }
  }

  return { enqueued, blocked };
}