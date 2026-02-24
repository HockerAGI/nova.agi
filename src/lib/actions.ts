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
  let cloudRequiresWakeUp = false;

  for (const act of actions) {
    if (!act || typeof act !== "object" || !act.command) continue;

    const command = String(act.command).trim();
    let target_node_id = String(act.node_id || config.actions.defaultNodeId).trim();
    const payload = act.payload || {};

    // ==========================================
    // PROTOCOLO FAILOVER: HEALTH CHECK DEL NODO
    // ==========================================
    if (target_node_id !== config.actions.fallbackNodeId) {
      const { data: nodeData } = await sb
        .from("nodes")
        .select("status, last_seen_at")
        .eq("id", target_node_id)
        .eq("project_id", project_id)
        .maybeSingle();
      
      let isOffline = true;
      if (nodeData && nodeData.status === "online" && nodeData.last_seen_at) {
        // Tolerancia de 2 minutos (120000 ms) sin latido antes de considerarlo muerto
        const lastSeen = new Date(nodeData.last_seen_at).getTime();
        if (Date.now() - lastSeen < 120000) {
          isOffline = false;
        }
      }

      if (isOffline) {
        console.warn(`[VERTX FAILOVER] Nodo físico ${target_node_id} inactivo. Redirigiendo a la nube (${config.actions.fallbackNodeId}).`);
        target_node_id = config.actions.fallbackNodeId;
        // Agregamos metadata para que quede en el log por qué se cambió de ruta
        payload._failover_reason = "physical_node_offline";
      }
    }

    const isSensitive = SENSITIVE_COMMANDS.has(command);
    const needs_approval = config.actions.defaultNeedsApproval || isSensitive;
    const status = needs_approval ? "needs_approval" : "queued";

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    if (!config.commandHmacSecret) {
      blocked.push(act);
      continue;
    }

    const signature = signCommand(config.commandHmacSecret, id, project_id, target_node_id, command, payload, created_at);

    const { error } = await sb.from("commands").insert({
      id, project_id, node_id: target_node_id, command, payload, status, needs_approval, signature, created_at
    });

    if (error) {
      blocked.push(act);
    } else {
      enqueued.push({ id, node_id: target_node_id, command, status, needs_approval });
      
      // Si el destino final es la nube y no requiere aprobación manual, preparamos el Trigger
      if (target_node_id === config.actions.fallbackNodeId && !needs_approval) {
        cloudRequiresWakeUp = true;
      }
    }
  }

  // ==========================================
  // DESPERTAR A LA AUTOMATION FABRIC (SI APLICA)
  // ==========================================
  // Si insertamos tareas para la nube, le damos un "ping" a Hocker One para que Trigger.dev procese
  // ya que la nube no hace polling constante como el nodo físico.
  if (cloudRequiresWakeUp && config.hockerOneApiUrl && config.commandHmacSecret) {
    fetch(`${config.hockerOneApiUrl}/api/commands/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.commandHmacSecret}` // Usamos la misma llave HMAC para certificar identidad
      },
      body: JSON.stringify({ project_id })
    }).catch(e => console.error("[FABRIC DISPATCH ERROR]", e.message));
  }

  return { enqueued, blocked };
}