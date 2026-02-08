# nova.agi (NOVA Orchestrator)

Orquestador dual (OpenAI + Gemini) con:
- Auto-router por intención (code / research / ops / general)
- Memoria persistente en Supabase: nova_threads / nova_messages
- Multi-proyecto: project_id + thread_id
- Tracking de uso en llm_usage (tokens estimados si no hay usage real)
- Acciones opcionales (seguras): events + enqueue_command

## Endpoints
- GET  /health
- POST /v1/seed   (Authorization: Bearer NOVA_ORCHESTRATOR_KEY)
- POST /v1/chat   (Authorization: Bearer NOVA_ORCHESTRATOR_KEY)

## Body /v1/chat
Acepta:
- message (preferido) o text (compat)
- project_id, thread_id (uuid)
- prefer: "openai" | "gemini" | "auto"
- mode: "fast" | "pro" | "auto"

## Run
- npm i
- cp .env.example .env.local (pon tus keys reales)
- npm run build
- node dist/index.js

## Nota clave
Tu hocker.one debe mandar:
Authorization: Bearer <NOVA_ORCHESTRATOR_KEY>
(o x-hocker-key)