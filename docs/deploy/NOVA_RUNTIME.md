# NOVA Runtime

Este servicio está preparado para Railway y Google Cloud Run usando el mismo Dockerfile.

## Runtime

- Node 22
- Puerto interno: 8080
- Health check: /health
- Start: node dist/index.js

## Variables requeridas

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

Al menos una:
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

## Railway

Railway usa Dockerfile + railway.json.

## Cloud Run futuro

Cuando haya billing activo:

gcloud run deploy nova-agi \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2
