import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const configSource = readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");

const SYNTHETIC_ENV = {
  ...process.env,
  NODE_ENV: "development",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key-for-test-only",
  NOVA_ORCHESTRATOR_KEY: "dummy-orchestrator-key-for-test-only",
};

test("NOVA config makes dotenv quiet mode explicit", () => {
  assert.match(configSource, /dotenv\.config\(\{\s*quiet:\s*true\s*\}\)/);
});

test("NOVA config bootstrap emits no dotenv stdout or stderr", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--eval", "import('./src/config.ts')"],
    {
      cwd: process.cwd(),
      env: SYNTHETIC_ENV,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
