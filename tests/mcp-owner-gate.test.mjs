import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mutating MCP calls always require Hocker ONE Owner Gate", async () => {
  const source = await read("src/lib/mcp-tool-calling.ts");

  assert.match(source, /MCP_MUTATION_REQUIRES_HOCKER_ONE_OWNER_GATE/);
  assert.match(source, /execution_target: "hocker\.one\.owner-gate"/);
  assert.doesNotMatch(source, /!readOnly && !opts\.allowActions/);
});

test("generic Supabase RPC calls are never classified as read-only", async () => {
  const source = await read("src/lib/mcp-tool-calling.ts");

  assert.doesNotMatch(source, /rpc\\\.call/);
  assert.match(source, /Generic RPC calls/);
});
