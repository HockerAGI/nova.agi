# NOVA.AGI — Continuity and recovery contract

Status: **ACTIVE REPO CONTRACT**

This document tells a new session how to resume NOVA work after a lost chat, crashed IDE or provider interruption. It does not claim live status; mutable facts must be re-queried.

## Durable handoff fields

At every material milestone retain, by checkpoint or branch handoff:

- repository and exact commit SHA;
- branch and open PR number/head SHA;
- deployment target and exact deployed revision when known;
- `/health/ready` result tied to the exact deployment revision;
- runtime heartbeat/log evidence reference;
- Hocker One -> NOVA auth E2E state;
- provider/model routing and fallback owner;
- enabled tools and permission mode;
- memory/session schema or migration changes;
- runtime eval/tool-eval evidence references;
- blockers, decisions, current gate/phase and next intended action;
- rollback/runbook reference for material runtime changes.

Never retain secret values, raw chats, cookies, TOTP, service-role keys or restricted-domain payloads in this handoff.

## Recovery procedure

1. Read root `AGENTS.md` and this file.
2. Fetch the current branch, `main`, exact SHA and open PRs.
3. Re-check `src/index.ts`, `railway.json`, deployment evidence and `/health/ready` before calling NOVA live.
4. Consult Hocker One Context Bridge/evidence pack for ecosystem-level facts and current AGI evidence.
5. Reconcile any difference between the last handoff and current code/runtime before writing.
6. Resume from the documented next action, or explicitly supersede it with evidence.

## Current verified repository checkpoint — 2026-08-19

Re-query all mutable pointers before action. The facts below are a recovery checkpoint, not a substitute for live verification.

- `main` observed after dependency cleanup: `faf4444f3841b21e29a6c9f9af036d574603a49c`, protected and signed.
- Safe maintenance integrated after the prior continuity baseline:
  - PR #33: `@supabase/supabase-js` `2.112.2 -> 2.112.3` — merged; patch improves trace propagation/CORS diagnostics.
  - PR #36: `tsx` `4.21.0 -> 4.23.12` — rebased onto current `main`, exact-head CI #159 passed, merged.
  - PR #37: `fastify` `5.11.3 -> 5.12.0` — rebased onto the post-#36 `main`, exact-head CI #162 passed, merged.
- Major toolchain jumps were intentionally **not** mixed into maintenance:
  - PR #34 TypeScript `5.9.3 -> 7.0.2` closed without merge; requires explicit toolchain migration.
  - PR #35 `@types/node` `22.20.1 -> 26.2.0` closed without merge; must remain aligned with the Node runtime target.
- CI contract remains Node 22 + `npm ci` + regression tests + typecheck + build + production/full dependency audits.
- `GET /health/ready` remains the readiness contract and `railway.json` still points Railway health checking to it.
- A dedicated live Railway deployment tied to `faf4444...` (or any newer exact revision) has **not** been proven by connected evidence in this workstream. Do not infer it from `railway.json`, Docker configuration, GitHub merges or CI success.
- No provider/model routing, tool permissions, database schema, RLS/grants, secrets or Owner Gate behavior was changed by this dependency cleanup.
- Hocker One functional release with the clean NOVA-first UX and score-v3 semantics is already in production, but score-v3 Owner/AAL2 certification remains a separate human ceremony; do not translate that into NOVA runtime certification.

## Previous verified baseline — 2026-08-15/17

- Historical `main` baseline: `db417f262dfcddcad8e82f6be977415d0b0f3e89`, merged by PR #32.
- The runtime exposes `GET /health/ready` and returns 200 or 503 from `getNovaRuntimeReadiness()`.
- `railway.json` configures `/health/ready` as Railway healthcheck.
- Runtime heartbeat code exists.
- A dedicated live Railway deployment tied to an exact revision had not been proven by connected evidence.

The baseline above is historical evidence once a newer checkpoint exists; always re-query before action.

## Current next gate

1. Re-query `main`, open PRs and CI before any new write.
2. Do **not** reopen TypeScript 7 or Node 26 typings as automatic dependency maintenance; plan them as a coordinated runtime/toolchain migration.
3. For dedicated NOVA runtime certification, obtain deployment provider evidence tied to one exact Git SHA, then verify `/health/ready`, logs/heartbeat, authenticated Hocker One -> NOVA E2E, provider routing/fallback, persistence/telemetry and rollback.
4. Keep provider/model/tool changes separate from dependency maintenance unless a failing contract requires them.
5. Update this checkpoint after the next material runtime or deployment milestone.

## Handoff trigger

Emit/update continuity after:

- provider/model routing change;
- tool/MCP registry change;
- session or memory migration;
- auth boundary change;
- runtime deployment/rollback;
- health/readiness behavior change;
- AGI runtime/tool eval evidence change;
- blocker/gate/phase transition;
- important architecture decision;
- end of a significant session.

If an authorized Context Bridge identity is available, publish a normalized checkpoint there. Otherwise retain the handoff in the current working branch and state that the shared checkpoint is pending.

## Live runtime evidence standard

Configuration is not runtime evidence. NOVA can be called a verified dedicated runtime only when all applicable evidence is tied to the same candidate revision:

1. deployment ID/URL or provider resource identifier;
2. exact deployed Git SHA;
3. successful `/health/ready` response;
4. runtime logs/heartbeat in the verification window;
5. authenticated Hocker One -> NOVA request;
6. provider routing/fallback smoke;
7. persistence/telemetry evidence;
8. rollback reference.

Until this exists, report **configured/runtime contract present; dedicated live runtime unverified**.

## Shared memory boundary

Hocker One Context Bridge owns cross-session operational continuity. NOVA local messages/threads are runtime session state; SYNTIA/Memory Mirror owns reviewed reusable knowledge. These layers are complementary and must not be collapsed into raw-chat replication.
