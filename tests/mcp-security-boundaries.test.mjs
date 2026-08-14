import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Supabase MCP restricts service-role reads and blocks local mutations", async () => {
  const source = await read("src/lib/mcp/mcp-supabase.ts");

  assert.match(source, /DEFAULT_READ_TABLES/);
  assert.match(source, /NOVA_SUPABASE_READ_TABLES/);
  assert.match(source, /MAX_READ_LIMIT = 100/);
  assert.match(source, /MCP_MUTATION_REQUIRES_HOCKER_ONE_OWNER_GATE/);
  assert.match(source, /new URLSearchParams\(filter\)/);
  assert.doesNotMatch(source, /limit \?\? 50\)\), 1\), 1000/);
});

test("GitHub MCP uses Hocker ONE-compatible contracts and repository allowlist", async () => {
  const connector = await read("src/lib/mcp/mcp-github.ts");
  const calling = await read("src/lib/mcp-tool-calling.ts");

  assert.match(connector, /create_or_update_file/);
  assert.match(connector, /create_pull_request/);
  assert.match(connector, /NOVA_GITHUB_ALLOWED_REPOS/);
  assert.match(connector, /HockerAGI\/hocker\.one/);
  assert.match(connector, /HockerAGI\/nova\.agi/);
  assert.match(connector, /HockerAGI\/hocker-node-agent/);
  assert.match(connector, /HockerAGI\/chido\.casino/);
  assert.match(connector, /HockerAGI\/hocker\.agi/);
  assert.match(connector, /HockerAGI\/hocker\.ads/);
  assert.match(connector, /HockerAGI\/chido\.lab/);
  assert.match(connector, /HockerAGI\/chido\.games/);
  assert.match(connector, /MCP_MUTATION_REQUIRES_HOCKER_ONE_OWNER_GATE/);
  assert.match(calling, /github\\\.\(get_repository\|list_tree\|get_file_contents/);
});

test("MCP tool calls have bounded count and argument size", async () => {
  const source = await read("src/lib/mcp-tool-calling.ts");

  assert.match(source, /MAX_TOOL_CALLS = 8/);
  assert.match(source, /MAX_TOOL_ARGS_BYTES = 16 \* 1024/);
  assert.match(source, /MCP_MUTATION_NOT_AUTHORIZED/);
  assert.match(source, /calls\.slice\(0, MAX_TOOL_CALLS\)/);
});
