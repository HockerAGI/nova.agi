import type { JsonObject, JsonValue, Provider, CompletionMode, ChatMessage } from "../types.js";
import { AGIS } from "./agis.js";
import { config, modelFor, providerReady } from "../config.js";
import { providersWithinBudget } from "./provider-budget.js";
import { recordUsage, requirePersistedUsage } from "./usage.js";
import { openaiRespond } from "../providers/openai.js";
import { geminiRespond } from "../providers/gemini.js";
import { anthropicRespond } from "../providers/anthropic.js";
import { ollamaRespond } from "../providers/ollama.js";
import { base44Respond } from "../providers/base44.js";
import {
  claimNextAgiTask,
  completeAgiTask,
  createAgiRun,
  failAgiTask,
  finishAgiRun,
  hashAgiArtifact,
  heartbeatAgiTask,
  type AgiTaskRow,
} from "./agi-work-queue.js";

type WorkerCompletion = {
  text: string;
  provider: Provider;
  model: string;
  usage?: {
    tokens_in?: number;
    tokens_out?: number;
  };
};

type WorkerFinding = {
  title: string;
  detail: string;
  confidence: "low" | "medium" | "high";
};

type WorkerActionDraft = {
  title: string;
  rationale: string;
  requested_capability: string;
  args: JsonObject;
  requires_owner_gate: true;
};

type WorkerCoreOutput = {
  summary: string;
  findings: WorkerFinding[];
  recommendations: string[];
  evidence_notes: string[];
  action_drafts: WorkerActionDraft[];
  limitations: string[];
};

const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key)/i;
const MAX_OUTPUT_BYTES = 64 * 1024;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function asText(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asStringList(value: unknown, maxItems = 12, maxLength = 1200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function hasSensitiveKey(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (Array.isArray(value)) return value.some((item) => hasSensitiveKey(item, depth + 1));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => SENSITIVE_KEY.test(key) || hasSensitiveKey(child, depth + 1),
  );
}

function sanitizeArgs(value: unknown): JsonObject {
  const args = asObject(value);
  if (hasSensitiveKey(args)) return {};
  const serialized = JSON.stringify(args);
  if (Buffer.byteLength(serialized, "utf8") > 16 * 1024) return {};
  return args;
}

function findJsonObject(text: string): JsonObject | null {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return asObject(JSON.parse(clean));
  } catch {
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      return asObject(JSON.parse(clean.slice(first, last + 1)));
    } catch {
      return null;
    }
  }
}

function normalizeConfidence(value: unknown): WorkerFinding["confidence"] {
  if (value === "high" || value === "low") return value;
  return "medium";
}

function normalizeCoreOutput(text: string): WorkerCoreOutput {
  const parsed = findJsonObject(text);
  if (!parsed) {
    return {
      summary: asText(text, 8000) || "El trabajador no produjo una respuesta utilizable.",
      findings: [],
      recommendations: [],
      evidence_notes: [],
      action_drafts: [],
      limitations: ["El proveedor no devolvió el formato estructurado solicitado."],
    };
  }

  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
        .map((value) => {
          const item = asObject(value);
          const title = asText(item.title, 240);
          const detail = asText(item.detail, 2400);
          if (!title || !detail) return null;
          return {
            title,
            detail,
            confidence: normalizeConfidence(item.confidence),
          } satisfies WorkerFinding;
        })
        .filter((item): item is WorkerFinding => Boolean(item))
        .slice(0, 16)
    : [];

  const actionDrafts = Array.isArray(parsed.action_drafts)
    ? parsed.action_drafts
        .map((value) => {
          const item = asObject(value);
          const title = asText(item.title, 240);
          const rationale = asText(item.rationale, 1600);
          const requestedCapability = asText(item.requested_capability, 160);
          if (!title || !rationale || !requestedCapability) return null;
          return {
            title,
            rationale,
            requested_capability: requestedCapability,
            args: sanitizeArgs(item.args),
            requires_owner_gate: true,
          } satisfies WorkerActionDraft;
        })
        .filter((item): item is WorkerActionDraft => Boolean(item))
        .slice(0, 8)
    : [];

  return {
    summary: asText(parsed.summary, 8000) || "Sin resumen.",
    findings,
    recommendations: asStringList(parsed.recommendations, 16, 1600),
    evidence_notes: asStringList(parsed.evidence_notes, 12, 1200),
    action_drafts: actionDrafts,
    limitations: asStringList(parsed.limitations, 12, 1200),
  };
}

function providerOrderForTask(task: AgiTaskRow): Provider[] {
  const technical = ["ops", "code", "security", "integration", "infrastructure"].some((term) =>
    `${task.task_type} ${task.title} ${task.agi_id ?? ""}`.toLowerCase().includes(term),
  );
  const base = technical ? config.providerRouting.codeOrder : config.providerRouting.longContextOrder;
  const order: Provider[] = [];

  for (const provider of [...base, ...config.providerRouting.textOrder, ...config.providerRouting.fallbacks]) {
    if (providerReady(provider) && !order.includes(provider)) order.push(provider);
  }
  return order;
}

function completionMode(task: AgiTaskRow): CompletionMode {
  return task.priority === "critical" || task.priority === "high" ? "pro" : "auto";
}

async function completeProvider(
  provider: Provider,
  messages: ChatMessage[],
  mode: CompletionMode,
): Promise<WorkerCompletion> {
  const timeoutMs = mode === "pro" ? 60_000 : 40_000;
  const model = modelFor(provider, mode);

  if (provider === "openai") {
    return openaiRespond({ apiKey: config.openai.apiKey, model, messages, timeoutMs }) as Promise<WorkerCompletion>;
  }
  if (provider === "gemini") {
    return geminiRespond({ apiKey: config.gemini.apiKey, model, messages, timeoutMs }) as Promise<WorkerCompletion>;
  }
  if (provider === "anthropic") {
    return anthropicRespond({ apiKey: config.anthropic.apiKey, model, messages, timeoutMs }) as Promise<WorkerCompletion>;
  }
  if (provider === "base44") {
    return base44Respond({ apiKey: config.base44.apiKey, model, messages, timeoutMs }) as Promise<WorkerCompletion>;
  }
  return ollamaRespond({ baseUrl: config.ollama.baseUrl, model, messages, timeoutMs }) as Promise<WorkerCompletion>;
}

async function completeWithAvailableProvider(
  task: AgiTaskRow,
  messages: ChatMessage[],
): Promise<WorkerCompletion & { failures: Array<{ provider: Provider; reason: string }> }> {
  const configuredOrder = providerOrderForTask(task);
  if (configuredOrder.length === 0) throw new Error("AGI_WORKER_NO_PROVIDER_CONFIGURED");

  const budget = await providersWithinBudget(task.project_id, configuredOrder);
  const available = budget.available;
  if (available.length === 0) throw new Error("AGI_WORKER_ALL_PROVIDER_BUDGETS_EXHAUSTED");

  const failures: Array<{ provider: Provider; reason: string }> = [];
  for (const provider of available) {
    try {
      const completion = await completeProvider(provider, messages, completionMode(task));
      if (!completion.text.trim()) throw new Error("empty_response");
      return { ...completion, failures };
    } catch (error) {
      failures.push({
        provider,
        reason: error instanceof Error ? error.message.slice(0, 300) : "provider_failed",
      });
    }
  }

  throw new Error(`AGI_WORKER_PROVIDERS_FAILED:${failures.map((item) => item.provider).join(",")}`);
}

function taskPrompt(task: AgiTaskRow, agi: (typeof AGIS)[number]): ChatMessage[] {
  const inputText = JSON.stringify(task.input, null, 2);
  const system = [
    `Eres el trabajador especializado ${agi.name} dentro del runtime agentic de Hocker.`,
    "No eres una conciencia demostrada ni una entidad independiente; eres un perfil de trabajo verificable.",
    `Misión: ${agi.mission ?? agi.system_prompt}`,
    `Funciones permitidas: ${(agi.functions ?? []).join(" | ") || "análisis especializado"}.`,
    `Límites: ${(agi.limits ?? []).join(" | ") || "no inventar evidencia"}.`,
    `Política de escritura de la tarea: ${task.write_policy}.`,
    "No ejecutes APIs, comandos, pagos, despliegues, cambios de archivos ni acciones externas.",
    "Puedes proponer action_drafts, pero cada borrador debe declarar requires_owner_gate=true.",
    "No afirmes que consultaste una fuente, herramienta, repositorio o sistema si esa evidencia no aparece en la entrada.",
    "Separa hechos de inferencias y registra limitaciones.",
    "Devuelve únicamente JSON válido con esta forma:",
    '{"summary":"...","findings":[{"title":"...","detail":"...","confidence":"low|medium|high"}],"recommendations":["..."],"evidence_notes":["..."],"action_drafts":[{"title":"...","rationale":"...","requested_capability":"...","args":{},"requires_owner_gate":true}],"limitations":["..."]}',
  ].join("\n");

  const user = [
    `Tarea: ${task.title}`,
    task.details ? `Detalles: ${task.details}` : "",
    `Tipo: ${task.task_type}`,
    "Entrada disponible:",
    inputText,
  ].filter(Boolean).join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function buildEvidence(params: {
  task: AgiTaskRow;
  runId: string;
  workerId: string;
  completion: WorkerCompletion & { failures: Array<{ provider: Provider; reason: string }> };
  inputHash: string;
  resultHash: string;
  usageEvidence: JsonObject;
}): JsonValue[] {
  return [
    {
      type: "task_input_hash",
      value: params.inputHash,
      source: "agi_tasks.input",
    },
    {
      type: "model_execution",
      provider: params.completion.provider,
      model: params.completion.model,
      worker_id: params.workerId,
      run_id: params.runId,
      attempt: params.task.attempt_count,
      completed_at: new Date().toISOString(),
    },
    {
      type: "provider_failures_before_success",
      failures: params.completion.failures.map((item) => ({ provider: item.provider, reason: item.reason })),
    },
    {
      type: "result_hash",
      algorithm: "sha256",
      value: params.resultHash,
    },
    params.usageEvidence,
  ] as JsonValue[];
}

function errorEvidence(task: AgiTaskRow, runId: string, workerId: string, message: string): JsonValue[] {
  return [
    {
      type: "worker_failure",
      task_id: task.id,
      run_id: runId,
      worker_id: workerId,
      attempt: task.attempt_count,
      error: message.slice(0, 1000),
      failed_at: new Date().toISOString(),
    },
  ] as JsonValue[];
}

export async function runOneAgiTask(params: {
  project_id: string;
  worker_id: string;
  assigned_agi?: string | null;
}): Promise<{
  processed: boolean;
  task: AgiTaskRow | null;
  run_id: string | null;
  provider: string | null;
  model: string | null;
}> {
  const task = await claimNextAgiTask(params);
  if (!task) return { processed: false, task: null, run_id: null, provider: null, model: null };

  const agiId = String(task.agi_id ?? task.assigned_to ?? "").toLowerCase();
  const agi = AGIS.find((candidate) => candidate.id.toLowerCase() === agiId || candidate.key.toLowerCase() === agiId);
  if (!agi || agi.status === "planned") {
    const message = agi ? `AGI_WORKER_NOT_ACTIVE:${agi.id}` : `AGI_WORKER_UNKNOWN_PROFILE:${agiId}`;
    await failAgiTask({ task_id: task.id, worker_id: params.worker_id, error: message });
    throw new Error(message);
  }

  const run = await createAgiRun({ task, worker_id: params.worker_id });
  const heartbeat = setInterval(() => {
    void heartbeatAgiTask(task.id, params.worker_id).catch(() => undefined);
  }, 15_000);

  let provider: string | null = null;
  let model: string | null = null;

  try {
    const inputHash = hashAgiArtifact(task.input);
    const completion = await completeWithAvailableProvider(task, taskPrompt(task, agi));
    provider = completion.provider;
    model = completion.model;

    const core = normalizeCoreOutput(completion.text);
    const serialized = JSON.stringify(core);
    if (Buffer.byteLength(serialized, "utf8") > MAX_OUTPUT_BYTES) {
      throw new Error("AGI_WORKER_OUTPUT_TOO_LARGE");
    }

    const resultHash = hashAgiArtifact(core);
    const usageResult = await recordUsage({
      project_id: task.project_id,
      thread_id: null,
      provider: completion.provider,
      model: completion.model,
      tokens_in: completion.usage?.tokens_in,
      tokens_out: completion.usage?.tokens_out,
      trace_id: task.trace_id ?? run.id,
      meta: {
        agi_worker: true,
        task_id: task.id,
        run_id: run.id,
        agi_id: agi.id,
        result_hash: resultHash,
      },
    });
    const usageEvidence = requirePersistedUsage(usageResult, {
      provider: completion.provider,
      model: completion.model,
      tokens_in: completion.usage?.tokens_in,
      tokens_out: completion.usage?.tokens_out,
    });
    const evidence = buildEvidence({
      task,
      runId: run.id,
      workerId: params.worker_id,
      completion,
      inputHash,
      resultHash,
      usageEvidence,
    });
    const output: JsonObject = {
      ...core,
      verification: {
        result_hash: resultHash,
        direct_writes_executed: false,
        external_tools_executed: false,
        action_drafts_require_owner_gate: true,
        worker_profile: agi.id,
      },
    };

    await finishAgiRun({
      run_id: run.id,
      status: "completed",
      output,
      evidence,
      provider,
      model,
      result_hash: resultHash,
    });
    const completed = await completeAgiTask({
      task_id: task.id,
      worker_id: params.worker_id,
      output,
      evidence,
      result_hash: resultHash,
    });

    return {
      processed: true,
      task: completed,
      run_id: run.id,
      provider,
      model,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AGI_WORKER_UNKNOWN_FAILURE";
    const evidence = errorEvidence(task, run.id, params.worker_id, message);

    await finishAgiRun({
      run_id: run.id,
      status: "failed",
      evidence,
      error: message,
      provider,
      model,
    }).catch(() => undefined);
    await failAgiTask({
      task_id: task.id,
      worker_id: params.worker_id,
      error: message,
      evidence,
    }).catch(() => undefined);

    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
