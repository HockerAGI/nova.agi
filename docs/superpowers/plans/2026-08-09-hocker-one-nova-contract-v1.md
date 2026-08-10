# Hocker One ↔ NOVA Contract v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hash-pinned, machine-readable v1 contract that NOVA provides and Hocker One consumes, with identical chat/SSE security rules, truthful evidence, preserved Owner Gate, and a directed smoke that cannot claim unrelated work.

**Architecture:** NOVA owns JSON Schema 2020-12 artifacts and private `/api/v1/hocker/*` endpoints. Hocker One vendors the canonical schemas, verifies their SHA-256 manifest, validates both outbound requests and inbound private responses, then sanitizes the browser response. The two deployables are implemented and merged sequentially: backward-compatible NOVA provider first, Hocker One consumer second.

**Tech Stack:** Node.js 22, TypeScript 5.9, Fastify 5, Next.js 16, Zod 3, Ajv 8.20.0, ajv-formats 3.0.1, JSON Schema 2020-12, Node test runner, Supabase PostgreSQL, Vercel, GitHub Actions, CodeQL.

## Global Constraints

- Canonical contract identifier is `hocker-one-nova.chat`; initial version is exactly `1.0.0`.
- Canonical NOVA routes are `POST /api/v1/hocker/chat` and `POST /api/v1/hocker/chat/stream`.
- Legacy NOVA aliases remain bearer-protected and provider/model-cloaked.
- Hocker One is the only browser-facing control plane; the browser never calls NOVA directly.
- Provider and model are private audit data and must be removed from browser responses.
- `allow_actions=true` permits proposals only; `allow_write` and `effective_actions` remain false at the NOVA boundary.
- Mutating proposals require Hocker One validation, `agi_action_queue`, Owner Gate, an approved executor, evidence, and rollback data.
- No secret values enter source, tests, fixtures, logs, PRs, SQL, or documentation.
- No production SQL runs before the migration passes repository tests and an isolated database validation.
- No merge advances until the exact candidate SHA has green CI and security checks.

---

## Phase A — NOVA canonical provider

### Task 1: Canonical schemas and deterministic manifest

**Files:**
- Create: `contracts/hocker-one-nova/v1/request.schema.json`
- Create: `contracts/hocker-one-nova/v1/success.schema.json`
- Create: `contracts/hocker-one-nova/v1/error.schema.json`
- Create: `contracts/hocker-one-nova/v1/sse-event.schema.json`
- Create: `contracts/hocker-one-nova/v1/manifest.json`
- Create: `scripts/contracts/build-manifest.mjs`
- Create: `tests/hocker-contract-schema.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: JSON Schema 2020-12 and the design in `docs/superpowers/specs/2026-08-09-hocker-one-nova-contract-v1-design.md`.
- Produces: `buildManifest(contractDir): Promise<ContractManifest>` and four schemas identified by stable `$id` values under `https://contracts.hocker.one/nova/v1/`.

- [ ] **Step 1: Add Ajv and write the failing schema/manifest test**

Run `npm install --save-dev ajv@8.20.0 ajv-formats@3.0.1`, then create a test that fails because the schemas and manifest do not exist:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../contracts/hocker-one-nova/v1/", import.meta.url);
const files = ["request.schema.json", "success.schema.json", "error.schema.json", "sse-event.schema.json"];

test("v1 schemas compile and match their manifest digests", async () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.contract_id, "hocker-one-nova.chat");
  assert.equal(manifest.version, "1.0.0");
  for (const file of files) {
    const raw = await readFile(new URL(file, root));
    ajv.compile(JSON.parse(raw.toString("utf8")));
    assert.equal(createHash("sha256").update(raw).digest("hex"), manifest.files[file]);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --test-name-pattern='v1 schemas compile'`

Expected: FAIL with `ENOENT` for `contracts/hocker-one-nova/v1/manifest.json`.

- [ ] **Step 3: Add strict schemas and the manifest builder**

Use `additionalProperties: false` at every documented object boundary. Keep arbitrary extension data only beneath `context_data.extensions`. The request schema must require this exact set:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://contracts.hocker.one/nova/v1/request.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["contract_version", "project_id", "thread_id", "message", "prefer", "mode", "allow_actions", "user_id", "user_email", "context_data"],
  "properties": {
    "contract_version": { "const": "1.0.0" },
    "project_id": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" },
    "thread_id": { "type": ["string", "null"], "format": "uuid" },
    "message": { "type": "string", "minLength": 1, "maxLength": 100000 },
    "prefer": { "const": "auto" },
    "mode": { "const": "auto" },
    "allow_actions": { "type": "boolean" },
    "user_id": { "type": ["string", "null"], "maxLength": 128 },
    "user_email": { "type": ["string", "null"], "format": "email" },
    "context_data": { "$ref": "#/$defs/contextData" }
  }
}
```

The manifest builder sorts filenames, hashes the exact UTF-8 bytes, and writes stable two-space JSON plus a trailing newline:

```js
export async function buildManifest(contractDir) {
  const files = {};
  for (const name of ["error.schema.json", "request.schema.json", "sse-event.schema.json", "success.schema.json"]) {
    const raw = await readFile(join(contractDir, name));
    files[name] = createHash("sha256").update(raw).digest("hex");
  }
  return {
    contract_id: "hocker-one-nova.chat",
    version: "1.0.0",
    schema_dialect: "https://json-schema.org/draft/2020-12/schema",
    canonical_repository: "HockerAGI/nova.agi",
    canonical_path: "contracts/hocker-one-nova/v1",
    files,
  };
}
```

- [ ] **Step 4: Build the manifest and verify GREEN**

Run:

```bash
node scripts/contracts/build-manifest.mjs
npm test -- --test-name-pattern='v1 schemas compile'
git diff --check
```

Expected: manifest generation exits 0; the focused test passes; `git diff --check` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add contracts scripts/contracts tests/hocker-contract-schema.test.mjs package.json package-lock.json
git commit -m "feat(contract): publish canonical Hocker NOVA v1 schemas"
```

### Task 2: Contract negotiation and canonical error envelope

**Files:**
- Create: `src/lib/hocker-contract.ts`
- Create: `src/lib/hocker-contract-error.ts`
- Create: `tests/hocker-contract-negotiation.test.mjs`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: `request.schema.json` semantics from Task 1.
- Produces: `HOCKER_NOVA_CONTRACT_VERSION`, `negotiateHockerContract(headers)`, `contractHeaders(requestId)`, and `contractError(args)`.

- [ ] **Step 1: Write failing negotiation tests**

```js
test("private contract accepts v1 and rejects an unknown major", () => {
  assert.deepEqual(negotiateHockerContract({ "x-hocker-nova-contract": "1.0.0" }), {
    version: "1.0.0", legacy: false,
  });
  assert.throws(
    () => negotiateHockerContract({ "x-hocker-nova-contract": "2.0.0" }),
    (error) => error.code === "CONTRACT_VERSION_UNSUPPORTED" && error.status === 409,
  );
});

test("missing version is audited as legacy during rollout", () => {
  assert.deepEqual(negotiateHockerContract({}), { version: "1.0.0", legacy: true });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='private contract|missing version'`

Expected: FAIL because `src/lib/hocker-contract.ts` does not exist.

- [ ] **Step 3: Implement negotiation and stable errors**

```ts
export const HOCKER_NOVA_CONTRACT_VERSION = "1.0.0" as const;

export function negotiateHockerContract(headers: Record<string, unknown>) {
  const raw = String(headers["x-hocker-nova-contract"] ?? "").trim();
  if (!raw) return { version: HOCKER_NOVA_CONTRACT_VERSION, legacy: true };
  if (raw.split(".")[0] !== "1") {
    throw new HockerContractError(409, "CONTRACT_VERSION_UNSUPPORTED", false);
  }
  return { version: HOCKER_NOVA_CONTRACT_VERSION, legacy: false };
}
```

`contractError` must return the nested design envelope, sanitize its message, echo a valid `X-Request-ID`, and set `Retry-After` only when the error declares seconds.

- [ ] **Step 4: Register a Fastify error handler and verify GREEN**

Map Zod failures to `INVALID_REQUEST`, body-limit errors to `PAYLOAD_TOO_LARGE`, persistent limiter failures to `RATE_LIMIT_UNAVAILABLE`, and unknown errors to `INTERNAL_ERROR` only for `/api/v1/hocker/*`. Keep legacy endpoint behavior backward compatible.

Run:

```bash
npm test -- --test-name-pattern='private contract|missing version|contract error'
npm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hocker-contract.ts src/lib/hocker-contract-error.ts src/app.ts tests/hocker-contract-negotiation.test.mjs
git commit -m "feat(contract): negotiate Hocker NOVA v1 requests"
```

### Task 3: Private chat endpoint, evidence, and cloaking boundary

**Files:**
- Create: `tests/hocker-private-chat-contract.test.mjs`
- Modify: `src/app.ts`
- Modify: `src/types.ts`
- Modify: `README.md`
- Modify: `docs/deploy/NOVA_RUNTIME.md`

**Interfaces:**
- Consumes: `negotiateHockerContract`, `contractHeaders`, existing `handleChat`, and existing persistence helpers.
- Produces: `POST /api/v1/hocker/chat` returning the v1 private success or error schema.

- [ ] **Step 1: Write a failing integration test against `buildNovaApp()`**

Use `app.inject` with a valid Bearer and v1 headers. Stub provider/persistence through the repository's existing test seam, then assert:

```js
assert.equal(response.statusCode, 200);
assert.equal(response.headers["x-hocker-nova-contract"], "1.0.0");
const body = response.json();
assert.equal(body.contract_version, "1.0.0");
assert.equal(body.meta.controls.allow_write, false);
assert.equal(body.meta.controls.effective_actions, false);
assert.equal(body.meta.controls.enqueued_actions, 0);
assert.equal(body.meta.controls.action_policy, "hocker_one_owner_gate_only");
assert.equal(typeof body.provider, "string");
assert.equal(typeof body.model, "string");
```

Add a second assertion that `/api/v1/chat` still omits provider and model under the same environment.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='private Hocker chat'`

Expected: FAIL with route-not-found or missing `contract_version`.

- [ ] **Step 3: Register the private route and enrich only its response**

Extract the private response augmentation into:

```ts
function privateContractPayload(payload: ChatResult, requestId: string): ChatResult & {
  contract_version: "1.0.0";
  request_id: string;
} {
  return { ...payload, contract_version: HOCKER_NOVA_CONTRACT_VERSION, request_id: requestId };
}
```

Do not add `/api/v1/hocker/chat` to `NOVA_PUBLIC_CHAT_RESPONSE_CLOAK_PATHS`. Preserve the existing cloaking set unchanged.

- [ ] **Step 4: Validate success fixtures and all policy assertions**

Compile `success.schema.json` with Ajv in the test and validate the private response. Run:

```bash
npm test -- --test-name-pattern='private Hocker chat|public completion payload|Owner Gate'
npm run typecheck
npm run build
```

Expected: all selected tests, typecheck, and build pass.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/types.ts tests/hocker-private-chat-contract.test.mjs README.md docs/deploy/NOVA_RUNTIME.md
git commit -m "feat(contract): expose authenticated private Hocker chat"
```

### Task 4: Contract-compliant lifecycle streaming

**Files:**
- Create: `src/lib/hocker-contract-sse.ts`
- Create: `tests/hocker-private-stream-contract.test.mjs`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: private chat handler and `sse-event.schema.json`.
- Produces: `writeContractEvent(raw, event, data)` and `POST /api/v1/hocker/chat/stream`.

- [ ] **Step 1: Write failing SSE sequence tests**

Parse the response into event records and assert exact terminal behavior:

```js
assert.deepEqual(events.map((event) => event.name), ["accepted", "message", "done"]);
assert.equal(events.filter((event) => ["message", "error"].includes(event.name)).length, 1);
assert.equal(events.filter((event) => event.name === "done").length, 1);
assert.equal(events[0].data.contract_version, "1.0.0");
assert.equal(events.at(-1).data.trace_id, events[0].data.trace_id);
```

Add cases for invalid Bearer, invalid contract major, model failure, and client abort. The invalid Bearer case must produce no `accepted` event.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='private Hocker stream'`

Expected: FAIL because the private stream route is absent.

- [ ] **Step 3: Implement one lifecycle writer**

```ts
export function writeContractEvent(
  raw: NodeJS.WritableStream,
  event: "accepted" | "heartbeat" | "message" | "error" | "done",
  data: Record<string, unknown>,
) {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
```

Negotiate and authenticate before `reply.hijack()`. Reuse `handleChat`, include the private provider/model evidence only in the private event, clear heartbeat in `finally`, and guard terminal emission with one boolean.

- [ ] **Step 4: Verify GREEN and legacy compatibility**

Run:

```bash
npm test -- --test-name-pattern='private Hocker stream|chat stream'
npm test
npm run typecheck
npm run build
npm audit --omit=dev
npm audit
```

Expected: full NOVA suite, build, and both audits pass with zero high/critical findings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hocker-contract-sse.ts src/app.ts tests/hocker-private-stream-contract.test.mjs
git commit -m "feat(contract): add private NOVA lifecycle stream v1"
```

### Task 5: NOVA provider release gate

**Files:**
- Modify only if verification exposes a defect in files already owned by Tasks 1–4.

**Interfaces:**
- Consumes: completed NOVA v1 provider branch.
- Produces: one reviewed NOVA implementation PR whose exact SHA is safe for Hocker One to consume.

- [ ] **Step 1: Rebuild the manifest and require a clean diff**

```bash
node scripts/contracts/build-manifest.mjs
git diff --exit-code contracts/hocker-one-nova/v1/manifest.json
git diff --check
```

- [ ] **Step 2: Run the complete provider gate**

```bash
npm ci
npm test
npm run typecheck
npm run build
npm audit --omit=dev
npm audit
```

Expected: exit 0 for every command and no high/critical audit finding.

- [ ] **Step 3: Push and open a draft PR against NOVA `main`**

```bash
git push -u origin contract/hocker-nova-provider-v1
gh pr create --draft --base main --head contract/hocker-nova-provider-v1 --title "feat(contract): provide Hocker NOVA v1" --body-file docs/release/hocker-nova-provider-v1-pr.md
```

- [ ] **Step 4: Require exact-SHA CI, CodeQL, review-thread, and diff verification**

```bash
PROVIDER_PR=$(gh pr view --json number --jq .number)
gh pr checks "$PROVIDER_PR" --watch
gh pr view "$PROVIDER_PR" --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup
git diff --check origin/main...HEAD
```

The current branch lookup supplies the PR number; do not infer it from older PRs.

- [ ] **Step 5: Merge only after Owner review, then verify the new NOVA `main`**

Use `--match-head-commit` with the observed SHA and `--squash`. Watch the post-merge CI and CodeQL runs before beginning Phase B.

---

## Phase B — Hocker One consumer and safe operations

### Task 6: Vendored snapshot and drift gate

**Files:**
- Create: `contracts/nova/v1/*.schema.json`
- Create: `contracts/nova/v1/manifest.json`
- Create: `contracts/nova/v1/UPSTREAM_MANIFEST_SHA256`
- Create: `scripts/contracts/sync-nova-contract.mjs`
- Create: `scripts/contracts/verify-nova-contract.mjs`
- Create: `tests/nova-contract-snapshot.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: exact canonical files from the merged NOVA provider SHA.
- Produces: `verifyNovaContractSnapshot(root): Promise<void>` and a pinned manifest digest.

- [ ] **Step 1: Add `ajv@8.20.0` plus `ajv-formats@3.0.1` and write the failing drift test**

Run: `npm install --save ajv@8.20.0 ajv-formats@3.0.1`

```js
test("vendored NOVA v1 snapshot matches its canonical manifest", async () => {
  await assert.doesNotReject(() => verifyNovaContractSnapshot(process.cwd()));
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='vendored NOVA v1 snapshot'`

Expected: FAIL because `contracts/nova/v1/manifest.json` is absent.

- [ ] **Step 3: Copy exact canonical bytes and implement hash verification**

Resolve an exact checkout and pass its contract directory through `--source`:

```bash
NOVA_CONTRACT_ROOT=$(mktemp -d)
gh repo clone HockerAGI/nova.agi "$NOVA_CONTRACT_ROOT"
NOVA_PROVIDER_SHA=$(gh api repos/HockerAGI/nova.agi/commits/main --jq .sha)
git -C "$NOVA_CONTRACT_ROOT" checkout --detach "$NOVA_PROVIDER_SHA"
node scripts/contracts/sync-nova-contract.mjs --source "$NOVA_CONTRACT_ROOT/contracts/hocker-one-nova/v1"
```

The sync script copies only the four schemas and manifest, then writes:

```js
const digest = createHash("sha256").update(await readFile(sourceManifest)).digest("hex");
await writeFile(targetHash, `${digest}\n`, "utf8");
```

The verifier rejects extra schema files, missing files, per-file digest mismatches, manifest digest mismatches, or any version other than `1.0.0`.

- [ ] **Step 4: Verify GREEN and tamper detection**

In the test, copy the snapshot to a temporary directory, change one byte, and assert rejection with `NOVA_CONTRACT_DIGEST_MISMATCH`.

Run: `npm test -- --test-name-pattern='NOVA v1 snapshot'`

- [ ] **Step 5: Commit**

```bash
git add contracts/nova/v1 scripts/contracts tests/nova-contract-snapshot.test.mjs package.json package-lock.json
git commit -m "feat(contract): pin canonical NOVA v1 snapshot"
```

### Task 7: Private request builder, response validator, and fallback classification

**Files:**
- Create: `src/lib/nova-contract.ts`
- Create: `tests/nova-contract-chat.test.mjs`
- Modify: `src/app/api/nova/chat/route.ts`

**Interfaces:**
- Consumes: vendored schemas and existing `requireProjectRole`, Queue Lock, action materializers, and serverless fallback.
- Produces: `buildNovaContractRequest`, `validateNovaPrivateSuccess`, `classifyNovaFailure`, and `sanitizeNovaPrivateResponse`.

- [ ] **Step 1: Write failing tests for identity overwrite and private sanitization**

```js
assert.equal(request.contract_version, "1.0.0");
assert.equal(request.user_id, authenticatedUser.id);
assert.equal(request.user_email, authenticatedUser.email);
assert.equal(request.prefer, "auto");
assert.equal(request.mode, "auto");
assert.equal(request.context_data.hocker_runtime.execution_policy, "owner_gate_only");

const publicPayload = sanitizeNovaPrivateResponse(privateFixture);
assert.equal("provider" in publicPayload, false);
assert.equal("model" in publicPayload, false);
assert.equal(JSON.stringify(publicPayload).includes("provider_failures"), false);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='NOVA contract chat'`

Expected: FAIL because `src/lib/nova-contract.ts` is absent.

- [ ] **Step 3: Implement Ajv validators and change the upstream endpoint**

Send to `${NOVA_AGI_URL}/api/v1/hocker/chat` with:

```ts
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${key}`,
  "X-Hocker-Source": "hocker.one",
  "X-Hocker-Nova-Contract": "1.0.0",
  "X-Request-ID": requestId,
};
```

Validate before sending and validate the private success before sanitization. An invalid success becomes `UPSTREAM_CONTRACT_INVALID`, creates internal diagnostic metadata, and fails closed.

- [ ] **Step 4: Implement the fallback allowlist and verify GREEN**

`classifyNovaFailure` allows serverless fallback only for connection failure, timeout, HTTP 502, HTTP 503 provider failure, or HTTP 504. It rejects fallback for 400, 401, 403, 409, 413, and 429.

Run:

```bash
npm test -- --test-name-pattern='NOVA contract chat|serverless inference'
npm run typecheck
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/nova-contract.ts src/app/api/nova/chat/route.ts tests/nova-contract-chat.test.mjs
git commit -m "feat(contract): consume private NOVA chat v1"
```

### Task 8: Authenticated Hocker stream proxy

**Files:**
- Create: `tests/nova-contract-stream.test.mjs`
- Modify: `src/app/api/nova/chat/stream/route.ts`
- Modify: `src/lib/nova-contract.ts`

**Interfaces:**
- Consumes: request builder, private error mapper, `requireProjectRole`, and `sse-event.schema.json`.
- Produces: authenticated Hocker stream proxy to `/api/v1/hocker/chat/stream`.

- [ ] **Step 1: Write the failing authentication test**

Assert from source and route behavior that `requireProjectRole` runs before any upstream `fetch` or `ReadableStream` creation:

```js
assert.ok(requireRoleOffset >= 0);
assert.ok(fetchOffset > requireRoleOffset);
assert.ok(streamOffset > requireRoleOffset);
```

Add a route-level case where an unauthenticated request returns 401/403 and the fake upstream records zero calls.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='NOVA contract stream'`

Expected: FAIL because the existing stream route does not enforce the same project-role boundary.

- [ ] **Step 3: Align stream request, headers, schema, and terminal handling**

Call `requireProjectRole(project_id, ["owner", "admin", "operator", "viewer"])`, overwrite identity, send v1 headers, validate every parsed upstream event, strip private metadata from browser events, and permit the existing single-response fallback only for allowlisted upstream failure classes.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- --test-name-pattern='NOVA contract stream|private session'
npm run typecheck
npm run build
```

Expected: unauthenticated calls never reach upstream; valid lifecycle streams emit one terminal event and one `done`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/nova/chat/stream/route.ts src/lib/nova-contract.ts tests/nova-contract-stream.test.mjs
git commit -m "fix(contract): enforce project auth on NOVA stream"
```

### Task 9: Atomic directed smoke claim

**Files:**
- Create: `supabase/migrations/20260809010000_directed_agi_smoke_claim.sql`
- Create: `tests/directed-agi-smoke.test.mjs`
- Modify: `src/lib/serverless-agi-runtime.ts`
- Modify: `src/app/api/agi/serverless-worker-trigger/route.ts`

**Interfaces:**
- Consumes: one-time runtime token, exact task UUID, existing run start/completion RPCs.
- Produces: service-role-only `claim_agi_task_by_id(uuid,text,text)` and `runServerlessAgiTaskById`.

- [ ] **Step 1: Write failing migration and route tests**

Require the migration to enforce all of:

```sql
task.id = p_task_id
and task.project_id = p_project_id
and task.status = 'queued'
and task.write_policy = 'read_only'
and task.requires_approval = false
and task.attempt_count < task.max_attempts
```

Require `FOR UPDATE SKIP LOCKED`, exact-row update, public/anon/authenticated revoke, and service-role grant. Require the route to reject a directed-purpose token if `task_id` is missing instead of falling through to the general worker.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='directed AGI smoke'`

Expected: FAIL because the RPC and `runServerlessAgiTaskById` are absent.

- [ ] **Step 3: Implement the exact-claim RPC and runtime method**

Return zero rows when the task is not eligible. Reuse the existing `insertRun`, model call, `complete_serverless_agi_execution`, and failure path after a successful exact claim. Do not duplicate provider or evidence logic.

- [ ] **Step 4: Validate concurrency and wrong-task rejection**

In an isolated Supabase validation project, create two queued read-only fixtures. Invoke the directed claim twice concurrently for only fixture A. Assert one claim of A, zero claims of B, and no task other than A changes status. Remove both fixtures after evidence capture.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260809010000_directed_agi_smoke_claim.sql src/lib/serverless-agi-runtime.ts src/app/api/agi/serverless-worker-trigger/route.ts tests/directed-agi-smoke.test.mjs
git commit -m "feat(agi): add atomic directed smoke execution"
```

### Task 10: Hocker One release, production smoke, and evidence

**Files:**
- Create: `docs/operations/HOCKER_NOVA_CONTRACT_V1_RELEASE.md`
- Modify only if verification exposes a defect in files already owned by Tasks 6–9.

**Interfaces:**
- Consumes: merged NOVA provider v1, Hocker One consumer branch, isolated SQL validation, and exact Vercel deployment SHA.
- Produces: one Hocker One PR, verified main deployment, directed production evidence, and a rollback record.

- [ ] **Step 1: Run the full Hocker One candidate gate**

```bash
node scripts/contracts/verify-nova-contract.mjs
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
npm audit
git diff --check
```

- [ ] **Step 2: Open a draft PR and verify exact-SHA CI, CodeQL, and Preview**

Push `contract/hocker-nova-consumer-v1`, open a draft PR, wait for every check, and record the exact Vercel Preview deployment whose GitHub SHA equals the PR head.

- [ ] **Step 3: Execute a Preview directed smoke**

Create one read-only NOVA task and one purpose-bound one-time token. Call only the directed mode with that exact `task_id`. Verify provider, model, memory/evidence, usage, result hash, token consumption, `external_writes_executed=false`, `owner_gate_required_for_actions=true`, zero action-queue writes, and no status change to any other task. Remove only the test fixtures.

- [ ] **Step 4: Merge in controlled order and apply SQL safely**

After Owner review, merge Hocker One with `--match-head-commit`. Verify new main CI/CodeQL and exact production deployment. Apply the versioned directed-claim migration only after comparing production migration history and confirming the migration is not already recorded. Re-run Supabase security advisors after DDL.

- [ ] **Step 5: Execute one production directed smoke and finalize evidence**

Repeat the exact-task proof with a new one-time token. Record only identifiers, hashes, counts, timestamps, provider/model, persistence booleans, and deployment SHAs. Do not record raw tokens, prompts, replies, credentials, or personal content. Confirm test tokens inactive and fixtures removed.

- [ ] **Step 6: Verify rollback**

Document:

```text
NOVA rollback: redeploy prior NOVA main; Hocker One remains on legacy-compatible aliases.
Hocker One rollback: Vercel rollback to prior deployment; NOVA v1 remains backward compatible.
SQL rollback: leave the service-role-only directed RPC unused or revoke service_role execute; do not drop while an execution is active.
Contract rollback: restore the previously pinned manifest and endpoint configuration through a reviewed revert PR.
```

- [ ] **Step 7: Commit the evidence document**

```bash
git add docs/operations/HOCKER_NOVA_CONTRACT_V1_RELEASE.md
git commit -m "docs(contract): record Hocker NOVA v1 release evidence"
```

## Final verification checklist

- [ ] NOVA canonical schema manifest is reproducible and clean.
- [ ] NOVA private chat and stream endpoints require Bearer and v1 negotiation.
- [ ] Legacy aliases remain functional and provider/model-cloaked.
- [ ] Hocker One's snapshot and upstream manifest hash match canonical NOVA.
- [ ] Hocker One overwrites all browser-supplied identity and policy fields.
- [ ] Non-stream and stream routes enforce the same project roles.
- [ ] Private responses validate before public sanitization.
- [ ] Public responses contain no provider, model, provider failures, secret, or privileged evidence IDs.
- [ ] Fallback runs only for allowlisted availability failures.
- [ ] NOVA never treats action intent as write authorization.
- [ ] Directed smoke claims only its exact read-only task.
- [ ] Both repository mains and exact production deployments are verified after merge.
- [ ] All temporary tokens are inactive and all test fixtures are removed.
- [ ] Release evidence contains no credential or private model content.
