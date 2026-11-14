# NOVA AGI — OCI Always Free deployment kit

This directory prepares the existing nova.agi Docker runtime for an OCI Always Free ARM64 VM. It does not change application code and does not contain secrets.

## Preconditions
- OCI Always Free eligible VM, Ubuntu ARM64.
- DNS name for NOVA.
- TLS termination via Caddy on the VM.
- Secrets supplied through /etc/nova/nova.env only.
- Network ingress limited to TCP 22 and TCP 443; NOVA itself remains private behind Caddy.

## Runtime
The existing Dockerfile is used unchanged:
- Node 22
- Fastify 5
- non-root container user
- internal port 8080
- /health and /health/ready

## Required manual secrets
Populate /etc/nova/nova.env with the existing production contract documented in DEPLOYMENT.md:
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NOVA_ORCHESTRATOR_KEY
one or more model-provider keys
NOVA_AGI_WORKER_ENABLED
NOVA_AGI_WORKER_ID
NOVA_AGI_WORKER_PROJECT_ID=hocker-one
NOVA_REQUIRE_WORKER_READY=true
NOVA_RUNTIME_NODE_ID=nova-runtime-1
NOVA_RUNTIME_HEARTBEAT_MS

Never commit this file.

## TLS configuration and safe deployment preflight
Caddy requires **both** values in an external file `/etc/nova/caddy.env`:
`NOVA_DOMAIN` and `NOVA_TLS_EMAIL`. Configure a real, DNS-verified hostname
and a real certificate contact address. Do not place keys in this file.
Use restrictive permissions for the secret runtime env file
(`chmod 600 /etc/nova/nova.env`) and never print it in CI/logs.

Before any deployment, confirm you can access an **already provisioned,
authorized OCI Always Free ARM64 VM**; this repository does not provision one.
Use the exact approved main SHA, not an arbitrary branch:
```bash
git fetch origin main
git checkout --detach <approved-commit-sha>
docker compose --env-file /etc/nova/caddy.env -f deploy/oci/docker-compose.yml config --quiet
docker compose --env-file /etc/nova/caddy.env -f deploy/oci/docker-compose.yml build
```
The commands above **only validate/build locally**. They do not start,
redeploy, or certify a remote runtime. Ensure OCI image resources remain within
the actual account quota. Starting the worker could invoke configured
LLM providers for queued tasks and incur usage; inspect task backlog and
provider billing controls before setting `NOVA_AGI_WORKER_ENABLED=true`.

Once explicit release gates permit activation, record:
- Exact Git SHA and resulting container image digest (no `latest` only).
- TLS DNS ownership and `/health` HTTP 200.
- `/health/ready` HTTP 200 with `worker.tick_fresh=true`,
  `worker.last_successful_tick_at` recent and heartbeat fresh.
- A new persisted `public.nodes` record for `nova-runtime-1` with
  recent `last_seen_at` and matching worker metadata.
- Worker tick/queue evidence, authenticated read-only MCP,
  Hocker One fallback authenticated E2E, Owner Gate deferral,
  secret-free logs and a rollback demonstration.
- Keep Hocker One as primary; do not switch its runtime endpoint
  merely because Docker starts or a process is marked `online`.


## Activation gate
Do not change Hocker One's NOVA endpoint until one exact image/revision passes:
1. /health 200
2. /health/ready 200
3. fresh nova-runtime-1 heartbeat
4. successful worker tick
5. authenticated Hocker One -> NOVA E2E
6. read-only MCP operation
7. sensitive action deferred to Hocker One Owner Gate
8. no secret leakage in logs
9. rollback to previous image demonstrated

Until then this VM is staging/compatibility only.
