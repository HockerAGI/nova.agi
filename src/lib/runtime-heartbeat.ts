import { config } from "../config.js";
import { getAgiWorkerLoopState } from "./agi-worker-loop.js";
import { sbAdmin } from "./supabase.js";

export type NovaRuntimeHeartbeatState = {
  running: boolean;
  node_id: string;
  started_at: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};

type HeartbeatLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

const state: NovaRuntimeHeartbeatState = {
  running: false,
  node_id: config.readiness.runtimeNodeId,
  started_at: new Date().toISOString(),
  last_attempt_at: null,
  last_success_at: null,
  last_error: null,
};

export function getNovaRuntimeHeartbeatState(): NovaRuntimeHeartbeatState {
  return { ...state };
}

async function writeHeartbeat(status: "online" | "degraded" | "offline") {
  const worker = getAgiWorkerLoopState();
  const now = new Date().toISOString();
  state.last_attempt_at = now;

  const { error } = await sbAdmin().from("nodes").upsert(
    {
      id: state.node_id,
      project_id: worker.project_id || "hocker-one",
      name: "NOVA AGI Runtime",
      type: "agi-runtime",
      status,
      last_seen_at: now,
      tags: ["nova", "runtime", "worker"],
      meta: {
        runtime: "nova.agi",
        runtime_version: "2.3.0",
        worker_enabled: worker.enabled,
        worker_running: worker.running,
        worker_id: worker.worker_id,
        assigned_agi: worker.assigned_agi,
        last_tick_at: worker.last_tick_at,
        last_task_id: worker.last_task_id,
        last_result_hash: worker.last_result_hash,
        worker_has_error: Boolean(worker.last_error),
      },
      updated_at: now,
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(`NOVA_RUNTIME_HEARTBEAT_FAILED: ${error.message}`);
  state.last_success_at = now;
  state.last_error = null;
}

export function startNovaRuntimeHeartbeat(logger: HeartbeatLogger): () => Promise<void> {
  state.running = true;
  let stopped = false;
  let inFlight = false;

  const beat = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const worker = getAgiWorkerLoopState();
      const status = worker.enabled && worker.last_error ? "degraded" : "online";
      await writeHeartbeat(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "NOVA_RUNTIME_HEARTBEAT_FAILED";
      state.last_error = message;
      logger.warn(`[NOVA RUNTIME] ${message}`);
    } finally {
      inFlight = false;
    }
  };

  void beat();
  const timer = setInterval(() => void beat(), config.readiness.heartbeatMs);
  timer.unref?.();
  logger.info(`[NOVA RUNTIME] heartbeat enabled node=${state.node_id} interval=${config.readiness.heartbeatMs}ms`);

  return async () => {
    stopped = true;
    state.running = false;
    clearInterval(timer);
    try {
      await writeHeartbeat("offline");
    } catch (error) {
      state.last_error = error instanceof Error ? error.message : "NOVA_RUNTIME_OFFLINE_HEARTBEAT_FAILED";
    }
  };
}
