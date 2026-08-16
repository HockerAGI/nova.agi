import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("NOVA continuity contract points agents to durable handoff and shared Context Bridge", async () => {
  const agents = await source("AGENTS.md");
  const continuity = await source("docs/CONTINUITY.md");
  assert.match(agents, /docs\/CONTINUITY\.md/);
  assert.match(agents, /Context Bridge/);
  assert.match(continuity, /exact commit SHA/i);
  assert.match(continuity, /next intended action/i);
  assert.match(continuity, /raw chats/i);
});

test("NOVA live-state contract requires executable readiness plus exact deployment evidence", async () => {
  const index = await source("src/index.ts");
  const railway = JSON.parse(await source("railway.json"));
  const continuity = await source("docs/CONTINUITY.md");
  assert.match(index, /app\.get\("\/health\/ready"/);
  assert.equal(railway.deploy?.healthcheckPath, "/health/ready");
  assert.match(continuity, /dedicated live Railway deployment.*not.*proven/i);
  assert.match(continuity, /exact deployed Git SHA/i);
});

test("NOVA general CI skips Markdown-only changes but keeps runtime changes protected", async () => {
  const workflow = await source(".github/workflows/ci.yml");
  assert.match(workflow, /paths-ignore:/);
  assert.match(workflow, /"\*\*\/\*\.md"/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run build/);
});
