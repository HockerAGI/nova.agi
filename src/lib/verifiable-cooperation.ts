import type { AgiKey, Intent, JsonObject } from "../types.js";
import { sendAgiMessage, type AgiMessagePriority } from "./ia-ia-protocol.js";
import {
  enqueueAgiTask,
  type AgiTaskPriority,
  type AgiTaskWritePolicy,
  type AgiTaskRow,
} from "./agi-work-queue.js";

function priorityForMessage(priority: AgiMessagePriority): AgiTaskPriority {
  return priority;
}

export async function requestVerifiableCooperation(params: {
  from_agi: AgiKey | string;
  to_agi: AgiKey | string;
  intent: Intent;
  subject: string;
  body: string;
  context?: JsonObject | null;
  thread_id?: string | null;
  project_id?: string;
  trace_id?: string;
  priority?: AgiMessagePriority;
  write_policy?: AgiTaskWritePolicy;
  idempotency_key?: string;
  max_attempts?: number;
}): Promise<{
  ok: boolean;
  message_id: string | null;
  task_id: string | null;
  task: AgiTaskRow | null;
  created: boolean;
  error?: string;
}> {
  const projectId = params.project_id ?? "hocker-one";
  const message = await sendAgiMessage({
    from_agi: params.from_agi,
    to_agi: params.to_agi,
    type: "request",
    priority: params.priority ?? "normal",
    subject: params.subject,
    body: params.body,
    context: {
      ...(params.context ?? {}),
      intent: params.intent,
      cooperation: true,
      verifiable_worker_required: true,
    },
    thread_id: params.thread_id ?? null,
    requires_response: true,
    response_deadline_ms: 5 * 60_000,
    project_id: projectId,
  });

  if (!message.ok || !message.message_id) {
    return {
      ok: false,
      message_id: message.message_id,
      task_id: null,
      task: null,
      created: false,
      error: message.error ?? "AGI_MESSAGE_NOT_RECORDED",
    };
  }

  try {
    const queued = await enqueueAgiTask({
      project_id: projectId,
      agi_id: String(params.to_agi),
      title: params.subject,
      details: params.body,
      task_type: params.intent,
      priority: priorityForMessage(params.priority ?? "normal"),
      input: {
        ...(params.context ?? {}),
        request_body: params.body,
        from_agi: String(params.from_agi),
        to_agi: String(params.to_agi),
        intent: params.intent,
      },
      request_id: message.message_id,
      trace_id: params.trace_id,
      parent_message_id: message.message_id,
      write_policy: params.write_policy ?? "draft_only",
      requires_approval: false,
      idempotency_key: params.idempotency_key,
      max_attempts: params.max_attempts,
    });

    return {
      ok: true,
      message_id: message.message_id,
      task_id: queued.task.id,
      task: queued.task,
      created: queued.created,
    };
  } catch (error) {
    return {
      ok: false,
      message_id: message.message_id,
      task_id: null,
      task: null,
      created: false,
      error: error instanceof Error ? error.message : "AGI_TASK_ENQUEUE_FAILED",
    };
  }
}
