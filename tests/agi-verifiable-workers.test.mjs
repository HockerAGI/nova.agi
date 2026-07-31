import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("IA-to-IA requests create a correlatable task", async () => {
  const cooperation = await read("src/lib/verifiable-cooperation.ts");
  const queue = await read("src/lib/agi-work-queue.ts");

  assert.match(cooperation, /sendAgiMessage/);
  assert.match(cooperation, /enqueueAgiTask/);
  assert.match(cooperation, /message_id: message\.message_id/);
  assert.match(cooperation, /task_id: queued\.task\.id/);
  assert.match(queue, /idempotency_key/);
  assert.match(queue, /claim_next_agi_task/);
  assert.match(queue, /complete_agi_task/);
  assert.match(queue, /fail_agi_task/);
});

test("specialized workers produce evidence and never execute external writes", async () => {
  const runtime = await read("src/lib/agi-worker-runtime.ts");

  assert.match(runtime, /No eres una conciencia demostrada/);
  assert.match(runtime, /No ejecutes APIs, comandos, pagos, despliegues, cambios de archivos ni acciones externas/);
  assert.match(runtime, /requires_owner_gate: true/);
  assert.match(runtime, /direct_writes_executed: false/);
  assert.match(runtime, /external_tools_executed: false/);
  assert.match(runtime, /hashAgiArtifact/);
  assert.match(runtime, /finishAgiRun/);
  assert.match(runtime, /completeAgiTask/);
  assert.doesNotMatch(runtime, /executeTool\(/);
  assert.doesNotMatch(runtime, /enqueueActions\(/);
});

test("worker endpoints are registered behind NOVA server authentication", async () => {
  const routes = await read("src/routes/agi-workers.ts");
  const entry = await read("src/index.ts");
  const app = await read("src/app.ts");

  assert.match(routes, /\/api\/v1\/agi\/workers\/status/);
  assert.match(routes, /\/api\/v1\/agi\/tasks/);
  assert.match(routes, /\/api\/v1\/agi\/workers\/run-once/);
  assert.match(routes, /\/api\/v1\/agi\/workers\/recover-stale/);
  assert.match(entry, /app\.register\(agiWorkerRoutes\)/);
  assert.match(app, /app\.addHook\("preHandler"/);
  assert.match(app, /safeBearerEquals/);
});

test("provider exhaustion fails honestly and local providers remain eligible", async () => {
  const runtime = await read("src/lib/agi-worker-runtime.ts");

  assert.match(runtime, /providersWithinBudget/);
  assert.match(runtime, /config\.providerRouting\.fallbacks/);
  assert.match(runtime, /ollamaRespond/);
  assert.match(runtime, /AGI_WORKER_ALL_PROVIDER_BUDGETS_EXHAUSTED/);
  assert.doesNotMatch(runtime, /buildSurvivalCompletion/);
});
