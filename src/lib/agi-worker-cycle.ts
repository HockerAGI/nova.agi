import type { JsonObject } from "../types.js";
import { sendAgiMessage } from "./ia-ia-protocol.js";
import { runOneAgiTask } from "./agi-worker-runtime.js";

function resultSummary(output: JsonObject): string {
  const summary = typeof output.summary === "string" ? output.summary.trim() : "";
  return summary || "El trabajador terminó la tarea y guardó evidencia verificable.";
}

export async function runOneAgiTaskAndRespond(params: {
  project_id: string;
  worker_id: string;
  assigned_agi?: string | null;
}): Promise<Awaited<ReturnType<typeof runOneAgiTask>> & { response_message_id: string | null }> {
  const result = await runOneAgiTask(params);
  if (!result.processed || !result.task || !result.run_id) {
    return { ...result, response_message_id: null };
  }

  const task = result.task;
  const response = await sendAgiMessage({
    from_agi: task.agi_id ?? task.assigned_to ?? "NOVA",
    to_agi: "NOVA",
    type: "response",
    priority: task.priority === "critical" ? "critical" : task.priority === "high" ? "high" : "normal",
    subject: `Resultado verificable: ${task.title}`,
    body: resultSummary(task.output),
    context: {
      verifiable_worker_response: true,
      request_message_id: task.request_id,
      parent_message_id: task.parent_message_id,
      task_id: task.id,
      run_id: result.run_id,
      result_hash: task.result_hash,
      provider: result.provider,
      model: result.model,
      evidence: task.evidence,
      output: task.output,
    },
    requires_response: false,
    project_id: task.project_id,
  }).catch(() => ({ ok: false, message_id: null }));

  return {
    ...result,
    response_message_id: response.message_id,
  };
}
