import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("NOVA preserves real Codex mutation intent", async () => {
  const app = await read("src/app.ts");

  assert.doesNotMatch(app, /NOVA_NATURAL_EDIT_TEST\.md/);
  assert.doesNotMatch(app, /natural-docs-improvement/);
  assert.match(app, /if \(asksWrite\) return \[\];/);
  assert.match(app, /deferred to Hocker ONE Owner Gate/);
});

test("NOVA bounds chat inputs and cloaks every JSON chat route", async () => {
  const app = await read("src/app.ts");

  assert.match(app, /bodyLimit: 512 \* 1024/);
  assert.match(app, /project_id: z\.string\(\)\.regex/);
  assert.match(app, /message: z\.string\(\)\.min\(1\)\.max\(100_000\)/);
  assert.match(app, /\"\/api\/v1\/nova\/interact\"/);
});

test("Gemini and Anthropic report usage for budget accounting", async () => {
  const gemini = await read("src/providers/gemini.ts");
  const anthropic = await read("src/providers/anthropic.ts");

  assert.match(gemini, /usageMetadata/);
  assert.match(gemini, /promptTokenCount/);
  assert.match(gemini, /candidatesTokenCount/);
  assert.match(anthropic, /input_tokens/);
  assert.match(anthropic, /output_tokens/);
});
