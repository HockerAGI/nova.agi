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
