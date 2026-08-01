import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Railway NOVA keeps the legacy command queue disabled by default", async () => {
  const actions = await read("src/lib/actions.ts");
  const env = await read("env.example");

  assert.match(actions, /NOVA_LEGACY_COMMAND_QUEUE_ENABLED/);
  assert.match(actions, /if \(!legacyCommandQueueEnabled\(\)\) \{\s*return \[\];/s);
  assert.match(actions, /deferred MCP drafts/);
  assert.match(env, /NOVA_LEGACY_COMMAND_QUEUE_ENABLED=false/);
});

test("NOVA preserves Hocker ONE as the productive mutation authority", async () => {
  const actions = await read("src/lib/actions.ts");
  const ownerGateDrafts = await read("src/lib/mcp-owner-gate-drafts.ts");

  assert.match(actions, /Hocker ONE materializes them only after role checks and Owner Gate review/);
  assert.match(ownerGateDrafts, /execution_target: "hocker\.one\.owner-gate"/);
  assert.match(ownerGateDrafts, /requires_approval: true/);
});
