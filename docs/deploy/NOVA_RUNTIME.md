# NOVA Runtime

Este servicio está preparado para Railway y Google Cloud Run usando el mismo Dockerfile.

## Runtime

- Node 22
- Puerto interno: `8080`
- Start: `node dist/index.js`
- Liveness: `/health`
- Readiness: `/health/ready`
- Heartbeat persistido: `public.nodes`

## Variables requeridas

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NOVA_ORCHESTRATOR_KEY=
HOCKER_COMMAND_HMAC_SECRET=

DEFAULT_PROJECT_ID=hocker-one
DEFAULT_COMMAND_NODE_ID=hocker-node-1
CLOUD_COMMAND_NODE_ID=cloud-hocker-one
HOCKER_ONE_API_URL=https://hockerone.vercel.app

NODE_ENV=production
PORT=8080
```

Al menos una:

```bash
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
```

Worker y evidencia operativa:

```bash
NOVA_AGI_WORKER_ENABLED=true
NOVA_AGI_WORKER_ID=nova-worker-1
NOVA_AGI_WORKER_PROJECT_ID=hocker-one
NOVA_AGI_WORKER_INTERVAL_MS=30000
NOVA_REQUIRE_WORKER_READY=true
NOVA_RUNTIME_NODE_ID=nova-runtime-1
NOVA_RUNTIME_HEARTBEAT_MS=30000
```

## Contrato de readiness

Railway consulta `/health/ready`. El endpoint solo responde `200` cuando:

- Supabase está accesible;
- existe al menos un motor configurado;
- el worker requerido está habilitado;
- el worker ya ejecutó un tick;
- el tick no conserva un error activo.

El runtime registra un heartbeat en `public.nodes` y marca el nodo `offline` al cerrar de forma controlada.

## Railway

Railway usa `Dockerfile` + `railway.json`. La ruta de health configurada es `/health/ready`.

## Cloud Run futuro

Cuando haya billing activo:

```bash
gcloud run deploy nova-agi \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2
```

Después del despliegue se debe comprobar `/health/ready` y el heartbeat `nova-runtime-1`; un `200` en `/health` por sí solo no demuestra capacidad de inferencia ni ejecución AGI.

## Native/local-only inference (opt-in, no new LLM subscription)

This is an **activation profile**, not evidence of a running model. The existing NOVA provider adapter can use Ollama on a trusted private host (e.g. an already-authorized HOCKER server). Before enabling, install a model compatible with actual CPU/RAM/GPU and verify a **real** `POST /api/chat` response. Never publish port 11434 to the internet; use loopback or a controlled private network. Do not claim zero operating costs: local inference consumes server CPU/GPU/RAM and energy.

Configure the NOVA service only after that verification:

```env
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL_AUTO=llama3.1:8b
OLLAMA_MODEL_FAST=llama3.1:8b
OLLAMA_MODEL_PRO=llama3.1:8b
NOVA_LOCAL_ONLY_MODE=true
DEFAULT_PROVIDER=ollama
TEXT_PROVIDER_ORDER=ollama
CODE_PROVIDER_ORDER=ollama
LONG_CONTEXT_PROVIDER_ORDER=ollama
PROVIDER_FALLBACKS=ollama
NOVA_AGI_WORKER_ENABLED=true
NOVA_REQUIRE_WORKER_READY=true
NOVA_RUNTIME_NODE_ID=nova-runtime-1
```

`NOVA_LOCAL_ONLY_MODE=true` disables cloud inference providers at the runtime router even if API keys exist. When Ollama is absent, its auto model is not installed, the heartbeat is stale, or the required worker is not ready, `/health/ready` responds **503**; local-only mode never falls back to a canned survival answer as if it were real inference. External paid services and fallback may be enabled **only after a separate approved policy decision** with budget controls. No model or provider is installed or connected by this repository change.

Runtime certification still requires exact deployed image SHA, `/health/ready` 200 on that revision, fresh Supabase heartbeat and worker tick, one authenticated inference with persisted evidence, safe MCP read, Owner Gate deferred write, and rollback. Tests and local probes do not substitute live proof.
