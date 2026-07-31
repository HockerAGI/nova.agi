import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Intent, JsonObject } from "../types.js";
import {
  getAgiTask,
  getAgiWorkerReadiness,
  recoverStaleAgiTasks,
} from "../lib/agi-work-queue.js";
import { runOneAgiTask } from "../lib/agi-worker-runtime.js";
import { requestVerifiableCooperation } from "../lib/verifiable-cooperation.js";

const IntentSchema = z.enum(["general", "code", "ops", "finance", "social", "research"]);
const PrioritySchema = z.enum(["low", "normal", "high", "critical"]);
const WritePolicySchema = z.enum(["read_only", "draft_only", "owner_gate"]);

const CreateTaskSchema = z.object({
  project_id: z.string().min(1).default("hocker-one"),
  from_agi: z.string().min(1).default("NOVA"),
  to_agi: z.string().min(1),
  intent: IntentSchema.default("general"),
  subject: z.string().min(1).max(240),
  body: z.string().min(1).max(20_000),
  context: z.record(z.unknown()).default({}),
  thread_id: z.string().uuid().nullable().optional(),
  trace_id: z.string().max(240).optional(),
  priority: PrioritySchema.default("normal"),
  write_policy: WritePolicySchema.default("draft_only"),
  idempotency_key: z.string().min(8).max(240).optional(),
  max_attempts: z.number().int().min(1).max(10).default(3),
});

const RunOnceSchema = z.object({
  project_id: z.string().min(1).default("hocker-one"),
  worker_id: z.string().min(3).max(240),
  assigned_agi: z.string().min(1).nullable().optional(),
});

const RecoverSchema = z.object({
  project_id: z.string().min(1).default("hocker-one"),
});

export async function agiWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/agi/workers/status", async () => {
    const readiness = await getAgiWorkerReadiness();
    return {
      ok: true,
      service: "nova.agi.verifiable-workers",
      schema_ready: readiness.ready,
      reason: readiness.reason,
      execution_policy: {
        direct_external_writes: false,
        external_tools_in_worker: false,
        action_drafts_require_owner_gate: true,
      },
    };
  });

  app.post("/api/v1/agi/tasks", async (request, reply) => {
    const parsed = CreateTaskSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: "INVALID_AGI_TASK",
        issues: parsed.error.flatten(),
      });
    }

    const body = parsed.data;
    const result = await requestVerifiableCooperation({
      from_agi: body.from_agi,
      to_agi: body.to_agi,
      intent: body.intent as Intent,
      subject: body.subject,
      body: body.body,
      context: body.context as JsonObject,
      thread_id: body.thread_id ?? null,
      project_id: body.project_id,
      priority: body.priority,
      write_policy: body.write_policy,
      max_attempts: body.max_attempts,
      ...(body.trace_id ? { trace_id: body.trace_id } : {}),
      ...(body.idempotency_key ? { idempotency_key: body.idempotency_key } : {}),
    });

    return reply.status(result.ok ? (result.created ? 201 : 200) : 503).send(result);
  });

  app.get<{ Params: { taskId: string }; Querystring: { project_id?: string } }>(
    "/api/v1/agi/tasks/:taskId",
    async (request, reply) => {
      const projectId = String(request.query.project_id ?? "hocker-one").trim();
      const taskId = String(request.params.taskId ?? "").trim();
      if (!projectId || !taskId) {
        return reply.status(400).send({ ok: false, error: "project_id and taskId are required" });
      }

      const task = await getAgiTask(projectId, taskId);
      if (!task) return reply.status(404).send({ ok: false, error: "AGI_TASK_NOT_FOUND" });
      return reply.send({ ok: true, task });
    },
  );

  app.post("/api/v1/agi/workers/run-once", async (request, reply) => {
    const parsed = RunOnceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: "INVALID_AGI_WORKER_REQUEST",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const result = await runOneAgiTask({
        project_id: parsed.data.project_id,
        worker_id: parsed.data.worker_id,
        assigned_agi: parsed.data.assigned_agi ?? null,
      });
      return reply.send({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AGI_WORKER_FAILED";
      const schemaMissing = message === "AGI_WORKER_SCHEMA_NOT_READY";
      return reply.status(schemaMissing ? 503 : 500).send({
        ok: false,
        error: message,
      });
    }
  });

  app.post("/api/v1/agi/workers/recover-stale", async (request, reply) => {
    const parsed = RecoverSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: "INVALID_AGI_RECOVERY_REQUEST",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const recovered = await recoverStaleAgiTasks(parsed.data.project_id);
      return reply.send({ ok: true, recovered });
    } catch (error) {
      return reply.status(503).send({
        ok: false,
        error: error instanceof Error ? error.message : "AGI_RECOVERY_FAILED",
      });
    }
  });
}
