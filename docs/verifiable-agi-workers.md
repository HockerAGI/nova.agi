# Trabajadores AGI verificables

Este módulo convierte perfiles especializados del ecosistema Hocker en trabajadores agentic verificables. No demuestra conciencia ni AGI general.

## Contrato operativo

1. NOVA registra una solicitud IA↔IA.
2. Se crea una tarea idempotente en `agi_tasks`.
3. Un worker reclama una sola tarea mediante lock atómico.
4. El perfil especializado analiza únicamente la entrada suministrada.
5. El runtime prueba proveedores disponibles dentro del presupuesto.
6. El resultado se normaliza, se firma con SHA-256 y guarda evidencia.
7. La tarea se completa o se reintenta según `max_attempts`.
8. El perfil devuelve a NOVA una respuesta correlacionada con `message_id`, `task_id`, `run_id` y `result_hash`.
9. Cualquier acción externa permanece como borrador y requiere Owner Gate en Hocker ONE.

## Variables

```env
# El loop permanece desactivado por defecto.
NOVA_AGI_WORKER_ENABLED=false
NOVA_AGI_WORKER_ID=nova-worker-primary
NOVA_AGI_WORKER_PROJECT_ID=hocker-one
NOVA_AGI_WORKER_INTERVAL_MS=30000

# Vacío procesa cualquier perfil activo. También puede limitarse a un perfil.
NOVA_AGI_WORKER_ASSIGNED_AGI=
```

El intervalo se limita entre 10 segundos y 5 minutos. El worker procesa una tarea a la vez y evita ejecuciones superpuestas.

## Endpoints autenticados

Todos utilizan el mismo bearer `NOVA_ORCHESTRATOR_KEY` del runtime.

- `GET /api/v1/agi/workers/status`
- `POST /api/v1/agi/tasks`
- `GET /api/v1/agi/tasks/:taskId?project_id=hocker-one`
- `POST /api/v1/agi/workers/run-once`
- `POST /api/v1/agi/workers/recover-stale`

## Activación segura

1. Confirmar que la migración `20260731_160000_verifiable_agi_workers.sql` fue revisada y aplicada.
2. Consultar `GET /api/v1/agi/workers/status` y exigir `schema_ready=true`.
3. Crear una tarea de prueba con `write_policy=read_only`.
4. Ejecutar `run-once` y validar salida, evidencia y hash.
5. Confirmar que NOVA recibió el mensaje de respuesta correlacionado.
6. Activar el loop con `NOVA_AGI_WORKER_ENABLED=true`.
7. Mantener `NOVA_AGI_WORKER_ASSIGNED_AGI` limitado durante el primer despliegue.
8. Ampliar perfiles únicamente después de revisar calidad, costo y evidencia.

## Proveedores y continuidad

El worker usa el router de proveedores existente y descarta proveedores sin configuración o sin presupuesto. Ollama local permanece dentro de los fallbacks cuando está configurado.

Si todos los proveedores están agotados, la tarea falla o se reintenta. El runtime no guarda una respuesta genérica de supervivencia como trabajo completado.

## Límites deliberados

- Sin herramientas MCP dentro del worker.
- Sin ejecución directa de APIs, archivos, pagos, despliegues o comandos.
- Sin auto-modificación de código.
- Sin transferencia automática de una conclusión a memoria aprobada.
- Los `action_drafts` son propuestas; Owner Gate decide y registra la ejecución real.
