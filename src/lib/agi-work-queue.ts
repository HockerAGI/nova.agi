import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "./supabase.js";
import type { JsonObject, JsonValue } from "../types.js";

export type AgiTaskStatus = "queued" | "working" | "completed" | "failed" | "canceled";
export type AgiTaskPriority = "low" | "normal" | "high" | "critical";
export type AgiTaskWritePolicy = "read_only" | "draft_only" | "owner_gate";

export type AgiTaskRow = {
  id: string;
  project_id: string;
  agi_id: string | null;
  title: string;
  details: string | null;
  status: AgiTaskStatus | string;
  priority: AgiTaskPriority | string;
  payload: JsonObject;
  input: JsonObject;
  output: JsonObject;
  evidence: JsonValue[];
  error: string | null;
  task_type: string;
  assigned_to: string | null;
  request_id: string | null;
  trace_id: string | null;
  parent_message_id: string | null;
  requires_approval: boolean;
  write_policy: AgiTaskWritePolicy;
  attempt_count: number;
  max_attempts: number;
  locked_at: string | null;
  lock_owner: string | null;
  started_at: string | null;
  last_heartbeat_at: string | null;
  completed_at: string | null;
  idempotency_key: string | null;
  result_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type AgiRunRow = {
  id: string;
  project_id: string;
  agi_id: string | null;
  task_id: string | null;
  status: string;
  input: JsonObject;
  output: JsonObject;
  evidence: JsonValue[];
  error: string | null;
  trace_id: string | null;
  provider: string | null;
  model: string | null;
  attempt: number;
  result_hash: string | null;
  worker_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type UntypedSupabase = SupabaseClient<any, "public", any>;

function db(): UntypedSupabase {
  return createAdminSupabase() as unknown as UntypedSupabase;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function asEvidence(value: unknown): JsonValue[] {
  return Array.isArray(value) ? (value as JsonValue[]) : [];
}

function normalizeTask(value: unknown): AgiTaskRow {
  const row = asObject(value);
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    agi_id: typeof row.agi_id === "string" ? row.agi_id : null,
    title: String(row.title ?? ""),
    details: typeof row.details === "string" ? row.details : null,
    status: String(row.status ?? "queued"),
    priority: String(row.priority ?? "normal"),
    payload: asObject(row.payload),
    input: asObject(row.input),
    output: asObject(row.output),
    evidence: asEvidence(row.evidence),
    error: typeof row.error === "string" ? row.error : null,
    task_type: String(row.task_type ?? "analysis"),
    assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : null,
    request_id: typeof row.request_id === "string" ? row.request_id : null,
    trace_id: typeof row.trace_id === "string" ? row.trace_id : null,
    parent_message_id: typeof row.parent_message_id === "string" ? row.parent_message_id : null,
    requires_approval: row.requires_approval === true,
    write_policy: row.write_policy === "read_only" || row.write_policy === "owner_gate"
      ? row.write_policy
      : "draft_only",
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    locked_at: typeof row.locked_at === "string" ? row.locked_at : null,
    lock_owner: typeof row.lock_owner === "string" ? row.lock_owner : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    last_heartbeat_at: typeof row.last_heartbeat_at === "string" ? row.last_heartbeat_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    idempotency_key: typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    result_hash: typeof row.result_hash === "string" ? row.result_hash : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function normalizeRun(value: unknown): AgiRunRow {
  const row = asObject(value);
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    agi_id: typeof row.agi_id === "string" ? row.agi_id : null,
    task_id: typeof row.task_id === "string" ? row.task_id : null,
    status: String(row.status ?? "created"),
    input: asObject(row.input),
    output: asObject(row.output),
    evidence: asEvidence(row.evidence),
    error: typeof row.error === "string" ? row.error : null,
    trace_id: typeof row.trace_id === "string" ? row.trace_id : null,
    provider: typeof row.provider === "string" ? row.provider : null,
    model: typeof row.model === "string" ? row.model : null,
    attempt: Number(row.attempt ?? 1),
    result_hash: typeof row.result_hash === "string" ? row.result_hash : null,
    worker_id: typeof row.worker_id === "string" ? row.worker_id : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    finished_at: typeof row.finished_at === "string" ? row.finished_at : null,
    created_at: String(row.created_at ?? ""),
  };
}

function schemaError(error: { message?: string; code?: string } | null): Error {
  const message = String(error?.message ?? "AGI worker storage failed");
  const missingSchema =
    error?.code === "PGRST202" ||
    error?.code === "PGRST204" ||
    message.includes("claim_next_agi_task") ||
    message.includes("request_id") ||
    message.includes("schema cache");

  return new Error(missingSchema ? "AGI_WORKER_SCHEMA_NOT_READY" : message);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stable(child)]),
  );
}

export function hashAgiArtifact(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export async function enqueueAgiTask(params: {
  project_id: string;
  agi_id: string;
  title: string;
  details?: string;
  task_type?: string;
  priority?: AgiTaskPriority;
  input?: JsonObject;
  request_id?: string;
  trace_id?: string;
  parent_message_id?: string | null;
  write_policy?: AgiTaskWritePolicy;
  requires_approval?: boolean;
  max_attempts?: number;
  idempotency_key?: string;
}): Promise<{ task: AgiTaskRow; created: boolean }> {
  const projectId = params.project_id.trim();
  const agiId = params.agi_id.trim().toLowerCase();
  const title = params.title.trim();
  if (!projectId || !agiId || !title) throw new Error("project_id, agi_id and title are required");

  const requestId = params.request_id?.trim() || randomUUID();
  const input = params.input ?? {};
  const idempotencyKey = params.idempotency_key?.trim() || hashAgiArtifact({
    project_id: projectId,
    agi_id: agiId,
    title,
    input,
    request_id: requestId,
  });

  const { data: existing, error: existingError } = await db()
    .from("agi_tasks")
    .select("*")
    .eq("project_id", projectId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) throw schemaError(existingError);
  if (existing) return { task: normalizeTask(existing), created: false };

  const { data, error } = await db()
    .from("agi_tasks")
    .insert({
      project_id: projectId,
      agi_id: agiId,
      assigned_to: agiId,
      title,
      details: params.details?.trim() || null,
      task_type: params.task_type?.trim() || "analysis",
      status: "queued",
      priority: params.priority ?? "normal",
      payload: input,
      input,
      output: {},
      evidence: [],
      request_id: requestId,
      trace_id: params.trace_id?.trim() || null,
      parent_message_id: params.parent_message_id ?? null,
      requires_approval: params.requires_approval === true,
      write_policy: params.write_policy ?? "draft_only",
      attempt_count: 0,
      max_attempts: Math.min(10, Math.max(1, params.max_attempts ?? 3)),
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();

  if (error || !data) throw schemaError(error);
  return { task: normalizeTask(data), created: true };
}

export async function getAgiTask(projectId: string, taskId: string): Promise<AgiTaskRow | null> {
  const { data, error } = await db()
    .from("agi_tasks")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw schemaError(error);
  return data ? normalizeTask(data) : null;
}

export async function claimNextAgiTask(params: {
  project_id: string;
  worker_id: string;
  assigned_agi?: string | null;
}): Promise<AgiTaskRow | null> {
  const { data, error } = await db().rpc("claim_next_agi_task", {
    p_project_id: params.project_id,
    p_worker_id: params.worker_id,
    p_assigned_agi: params.assigned_agi ?? null,
  });

  if (error) throw schemaError(error);
  const first = Array.isArray(data) ? data[0] : null;
  return first ? normalizeTask(first) : null;
}

export async function heartbeatAgiTask(taskId: string, workerId: string): Promise<boolean> {
  const { data, error } = await db().rpc("heartbeat_agi_task", {
    p_task_id: taskId,
    p_worker_id: workerId,
  });
  if (error) throw schemaError(error);
  return data === true;
}

export async function createAgiRun(params: {
  task: AgiTaskRow;
  worker_id: string;
}): Promise<AgiRunRow> {
  const { data, error } = await db()
    .from("agi_runs")
    .insert({
      project_id: params.task.project_id,
      agi_id: params.task.agi_id,
      task_id: params.task.id,
      status: "running",
      input: params.task.input,
      output: {},
      evidence: [],
      trace_id: params.task.trace_id,
      attempt: params.task.attempt_count,
      worker_id: params.worker_id,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) throw schemaError(error);
  return normalizeRun(data);
}

export async function finishAgiRun(params: {
  run_id: string;
  status: "completed" | "failed";
  output?: JsonObject;
  evidence?: JsonValue[];
  error?: string | null;
  provider?: string | null;
  model?: string | null;
  result_hash?: string | null;
}): Promise<void> {
  const { error } = await db()
    .from("agi_runs")
    .update({
      status: params.status,
      output: params.output ?? {},
      evidence: params.evidence ?? [],
      error: params.error ?? null,
      provider: params.provider ?? null,
      model: params.model ?? null,
      result_hash: params.result_hash ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.run_id);

  if (error) throw schemaError(error);
}

export async function completeAgiTask(params: {
  task_id: string;
  worker_id: string;
  output: JsonObject;
  evidence: JsonValue[];
  result_hash: string;
}): Promise<AgiTaskRow> {
  const { data, error } = await db().rpc("complete_agi_task", {
    p_task_id: params.task_id,
    p_worker_id: params.worker_id,
    p_output: params.output,
    p_evidence: params.evidence,
    p_result_hash: params.result_hash,
  });

  if (error) throw schemaError(error);
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) throw new Error("AGI_TASK_COMPLETION_LOCK_MISMATCH");
  return normalizeTask(first);
}

export async function failAgiTask(params: {
  task_id: string;
  worker_id: string;
  error: string;
  evidence?: JsonValue[];
}): Promise<AgiTaskRow> {
  const { data, error } = await db().rpc("fail_agi_task", {
    p_task_id: params.task_id,
    p_worker_id: params.worker_id,
    p_error: params.error,
    p_evidence: params.evidence ?? [],
  });

  if (error) throw schemaError(error);
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) throw new Error("AGI_TASK_FAILURE_LOCK_MISMATCH");
  return normalizeTask(first);
}

export async function recoverStaleAgiTasks(projectId: string): Promise<number> {
  const { data, error } = await db().rpc("recover_stale_agi_tasks", {
    p_project_id: projectId,
  });
  if (error) throw schemaError(error);
  return Number(data ?? 0);
}

export async function getAgiWorkerReadiness(): Promise<{ ready: boolean; reason: string | null }> {
  const { error } = await db().from("agi_tasks").select("id,request_id,result_hash").limit(1);
  if (!error) return { ready: true, reason: null };

  const translated = schemaError(error);
  return {
    ready: false,
    reason: translated.message,
  };
}
