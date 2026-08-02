import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("boolean environment switches do not use JavaScript truthiness coercion", async () => {
  const config = await read("src/config.ts");

  assert.doesNotMatch(config, /z\.coerce\.boolean\(\)/);
  assert.match(config, /\["0", "false", "no", "off", ""\]/);
  assert.match(config, /OLLAMA_ENABLED: strictBoolean\.default\(false\)/);
  assert.match(config, /MCP_ENABLED: strictBoolean\.default\(true\)/);
  assert.match(config, /NOVA_MIRROR_NODE_ENABLED: strictBoolean\.default\(true\)/);
});

test("Railway promotes only a dependency-aware NOVA runtime", async () => {
  const railway = JSON.parse(await read("railway.json"));
  const index = await read("src/index.ts");
  const readiness = await read("src/lib/runtime-readiness.ts");

  assert.equal(railway.deploy.healthcheckPath, "/health/ready");
  assert.match(index, /app\.get\("\/health\/ready"/);
  assert.match(index, /getNovaRuntimeReadiness/);
  assert.match(index, /reply\.code\(readiness\.ok \? 200 : 503\)/);
  assert.match(readiness, /NO_PROVIDER_CONFIGURED/);
  assert.match(readiness, /AGI_WORKER_DISABLED/);
  assert.match(readiness, /DATABASE_TIMEOUT/);
});

test("NOVA writes a real runtime heartbeat without exposing secrets", async () => {
  const heartbeat = await read("src/lib/runtime-heartbeat.ts");
  const index = await read("src/index.ts");

  assert.match(heartbeat, /from\("nodes"\)\.upsert/);
  assert.match(heartbeat, /last_seen_at: now/);
  assert.match(heartbeat, /status: "online"|writeHeartbeat\(status\)/);
  assert.match(heartbeat, /writeHeartbeat\("offline"\)/);
  assert.match(index, /startNovaRuntimeHeartbeat/);
  assert.doesNotMatch(heartbeat, /SUPABASE_SERVICE_ROLE_KEY|NOVA_ORCHESTRATOR_KEY|GITHUB_TOKEN/);
});

test("deployment documentation compiles before pruning dev dependencies", async () => {
  const deployment = await read("DEPLOYMENT.md");

  assert.match(deployment, /npm ci\n/);
  assert.match(deployment, /npm run build/);
  assert.match(deployment, /npm prune --omit=dev/);
  assert.doesNotMatch(deployment, /npm ci --production\n(?:.|\n)*npm run build/);
});
