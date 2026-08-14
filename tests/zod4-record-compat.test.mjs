import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Zod 4 record schemas declare explicit string key schemas", async () => {
  const app = await read("src/app.ts");
  const workers = await read("src/routes/agi-workers.ts");

  assert.match(app, /context_data:\s*z\.record\(z\.string\(\),\s*z\.unknown\(\)\)/);
  assert.match(workers, /context:\s*z\.record\(z\.string\(\),\s*z\.unknown\(\)\)\.default\(\{\}\)/);
  assert.doesNotMatch(app, /z\.record\(z\.unknown\(\)\)/);
  assert.doesNotMatch(workers, /z\.record\(z\.unknown\(\)\)/);
});
