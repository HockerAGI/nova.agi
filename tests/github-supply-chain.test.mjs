import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("repository declares ownership, dependency updates and private security reporting", async () => {
  for (const path of [".github/CODEOWNERS", ".github/dependabot.yml", "SECURITY.md"]) {
    assert.ok((await read(path)).trim().length > 0, `${path} must exist`);
  }
});

test("all external GitHub Actions are pinned to immutable commit SHAs", async () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => /\.ya?ml$/i.test(name));
  const violations = [];
  for (const file of files) {
    for (const [index, line] of (await read(`.github/workflows/${file}`)).split("\n").entries()) {
      const match = line.match(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
      if (!match) continue;
      const ref = match[1];
      if (ref.startsWith("./") || ref.startsWith("docker://")) continue;
      if (!/@[0-9a-f]{40}$/i.test(ref)) violations.push(`${file}:${index + 1}: ${ref}`);
    }
  }
  assert.deepEqual(violations, [], `Unpinned actions:\n${violations.join("\n")}`);
});

test("checkout never persists workflow credentials", async () => {
  for (const file of (await readdir(new URL("../.github/workflows/", import.meta.url))).filter((name) => /\.ya?ml$/i.test(name))) {
    const source = await read(`.github/workflows/${file}`);
    if (!/actions\/checkout@/i.test(source)) continue;
    assert.match(source, /persist-credentials:\s*false/);
  }
});
