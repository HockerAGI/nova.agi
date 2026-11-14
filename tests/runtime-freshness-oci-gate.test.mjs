import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasFreshSuccessfulWorkerTick } from "../src/lib/worker-tick-freshness.ts";

const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");

test("dedicated NOVA worker readiness requires a recent successful tick", () => {
  const now = Date.parse("2026-11-14T03:00:00.000Z");
  const ts = (difference) => new Date(now - difference).toISOString();
  assert.equal(hasFreshSuccessfulWorkerTick(ts(0),30_000,now),true);
  assert.equal(hasFreshSuccessfulWorkerTick(ts(89_999),30_000,now),true);
  assert.equal(hasFreshSuccessfulWorkerTick(ts(90_001),30_000,now),false);
  assert.equal(hasFreshSuccessfulWorkerTick(ts(-1000),30_000,now),false);
  assert.equal(hasFreshSuccessfulWorkerTick(null,30_000,now),false);
  assert.equal(hasFreshSuccessfulWorkerTick("invalid",30_000,now),false);
  assert.equal(hasFreshSuccessfulWorkerTick(ts(0),0,now),false);
});

test("NOVA /health/ready fails closed when worker heartbeat is stale",async()=>{
  const source=await read("src/lib/runtime-readiness.ts");
  assert.match(source,/hasFreshSuccessfulWorkerTick\(/);
  assert.match(source,/AGI_WORKER_TICK_STALE/);
  assert.match(source,/tick_fresh: workerTickFresh/);
  assert.match(source,/worker\.enabled &&\s*workerTickFresh &&\s*!worker\.last_error/);
});

test("OCI Caddy TLS email is passed explicitly and Docker runtime stays private",async()=>{
  const compose=await read("deploy/oci/docker-compose.yml");
  const caddy=await read("deploy/oci/Caddyfile");
  assert.match(compose,/NOVA_TLS_EMAIL: \$\{NOVA_TLS_EMAIL:\?/);
  assert.match(compose,/NOVA_DOMAIN: \$\{NOVA_DOMAIN:\?/);
  assert.match(caddy,/email \{\$NOVA_TLS_EMAIL\}/);
  assert.match(compose,/expose:\s*\n\s*- "8080"/);
  assert.doesNotMatch(compose,/ports:\s*\n\s*- "8080:8080"/);
});
