import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

process.env.NODE_ENV = "production";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key-with-safe-length";
process.env.NOVA_ORCHESTRATOR_KEY = "test-orchestrator-key-with-safe-length";

const { default: vercelHandler } = await import("../src/adapters/vercel.ts");

async function withAdapterServer(run) {
  const server = createServer((request, response) => {
    void vercelHandler(request, response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("Vercel chat routes reject unauthenticated requests before processing payloads", async () => {
  await withAdapterServer(async (origin) => {
    const response = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "UNAUTHORIZED" });
  });
});
