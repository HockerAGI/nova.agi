import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
const load = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function probeEnv(extra) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
    `import { config, providerReady } from './src/config.ts';
     console.log(JSON.stringify({ local: config.localOnlyMode, ollama: providerReady('ollama'),
       openai: providerReady('openai'), gemini: providerReady('gemini'),
       anthropic: providerReady('anthropic'), base44: providerReady('base44') }));`,
  ], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000,
    env: { ...process.env, NODE_ENV: "development", SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "ci-test-not-a-real-service-role-key",
      OPENAI_API_KEY: "ci-openai-not-real", GEMINI_API_KEY: "ci-gemini-not-real",
      ANTHROPIC_API_KEY: "ci-anthropic-not-real", BASE44_API_KEY: "ci-base44-not-real",
      ...extra } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("local-only runtime denies every cloud provider even if keys are configured", () => {
  assert.deepEqual(probeEnv({ NOVA_LOCAL_ONLY_MODE: "true", OLLAMA_ENABLED: "true" }), {
    local: true, ollama: true, openai: false, gemini: false, anthropic: false, base44: false,
  });
});

test("local-only runtime fails closed when Ollama is disabled", () => {
  assert.deepEqual(probeEnv({ NOVA_LOCAL_ONLY_MODE: "true", OLLAMA_ENABLED: "false" }), {
    local: true, ollama: false, openai: false, gemini: false, anthropic: false, base44: false,
  });
});

test("unchanged default routing still permits previously configured cloud providers", () => {
  const result = probeEnv({ NOVA_LOCAL_ONLY_MODE: "false", OLLAMA_ENABLED: "false" });
  assert.equal(result.local, false);
  assert.equal(result.openai, true);
  assert.equal(result.gemini, true);
});

test("readiness is fail-closed for missing model and stale heartbeat", async () => {
  const code = await load("src/lib/runtime-readiness.ts");
  const app = await load("src/app.ts");
  assert.match(code, /\/api\/tags/);
  assert.match(code, /LOCAL_MODEL_UNAVAILABLE/);
  assert.match(code, /HEARTBEAT_NOT_FRESH/);
  assert.match(code, /database\.ok && inferenceReady && workerRequirementSatisfied && heartbeatReady/);
  assert.match(app, /if \(config\.localOnlyMode\) \{[^}]*throw new Error\("NOVA_LOCAL_MODEL_UNAVAILABLE"\)/);
});
