import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

const forbidden = [
  { name: "OpenAI beta Assistants client", pattern: /\.beta\.assistants\b/ },
  { name: "OpenAI Assistants create call", pattern: /assistants\.create\s*\(/ },
  { name: "OpenAI Threads Runs API", pattern: /threads\.runs\b/ },
  { name: "Assistants REST endpoint", pattern: /\/v1\/assistants\b/ },
  { name: "assistant_id request field", pattern: /\bassistant_id\b/ },
];

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [target] : [];
  }));
  return nested.flat();
}

test("NOVA source does not reintroduce the deprecated OpenAI Assistants API", async () => {
  const violations = [];

  for (const file of await sourceFiles(ROOT)) {
    const source = await readFile(file, "utf8");
    for (const rule of forbidden) {
      if (rule.pattern.test(source)) {
        violations.push(`${path.relative(ROOT, file)}: ${rule.name}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Deprecated Assistants API usage detected. Use the OpenAI Responses API instead:\n${violations.join("\n")}`,
  );
});
