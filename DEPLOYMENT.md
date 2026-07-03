# NOVA Orchestrator — Deployment Checklist

Resumen mínimo para desplegar nova.agi en producción.

1) Node.js version
- Este servicio requiere Node 22.x (declarado en package.json `engines.node`).
- En plataformas (Railway, Cloud Run, Docker) asegúrate de usar Node 22.

2) Supabase & secrets
- Variables obligatorias (server-only):
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - NOVA_ORCHESTRATOR_KEY (en producción)
  - HOCKER_COMMAND_HMAC_SECRET
- Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` en variables públicas o en el frontend.

3) Build & run
- Para desarrollo:
```bash
npm ci
npm run dev
```

- Para producción (build + run):
```bash
npm ci --production
npm run build
npm start
```

4) Docker / Cloud Run / Railway
- Dockerfile incluido; el runtime objetivo es Node 22.
- Para Cloud Run: establecer `--region` igual a la región de la base de datos para minimizar latencia.
- Health check: /health

5) Seguridad y despliegue ordenado
- Aplicar migraciones en Supabase ANTES de desplegar el código que espera nuevas columnas/triggers.
- Añadir las variables de entorno server-only en el vault de la plataforma (Railway secrets, Cloud Run env vars o GitHub Actions secrets).
- Verificar que `NODE_ENV=production` y `PORT` estén configurados correctamente.

6) Comprobaciones locales recomendadas
```bash
# typecheck
npm run typecheck
# build
npm run build
```

7) Observabilidad
- Recomendado activar Langfuse/observability con claves en entorno si se utiliza `langfuse-node`.

---

He agregado este checklist para alinear la operativa con hocker.one: Node 22.x y migraciones Supabase primero. Si quieres que aplique más cambios automáticos (p. ej. saneamiento extra de config, validaciones runtime o eliminación de archivos duplicados), dime y procedo con commits a main.
