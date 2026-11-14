import { config, modelFor, providerReady } from "../config.js";
import { getAgiWorkerLoopState } from "./agi-worker-loop.js";
import { getNovaRuntimeHeartbeatState } from "./runtime-heartbeat.js";
import { hasFreshSuccessfulWorkerTick } from "./worker-tick-freshness.js";
import { sbAdmin } from "./supabase.js";

const PROVIDERS = ["openai", "gemini", "anthropic", "ollama", "base44"] as const;
const READINESS_TIMEOUT_MS = 2_500;

async function checkSupabase(projectId: string) {
  const startedAt = Date.now();

  const query = async () => {
    const { data, error } = await sbAdmin()
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      return { ok: false, latency_ms: Date.now() - startedAt, error: "DATABASE_UNAVAILABLE" };
    }
    if (!data) {
      return { ok: false, latency_ms: Date.now() - startedAt, error: "PROJECT_NOT_FOUND" };
    }
    return { ok: true, latency_ms: Date.now() - startedAt, error: null };
  };

  return Promise.race([
    query(),
    new Promise<{ ok: false; latency_ms: number; error: string }>((resolve) => {
      setTimeout(() => resolve({
        ok: false,
        latency_ms: Date.now() - startedAt,
        error: "DATABASE_TIMEOUT",
      }), READINESS_TIMEOUT_MS);
    }),
  ]);
}


async function checkLocalModel(): Promise<boolean> {
  // A configured URL is not evidence that a model is actually installed.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READINESS_TIMEOUT_MS);
  try {
    const baseUrl = config.ollama.baseUrl.endsWith("/") ? config.ollama.baseUrl.slice(0, -1) : config.ollama.baseUrl;
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data: unknown = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return false;
    const models = (data as { models?: unknown }).models;
    const expected = modelFor("ollama", "auto");
    return Array.isArray(models) && models.some((item: unknown) =>
      Boolean(item && typeof item === "object" && (item as { name?: unknown }).name === expected)
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function getNovaRuntimeReadiness() {
  const checkedAt = new Date().toISOString();
  const worker = getAgiWorkerLoopState();
  const heartbeat = getNovaRuntimeHeartbeatState();
  const database = await checkSupabase(worker.project_id || "hocker-one");
  const configuredProviders = PROVIDERS.filter((provider) => providerReady(provider)).length;
  const providerConfiguredForChat = configuredProviders > 0;
  const localModelOnline = config.localOnlyMode ? await checkLocalModel() : false;
  const inferenceReady = providerConfiguredForChat && (!config.localOnlyMode || localModelOnline);
  const workerTickFresh = hasFreshSuccessfulWorkerTick(
    worker.last_successful_tick_at,
    worker.interval_ms,
  );
  const workerReady =
    worker.enabled &&
    workerTickFresh &&
    !worker.last_error;
  const workerRequirementSatisfied = !config.readiness.requireWorker || workerReady;
  const heartbeatFresh = Boolean(
    heartbeat.last_success_at &&
    Date.now() - new Date(heartbeat.last_success_at).getTime() <= config.readiness.heartbeatMs * 3,
  );

  const reasons: string[] = [];
  if (!database.ok) reasons.push(database.error || "DATABASE_UNAVAILABLE");
  if (!providerConfiguredForChat) reasons.push("NO_PROVIDER_CONFIGURED");
  if (config.localOnlyMode && !localModelOnline) reasons.push("LOCAL_MODEL_UNAVAILABLE");
  if (!workerRequirementSatisfied) {
    reasons.push(!worker.enabled ? "AGI_WORKER_DISABLED"
      : !workerTickFresh ? "AGI_WORKER_TICK_STALE" : "AGI_WORKER_NOT_READY");
  }
  const heartbeatReady = heartbeat.running && heartbeatFresh && !heartbeat.last_error;
  if (!heartbeat.running || !heartbeatFresh) reasons.push("HEARTBEAT_NOT_FRESH");
  if (heartbeat.last_error) reasons.push("HEARTBEAT_WRITE_FAILED");

  const ok = database.ok && inferenceReady && workerRequirementSatisfied && heartbeatReady;

  return {
    ok,
    status: ok ? "ready" : "not_ready",
    service: "nova.agi",
    checked_at: checkedAt,
    checks: {
      database: {
        ok: database.ok,
        latency_ms: database.latency_ms,
      },
      inference_configuration: {
        ok: inferenceReady,
        configured_engines: configuredProviders,
        connectivity_verified: config.localOnlyMode && localModelOnline,
        local_only_mode: config.localOnlyMode,
      },
      worker: {
        required: config.readiness.requireWorker,
        ok: workerReady,
        enabled: worker.enabled,
        running: worker.running,
        worker_id: worker.worker_id,
        last_tick_at: worker.last_tick_at,
        last_successful_tick_at: worker.last_successful_tick_at,
        tick_fresh: workerTickFresh,
        has_error: Boolean(worker.last_error),
      },
      heartbeat: {
        ok: heartbeatReady,
        running: heartbeat.running,
        node_id: heartbeat.node_id,
        last_success_at: heartbeat.last_success_at,
        has_error: Boolean(heartbeat.last_error),
      },
    },
    reasons,
  };
}
