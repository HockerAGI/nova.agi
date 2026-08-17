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

## Current verified contract baseline — 2026-08-15/16

- `main` baseline observed: `b3de52a48ddbb61d13287d3f46c22da550723c33`.
- Continuity/Codex PR: #32, branch `docs/codex-context-20260815`.
- The runtime exposes `GET /health/ready` and returns 200 or 503 from `getNovaRuntimeReadiness()`.
- `railway.json` configures `/health/ready` as Railway healthcheck.
- Runtime heartbeat code exists.
- A dedicated live Railway deployment tied to an exact revision has **not** been proven by connected evidence in this workstream. Do not infer it from configuration.

The baseline above is historical evidence once a newer checkpoint exists; always re-query before action.

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
