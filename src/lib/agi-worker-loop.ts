import { recoverStaleAgiTasks } from "./agi-work-queue.js";
import { runOneAgiTaskAndRespond } from "./agi-worker-cycle.js";

type WorkerLoopLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type AgiWorkerLoopState = {
  enabled: boolean;
  running: boolean;
  worker_id: string;
  project_id: string;
  assigned_agi: string | null;
  interval_ms: number;
  last_tick_at: string | null;
  last_task_id: string | null;
  last_result_hash: string | null;
  last_error: string | null;
};

const state: AgiWorkerLoopState = {
  enabled: false,
  running: false,
  worker_id: "nova-worker-1",
  project_id: "hocker-one",
  assigned_agi: null,
  interval_ms: 30_000,
  last_tick_at: null,
  last_task_id: null,
  last_result_hash: null,
  last_error: null,
};

function envBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function envInterval(value: string | undefined): number {
  const parsed = Number(value ?? 30_000);
  if (!Number.isFinite(parsed)) return 30_000;
  return Math.min(5 * 60_000, Math.max(10_000, Math.round(parsed)));
}

export function getAgiWorkerLoopState(): AgiWorkerLoopState {
  return { ...state };
}

export function startAgiWorkerLoop(logger: WorkerLoopLogger): () => void {
  state.enabled = envBoolean(process.env.NOVA_AGI_WORKER_ENABLED, false);
  state.worker_id = String(process.env.NOVA_AGI_WORKER_ID ?? "nova-worker-1").trim() || "nova-worker-1";
  state.project_id = String(process.env.NOVA_AGI_WORKER_PROJECT_ID ?? "hocker-one").trim() || "hocker-one";
  state.assigned_agi = String(process.env.NOVA_AGI_WORKER_ASSIGNED_AGI ?? "").trim().toLowerCase() || null;
  state.interval_ms = envInterval(process.env.NOVA_AGI_WORKER_INTERVAL_MS);

  if (!state.enabled) {
    logger.info("[NOVA AGI WORKER] automatic loop disabled; authenticated run-once remains available");
    return () => undefined;
  }

  let stopped = false;
  let inFlight = false;
  let tickCount = 0;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    state.running = true;
    state.last_tick_at = new Date().toISOString();
    tickCount += 1;

    try {
      if (tickCount === 1 || tickCount % 20 === 0) {
        const recovered = await recoverStaleAgiTasks(state.project_id);
        if (recovered > 0) logger.warn(`[NOVA AGI WORKER] recovered ${recovered} stale task locks`);
      }

      const result = await runOneAgiTaskAndRespond({
        project_id: state.project_id,
        worker_id: state.worker_id,
        assigned_agi: state.assigned_agi,
      });

      if (result.processed && result.task) {
        state.last_task_id = result.task.id;
        state.last_result_hash = result.task.result_hash;
        logger.info(`[NOVA AGI WORKER] completed task ${result.task.id} with evidence`);
      }
      state.last_error = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AGI_WORKER_LOOP_FAILED";
      state.last_error = message;
      if (message === "AGI_WORKER_SCHEMA_NOT_READY") {
        logger.warn("[NOVA AGI WORKER] schema not ready; loop remains fail-closed");
      } else {
        logger.error(`[NOVA AGI WORKER] ${message}`);
      }
    } finally {
      state.running = false;
      inFlight = false;
    }
  };

  void tick();
  const timer = setInterval(() => { void tick(); }, state.interval_ms);
  timer.unref?.();

  logger.info(
    `[NOVA AGI WORKER] loop enabled worker=${state.worker_id} project=${state.project_id} interval=${state.interval_ms}ms`,
  );

  return () => {
    stopped = true;
    clearInterval(timer);
    state.running = false;
  };
}
