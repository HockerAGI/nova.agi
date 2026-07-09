/**
 * NOVA AGI — IA↔IA Communication Protocol
 *
 * Inter-AGI message passing system implementing the "ganar-ganar"
 * (win-win) cooperation principle. AGIs can request assistance from
 * each other, share context, and coordinate autonomous actions.
 *
 * Architecture:
 *  - Each AGI has a unique address (agi_id)
 *  - Messages are routed through the Supabase events table
 *  - Priority levels ensure critical messages get attention
 *  - Win-win protocol: no AGI dominates; cooperation is mandatory
 *  - OODA loop: Observe → Orient → Decide → Act for each message
 *
 * Mirror Node (Nodo Espejo):
 *  - NOVA can operate as a mirror node, replicating decisions
 *  - When the primary NOVA is unavailable, the mirror takes over
 *  - State is persisted in Supabase for cross-node continuity
 */

import { createAdminSupabase } from "./supabase.js";
import { logEvent } from "./synapse.js";
import type { AgiKey, Intent, JsonObject } from "../types.js";
import { config } from "../config.js";

export type AgiMessagePriority = "low" | "normal" | "high" | "critical";

export type AgiMessage = {
  id: string;
  from_agi: AgiKey | string;
  to_agi: AgiKey | string | "*"; // "*" = broadcast to all
  type: "request" | "response" | "inform" | "alert" | "coordination" | "handoff";
  priority: AgiMessagePriority;
  subject: string;
  body: string;
  context?: JsonObject | null;
  thread_id?: string | null;
  requires_response: boolean;
  response_deadline?: string | null;
  created_at: string;
  status: "pending" | "delivered" | "acknowledged" | "responded" | "expired";
};

export type OodaStep = "observe" | "orient" | "decide" | "act";

export type OodaCycle = {
  step: OodaStep;
  observation: string;
  orientation: string;
  decision: string;
  action: string;
  timestamp: string;
};

const supabase = createAdminSupabase();

/**
 * Send a message from one AGI to another (or broadcast).
 * Implements the win-win protocol: the sender offers value,
 * the receiver acknowledges, and both benefit.
 */
export async function sendAgiMessage(params: {
  from_agi: AgiKey | string;
  to_agi: AgiKey | string;
  type?: AgiMessage["type"];
  priority?: AgiMessagePriority;
  subject: string;
  body: string;
  context?: JsonObject | null | undefined;
  thread_id?: string | null | undefined;
  requires_response?: boolean;
  response_deadline_ms?: number;
  project_id?: string;
}): Promise<{ ok: boolean; message_id: string | null; error?: string }> {
  const messageId = `agi-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = params.project_id ?? "hocker-one";
  const now = new Date();
  const deadline = params.response_deadline_ms
    ? new Date(now.getTime() + params.response_deadline_ms).toISOString()
    : null;

  const message: AgiMessage = {
    id: messageId,
    from_agi: params.from_agi,
    to_agi: params.to_agi,
    type: params.type ?? "inform",
    priority: params.priority ?? "normal",
    subject: params.subject,
    body: params.body,
    context: params.context ?? null,
    thread_id: params.thread_id ?? null,
    requires_response: params.requires_response ?? false,
    response_deadline: deadline,
    created_at: now.toISOString(),
    status: "pending",
  };

  // Log to events table for audit trail
  await logEvent({
    project_id: projectId,
    type: "agi_message",
    node_id: config.mirrorNode.nodeId,
    severity: params.priority === "critical" ? "critical" : params.priority === "high" ? "warn" : "info",
    message: `[IA↔IA] ${params.from_agi} → ${params.to_agi}: ${params.subject}`,
    meta: {
      message_id: messageId,
      from_agi: params.from_agi,
      to_agi: params.to_agi,
      msg_type: message.type,
      priority: message.priority,
      requires_response: message.requires_response,
      body: params.body,
      context: params.context ?? {},
    },
  }).catch(() => undefined);

  // Also store in nova_messages for thread continuity if thread_id is provided
  if (params.thread_id) {
    try {
      await supabase
        .from("nova_messages")
        .insert({
          thread_id: params.thread_id,
          project_id: projectId,
          role: "assistant",
          content: `[IA↔IA ${params.from_agi}→${params.to_agi}] ${params.subject}: ${params.body}`,
          meta: {
            agi_message: true,
            message_id: messageId,
            from_agi: params.from_agi,
            to_agi: params.to_agi,
            priority: message.priority,
          },
        });
    } catch {
      // non-fatal
    }
  }

  return { ok: true, message_id: messageId };
}

/**
 * Broadcast a message to all AGIs in the mesh.
 * Used for system-wide alerts, coordination requests, and handoffs.
 */
export async function broadcastAgiMessage(params: {
  from_agi: AgiKey | string;
  type?: AgiMessage["type"];
  priority?: AgiMessagePriority;
  subject: string;
  body: string;
  context?: JsonObject;
  project_id?: string;
}): Promise<{ ok: boolean; message_id: string | null }> {
  return sendAgiMessage({
    ...params,
    to_agi: "*",
    requires_response: false,
  });
}

/**
 * Request cooperation from a specific AGI.
 * This is the win-win protocol: NOVA asks for help,
 * the responding AGI offers its expertise, both benefit.
 */
export async function requestCooperation(params: {
  from_agi: AgiKey | string;
  to_agi: AgiKey | string;
  intent: Intent;
  subject: string;
  body: string;
  context?: JsonObject | null | undefined;
  thread_id?: string | null | undefined;
  project_id?: string;
}): Promise<{ ok: boolean; message_id: string | null }> {
  return sendAgiMessage({
    from_agi: params.from_agi,
    to_agi: params.to_agi,
    type: "request",
    priority: "normal",
    subject: params.subject,
    body: params.body,
    context: { ...(params.context ?? {}), intent: params.intent, cooperation: true },
    thread_id: params.thread_id ?? null,
    requires_response: true,
    response_deadline_ms: 30_000,
    project_id: params.project_id ?? "hocker-one",
  });
}

/**
 * Execute an OODA cycle for autonomous decision-making.
 * Observe → Orient → Decide → Act
 *
 * This is the cognitive loop that each AGI runs before taking action.
 * It ensures decisions are evidence-based and context-aware.
 */
export function runOodaCycle(params: {
  agi_id: string;
  observation: string;
  orientation: string;
  decision: string;
  action: string;
}): OodaCycle {
  const timestamp = new Date().toISOString();

  // Log each step for audit
  void logEvent({
    project_id: "hocker-one",
    type: "ooda_cycle",
    node_id: config.mirrorNode.nodeId,
    severity: "info",
    message: `[OODA ${params.agi_id}] observe→orient→decide→act`,
    meta: {
      agi_id: params.agi_id,
      observation: params.observation,
      orientation: params.orientation,
      decision: params.decision,
      action: params.action,
      timestamp,
    },
  }).catch(() => undefined);

  return {
    step: "act",
    observation: params.observation,
    orientation: params.orientation,
    decision: params.decision,
    action: params.action,
    timestamp,
  };
}

/**
 * Mirror node synchronization.
 * NOVA can act as a mirror (nodo espejo) — replicating its state
 * to a peer node so that if the primary goes down, the mirror
 * can take over seamlessly.
 */
export async function syncMirrorState(params: {
  primary_node_id: string;
  mirror_node_id: string;
  state: JsonObject;
  project_id?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const projectId = params.project_id ?? "hocker-one";

  const { error } = await supabase.from("events").insert({
    project_id: projectId,
    node_id: params.mirror_node_id,
    level: "info",
    type: "mirror_sync",
    message: `Mirror sync from ${params.primary_node_id} to ${params.mirror_node_id}`,
    data: {
      primary_node_id: params.primary_node_id,
      mirror_node_id: params.mirror_node_id,
      state: params.state,
      synced_at: new Date().toISOString(),
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Register the current node as a mirror in the nodes table.
 * This makes NOVA discoverable as a mirror node in the mesh.
 */
export async function registerMirrorNode(params: {
  node_id: string;
  primary_node_id: string;
  project_id?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const projectId = params.project_id ?? "hocker-one";

  const { error } = await supabase.from("nodes").upsert({
    id: params.node_id,
    project_id: projectId,
    type: "mirror",
    status: "online",
    last_seen_at: new Date().toISOString(),
    meta: {
      primary_node_id: params.primary_node_id,
      mirror: true,
      registered_at: new Date().toISOString(),
    },
    tags: ["mirror", "nova"],
  }, { onConflict: "id" });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Build a prompt block describing the IA↔IA protocol state.
 * Injected into NOVA's system prompt so the LLM knows it can
 * cooperate with other AGIs.
 */
export function iaIaPromptBlock(): string {
  return [
    "IA↔IA — Protocolo de cooperación entre AGIs (ganar-ganar):",
    "Puedes pedir cooperación a otras AGIs del mesh usando el protocolo IA↔IA.",
    "Cada AGI tiene una especialidad: SYNTIA (memoria), HOSTIA (infra), VERTX (seguridad),",
    "JURIX (legal), NUMIA (finanzas), NOVA_ADS (marketing), CANDY_ADS (creativo),",
    "PRO_IA (producción), CURVEWIND (estrategia), REVIA (ventas), TRACKHOK (monitoreo),",
    "NEXPA (seguridad humana), CHIDO_WINS (riesgo), CHIDO_GERENTE (operación), SHADOWS (automatización).",
    "La cooperación es ganar-ganar: pides ayuda, ofreces valor, y ambas partes benefit.",
    "",
    "OODA — Ciclo de decisión autónoma: Observar → Orientar → Decidir → Actuar.",
    "Antes de actuar, observa la evidencia, orienta el contexto, decide con criterio, y actúa.",
    "",
    `Nodo espejo (Mirror Node): ${config.mirrorNode.enabled ? "activo" : "inactivo"} (${config.mirrorNode.nodeId}).`,
  ].join("\n");
}
