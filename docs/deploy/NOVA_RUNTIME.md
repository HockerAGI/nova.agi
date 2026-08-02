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
