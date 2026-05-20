import type { CompletionMode, Intent, JsonObject } from "../types.js";

export type NovaRuntimePolicy = {
  source: "hocker.one" | "direct_api";
  requested_allow_actions: boolean;
  allow_actions_effective: boolean;
  requested_prefer: string;
  prefer_effective: "auto";
  mode_effective: CompletionMode;
  queue_locked: boolean;
  queue_lock: JsonObject;
  action_policy: string;
  provider_router: string;
  system_prompt_block: string;
  audit_meta: JsonObject;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nativeModeForIntent(intent: Intent): CompletionMode {
  if (intent === "code" || intent === "ops" || intent === "research") return "pro";
  return "auto";
}

function normalizeQueueLock(value: unknown): JsonObject {
  const row = asObject(value);

  const baseLocked = booleanValue(row.locked, false);
  const blockingCount = numberValue(row.blocking_count, baseLocked ? 1 : 0);
  const canStart = booleanValue(row.can_start_new_task, !baseLocked && blockingCount === 0);
  const locked = baseLocked || canStart === false || blockingCount > 0;

  return {
    locked,
    can_start_new_task: !locked,
    blocking_count: blockingCount,
    reason: stringValue(
      row.reason,
      locked
        ? "Hay tareas pendientes en cola. No se deben iniciar tareas nuevas."
        : "Cola sin bloqueo reportado.",
    ),
    source: stringValue(row.source, "context_data"),
  };
}

export function resolveNovaRuntimePolicy(args: {
  context_data?: JsonObject | null;
  requested_allow_actions: boolean;
  requested_prefer?: string;
  intent: Intent;
}): NovaRuntimePolicy {
  const root = asObject(args.context_data);
  const hockerRuntime = asObject(root.hocker_runtime);
  const hasHockerRuntime = Object.keys(hockerRuntime).length > 0;

  const queueLock = normalizeQueueLock(hockerRuntime.queue_lock ?? root.queue_lock);
  const queueLocked = queueLock.locked === true;
  const modeEffective = nativeModeForIntent(args.intent);

  const reason = queueLocked
    ? "Queue Lock activo: NOVA no debe iniciar tareas nuevas hasta cerrar o cancelar la cola pendiente."
    : "Hocker ONE mantiene el control de ejecución mediante Owner Gate, agi_action_queue, auditoría y rollback.";

  const auditMeta: JsonObject = {
    source: hasHockerRuntime ? "hocker.one" : "direct_api",
    requested_allow_actions: args.requested_allow_actions,
    allow_actions_effective: false,
    requested_prefer: stringValue(args.requested_prefer, "auto"),
    prefer_effective: "auto",
    mode_effective: modeEffective,
    queue_locked: queueLocked,
    action_policy: "hocker_one_owner_gate_only",
    provider_router: "native_best_available_fallback",
    reason,
  };

  return {
    source: hasHockerRuntime ? "hocker.one" : "direct_api",
    requested_allow_actions: args.requested_allow_actions,
    allow_actions_effective: false,
    requested_prefer: stringValue(args.requested_prefer, "auto"),
    prefer_effective: "auto",
    mode_effective: modeEffective,
    queue_locked: queueLocked,
    queue_lock: queueLock,
    action_policy: "hocker_one_owner_gate_only",
    provider_router: "native_best_available_fallback",
    system_prompt_block: [
      "Política operativa 12.7D:",
      "- NOVA elige modelo automáticamente. El usuario no elige OpenAI, Gemini, Anthropic u Ollama.",
      "- NOVA elige la AGI responsable automáticamente. El usuario no escoge AGI.",
      "- No inventes integraciones. Si un proveedor, executor o permiso falta, dilo claro.",
      "- No encoles acciones desde nova.agi. Hocker ONE controla ejecución real con agi_action_queue y Owner Gate.",
      "- Si Queue Lock está activo, no inicies tareas nuevas; explica que primero se debe cerrar la cola pendiente.",
      "- Si el usuario pide ejecutar, prepara plan natural y espera autorización final desde Hocker ONE.",
      "- Los botones finales viven en Hocker ONE: Ver resumen, Enviar a producción, No enviar, Deshacer.",
      `Estado Queue Lock: ${queueLocked ? "bloqueado" : "sin bloqueo reportado"}.`,
      `Motivo: ${reason}`,
    ].join("\n"),
    audit_meta: auditMeta,
  };
}
