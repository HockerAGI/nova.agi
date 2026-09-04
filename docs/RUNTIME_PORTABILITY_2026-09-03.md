---
document_id: NOVA-RUNTIME-PORTABILITY-2026-09-03
status: ACTIVE
owner: NOVA / Hocker One
classification: INTERNAL
evidence_cut: 2026-09-03
truth_order: production/configuration > main/migrations > executable contracts/tests > approved ADR/policies > canonical docs > history
---

# NOVA Runtime — Portability and Hosting Decision 2026-09-03

## Current architecture

nova.agi remains a dedicated compatibility/fallback runtime. Hocker One is the primary NOVA control-plane/runtime path for the ecosystem.

The application runtime is intentionally provider-neutral at the application layer:
- Node.js 22.x
- Fastify 5.x
- Docker multi-stage build
- non-root runtime user
- /health
- /health/ready
- worker loop
- runtime heartbeat
- Supabase durable state/evidence
- configurable model/provider fallback
- MCP registry
- material execution deferred to Hocker One Owner Gate

A live dedicated runtime is not proven by the existence of Dockerfile, railway.json or readiness code.

## Railway status

Railway is not current operational authority. No current exact-revision production deployment/readiness/heartbeat/E2E evidence is available at this cut.

Do not treat Railway availability as a prerequisite for Hocker One operation.

## Hosting decision

### Primary

Hocker One's own runtime/control plane remains primary.

### Dedicated fallback candidate

Oracle Cloud Infrastructure Always Free is the current strongest compatibility candidate for a persistent Dockerized NOVA runtime because Oracle documents Always Free compute resources available for the life of an account within quota limits. The current nova.agi Dockerfile can run on a standard ARM64 Linux VM without changing the application contract.

Oracle Always Free does not provide an SLA and account creation commonly requires a payment card for identity verification; the card is not charged unless the account is upgraded. Capacity in a home region can be constrained.

### Not selected as production authority

Render Free: free web services exist, but they spin down after inactivity and Render explicitly states Free instances should not be used for production.

Google Cloud Run: has free usage allowance but requires a billing account and has a different execution model from a continuously running Fastify worker.

Cloudflare Workers: Node.js compatibility has improved substantially, but Workers is an isolate/event runtime rather than a direct equivalent of the current persistent Fastify process; migration would require adaptation.

Deno Deploy: free tier exists, but the current Fastify process contract would require adaptation and verification.

## Required OCI deployment contract

The target deployment must preserve:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NOVA_ORCHESTRATOR_KEY
- one or more model-provider keys
- NOVA_AGI_WORKER_ENABLED
- NOVA_AGI_WORKER_ID
- NOVA_AGI_WORKER_PROJECT_ID=hocker-one
- NOVA_REQUIRE_WORKER_READY=true
- NOVA_RUNTIME_NODE_ID=nova-runtime-1
- NOVA_RUNTIME_HEARTBEAT_MS

Never commit any of the values.

## Certification before activation

A dedicated runtime is eligible for activation only after all of the following are verified against one exact revision:
1. /health = 200.
2. /health/ready = 200.
3. recent nova-runtime-1 heartbeat in public.nodes.
4. worker tick and last_successful_tick_at recent.
5. read-only MCP operation succeeds.
6. provider fallback is exercised without exposing provider secrets.
7. Hocker One -> NOVA authenticated E2E succeeds.
8. one sensitive action is deferred to Hocker One Owner Gate, not executed directly by NOVA.
9. logs contain no secret leakage.
10. rollback to a known-good image/revision is demonstrated.

Until these are complete, dedicated nova.agi remains fallback candidate / unverified, not production authority.