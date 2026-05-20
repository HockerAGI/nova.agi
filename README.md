# nova.agi

Servicio de orquestación para NOVA (API HTTP) que:

- Recibe requests desde **hocker.one**
- Decide provider/model automáticamente con fallback nativo OpenAI/Gemini/Anthropic/Ollama
- Guarda memoria en Supabase (`nova_threads`, `nova_messages`)
- Registra uso en `llm_usage`
- No encola acciones productivas desde chat. Hocker ONE controla ejecución real mediante Owner Gate y `agi_action_queue`.

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
  "prefer": "auto",
  "mode": "auto|fast|pro",
  "allow_actions": false, // forzado por política 12.7D
  "user_id": null,
  "user_email": null
}