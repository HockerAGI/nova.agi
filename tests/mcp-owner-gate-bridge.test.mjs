import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("NOVA returns normalized MCP drafts instead of executing writes", async () => {
  const helper = await read("src/lib/mcp-owner-gate-drafts.ts");
  const app = await read("src/app.ts");

  assert.match(helper, /execution_target: "hocker\.one\.owner-gate"/);
  assert.match(helper, /requires_approval: true/);
  assert.match(helper, /SENSITIVE_KEY/);
  assert.match(app, /deferred_actions: deferredMcpActions/);
  assert.match(app, /collectDeferredMcpOwnerGateDrafts/);
});
