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
    // Default al nodo de la Automation Fabric si no se especifica uno físico
    const node_id = String(act.node_id || config.actions.defaultNodeId).trim();
    const payload = act.payload || {};

    // VERTX Security: Comandos sensibles siempre requieren aprobación manual
    const isSensitive = SENSITIVE_COMMANDS.has(command);
    const needs_approval = config.actions.defaultNeedsApproval || isSensitive;
    const status = needs_approval ? "needs_approval" : "queued";

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    // Generar la firma Zero-Trust
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