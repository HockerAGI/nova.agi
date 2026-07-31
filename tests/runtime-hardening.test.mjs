import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("NOVA fails closed when controls are missing or unavailable", async () => {
  const app = await read("src/app.ts");
  assert.match(app, /control_status: "unavailable"/);
  assert.match(app, /control_status: "missing"/);
  assert.match(app, /kill_switch: true, allow_write: false/);
  assert.doesNotMatch(app, /catch \{\s*return \{ kill_switch: false, allow_write: false \}/);
});

test("NOVA enforces authenticated rate limiting", async () => {
  const app = await read("src/app.ts");
  const limiter = await read("src/lib/rate-limit.ts");
  assert.match(app, /createRequestRateLimiter/);
  assert.match(app, /RATE_LIMITED/);
  assert.match(app, /Retry-After/);
  assert.match(limiter, /createHash\("sha256"\)/);
  assert.doesNotMatch(limiter, /console\.log\(.*authorization/);
});

test("NOVA SSE emits lifecycle progress and sanitizes failures", async () => {
  const app = await read("src/app.ts");
  assert.match(app, /sse\("accepted"/);
  assert.match(app, /sse\("heartbeat"/);
  assert.match(app, /sse\("message"/);
  assert.match(app, /sse\("done"/);
  assert.match(app, /NOVA_STREAM_FAILED/);
  assert.doesNotMatch(app, /capturedBody = \{ ok: false, error: err instanceof Error \? err\.message/);
});

test("Langfuse shutdown is awaited", async () => {
  const app = await read("src/app.ts");
  assert.match(app, /await langfuse\?\.shutdownAsync/);
});
