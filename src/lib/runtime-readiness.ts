import { config, providerReady } from "../config.js";
import { getAgiWorkerLoopState } from "./agi-worker-loop.js";
import { getNovaRuntimeHeartbeatState } from "./runtime-heartbeat.js";
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

export async function getNovaRuntimeReadiness() {
  const checkedAt = new Date().toISOString();
  const worker = getAgiWorkerLoopState();
  const heartbeat = getNovaRuntimeHeartbeatState();
  const database = await checkSupabase(worker.project_id || "hocker-one");
  const configuredProviders = PROVIDERS.filter((provider) => providerReady(provider)).length;
  const providerConfiguredForChat = configuredProviders > 0;
  const workerReady =
    worker.enabled &&
    Boolean(worker.last_successful_tick_at) &&
    !worker.last_error;
  const workerRequirementSatisfied = !config.readiness.requireWorker || workerReady;
  const heartbeatFresh = Boolean(
    heartbeat.last_success_at &&
    Date.now() - new Date(heartbeat.last_success_at).getTime() <= config.readiness.heartbeatMs * 3,
  );

  const reasons: string[] = [];
  if (!database.ok) reasons.push(database.error || "DATABASE_UNAVAILABLE");
  if (!providerConfiguredForChat) reasons.push("NO_PROVIDER_CONFIGURED");
  if (!workerRequirementSatisfied) {
    reasons.push(worker.enabled ? "AGI_WORKER_NOT_READY" : "AGI_WORKER_DISABLED");
  }
  if (heartbeat.last_error) reasons.push("HEARTBEAT_WRITE_FAILED");

  const ok = database.ok && providerConfiguredForChat && workerRequirementSatisfied;

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
        ok: providerConfiguredForChat,
        configured_engines: configuredProviders,
        connectivity_verified: false,
      },
      worker: {
        required: config.readiness.requireWorker,
        ok: workerReady,
        enabled: worker.enabled,
        running: worker.running,
        worker_id: worker.worker_id,
        last_tick_at: worker.last_tick_at,
        last_successful_tick_at: worker.last_successful_tick_at,
        has_error: Boolean(worker.last_error),
      },
      heartbeat: {
        ok: heartbeatFresh && !heartbeat.last_error,
        running: heartbeat.running,
        node_id: heartbeat.node_id,
        last_success_at: heartbeat.last_success_at,
        has_error: Boolean(heartbeat.last_error),
      },
    },
    reasons,
  };
}
