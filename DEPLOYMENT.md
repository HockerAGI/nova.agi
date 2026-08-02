# NOVA Orchestrator — Deployment Checklist

Checklist verificable para desplegar `nova.agi` en producción.

## 1. Runtime

- Node.js 22.x.
- Puerto por defecto: `8080`.
- Proceso: `node dist/index.js`.
- `/health`: liveness mínima del proceso.
- `/health/ready`: readiness real usada por Railway.

## 2. Variables obligatorias

Variables server-only:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NOVA_ORCHESTRATOR_KEY=
HOCKER_COMMAND_HMAC_SECRET=
NODE_ENV=production
PORT=8080
```

Debe existir al menos un motor configurado:

```bash
OPENAI_API_KEY=
# o GEMINI_API_KEY=
# o ANTHROPIC_API_KEY=
```

Para operación AGI automática verificable:

```bash
NOVA_AGI_WORKER_ENABLED=true
NOVA_AGI_WORKER_ID=nova-worker-1
NOVA_AGI_WORKER_PROJECT_ID=hocker-one
NOVA_AGI_WORKER_INTERVAL_MS=30000
NOVA_REQUIRE_WORKER_READY=true
NOVA_RUNTIME_NODE_ID=nova-runtime-1
NOVA_RUNTIME_HEARTBEAT_MS=30000
```

`NOVA_REQUIRE_WORKER_READY` es `true` por defecto en producción. Un despliegue sin worker activo no superará el readiness de Railway.

## 3. Build reproducible

No uses `npm ci --production` antes de compilar: TypeScript es una dependencia de desarrollo requerida por el build.

```bash
npm ci
npm test
npm run typecheck
npm run build
npm prune --omit=dev
npm start
```

El Dockerfile ya implementa correctamente un build multi-stage: instala dependencias completas en `builder` y solo dependencias productivas en `runner`.

## 4. Orden de despliegue

1. Aplicar primero las migraciones Supabase requeridas.
2. Configurar secretos en Railway/Cloud Run, nunca en Git.
3. Desplegar con Dockerfile.
4. Confirmar `200` en `/health/ready`.
5. Confirmar un heartbeat reciente del nodo `nova-runtime-1` en `public.nodes`.
6. Confirmar `last_tick_at` reciente y ausencia de error del worker.
7. Probar una lectura MCP real desde NOVA.
8. Probar una mutación como borrador bajo Hocker ONE Owner Gate; nunca escribir directo a `main`.

## 5. Readiness

`/health/ready` devuelve `503` cuando ocurre cualquiera de estos casos:

- Supabase no responde;
- no existe ningún motor configurado;
- el worker requerido está desactivado;
- el worker no ha ejecutado un tick;
- el último tick terminó con error.

El payload no expone secretos ni nombres internos de credenciales.

## 6. Heartbeat

El runtime actualiza `public.nodes` con:

- `id = nova-runtime-1` por defecto;
- `last_seen_at` real;
- estado del proceso;
- worker habilitado, último tick y evidencia de tarea;
- estado `offline` durante un cierre controlado.

## 7. Observabilidad

Langfuse es opcional. Las claves deben permanecer server-only:

```bash
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```
