# nova.agi

Servicio de orquestación dedicado para NOVA (API HTTP) que:

- Recibe requests autenticados desde **Hocker One**.
- Decide provider/model automáticamente con fallback controlado OpenAI/Gemini/Anthropic/Ollama.
- Guarda memoria operativa en Supabase (`nova_threads`, `nova_messages`).
- Registra uso en `llm_usage`.
- No encola acciones productivas desde chat. Hocker One controla ejecución real mediante Owner Gate y `agi_action_queue`.

## Endpoints

- `GET /health` → health check básico.
- `GET /health/ready` → readiness del runtime; puede responder 200 o 503 según dependencias requeridas.
- `POST /chat` → chat.
- `POST /v1/chat` → alias compatible.

## Auth

Requiere header:

`Authorization: Bearer <NOVA_ORCHESTRATOR_KEY>`

## Request

```json
{
  "project_id": "global",
  "thread_id": "<uuid opcional>",
  "message": "hola",
  "prefer": "auto",
  "mode": "auto|fast|pro",
  "allow_actions": false,
  "user_id": null,
  "user_email": null
}
```

`allow_actions=false` es una frontera contractual: la aprobación y ejecución material permanecen en Hocker One.

## Desarrollo y verificación

Runtime/toolchain soportado por el repositorio: **Node 22 + Fastify 5 + TypeScript**.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

El CI también ejecuta auditorías de dependencias. Cambios de runtime, dependencias, lockfile, configuración o código deben pasar el pipeline completo antes de mergear.

## Estado y continuidad

La existencia de `Dockerfile`, `railway.json` o un `/health/ready` implementado **no demuestra por sí sola un deployment vivo**. Antes de declarar NOVA como runtime dedicado verificado se requiere enlazar una revisión Git exacta con deployment, readiness, logs/heartbeat, E2E autenticado Hocker One → NOVA, routing/fallback, persistencia/telemetría y rollback.

Para recuperar trabajo después de cambio de chat o sesión, leer en este orden:

1. `AGENTS.md`
2. `docs/CONTINUITY.md`
3. `DEPLOYMENT.md`
4. código/tests/configuración actuales

`docs/CONTINUITY.md` contiene el checkpoint mutable; `AGENTS.md` conserva únicamente reglas durables.
