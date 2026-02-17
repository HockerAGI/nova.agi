# nova.agi

Servicio de orquestación para NOVA (API HTTP) que:

- Recibe requests desde **hocker.one**
- Decide provider/model (OpenAI/Gemini) con router simple
- Guarda memoria en Supabase (`nova_threads`, `nova_messages`)
- Registra uso en `llm_usage`
- (Opcional) Encola acciones seguras en `commands` cuando `allow_actions=true`

## Endpoints

- `GET /health` → health check
- `POST /chat` → chat
- `POST /v1/chat` → alias compatible

## Auth

Requiere header:

`Authorization: Bearer <NOVA_ORCHESTRATOR_KEY>`

## Request

```json
{
  "project_id": "global",
  "thread_id": "<uuid opcional>",
  "message": "hola",
  "prefer": "auto|openai|gemini",
  "mode": "auto|fast|pro",
  "allow_actions": false,
  "user_id": null,
  "user_email": null
}