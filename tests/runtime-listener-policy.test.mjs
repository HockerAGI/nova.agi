import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("NOVA listener fails closed outside loopback without orchestrator key", async () => {
  const policy = await read("src/lib/runtime-listener.ts");
  const entrypoint = await read("src/index.ts");

  assert.match(policy, /NOVA_ORCHESTRATOR_KEY/);
  assert.match(policy, /isLoopbackHost/);
  assert.match(policy, /se niega a escuchar fuera de loopback/);
  assert.match(entrypoint, /resolveNovaListenHost/);
  assert.doesNotMatch(entrypoint, /host:\s*"0\.0\.0\.0"/);
});
