# NOVA.AGI — Instrucciones operativas para Codex y agentes de ingeniería

Este repositorio implementa el runtime/orquestador dedicado de NOVA. Estas instrucciones son durables: no sustituyen evidencia de despliegue, salud, configuración o seguridad.

## 1. Lee antes de modificar

En este orden:

1. `README.md` — contrato funcional actual.
2. `SECURITY.md` — límites de seguridad y secretos.
3. `docs/CONTINUITY.md` — recuperación, handoff y evidencia mínima de runtime.
4. `DEPLOYMENT.md`, `Dockerfile` y `railway.json` — contrato de despliegue; no equivalen por sí solos a un deployment vivo.
5. código/tests/migraciones actuales.
6. Context Bridge y evidence packs de Hocker One cuando la tarea afecte al ecosistema global.

La jerarquía HOCKER es: producción/configuración verificable > `main`/migraciones > contratos/tests > evidencia aprobada > canon > historia.

## 2. Responsabilidad del repo

NOVA.AGI:

- recibe solicitudes autenticadas desde Hocker One;
- enruta provider/modelo con fallback controlado;
- persiste conversación/memoria operativa autorizada;
- registra uso y observabilidad;
- prepara respuestas/propuestas;
- **no ejecuta acciones productivas desde el chat**.

Hocker One conserva Owner Gate, `agi_action_queue`, aprobación, ejecución material, evidencia y recuperación global.

## 3. No negociables

- No escribir directamente a `main`; branch + PR.
- `allow_actions=false` permanece como default contractual.
- No introducir un segundo Owner Gate, una segunda cola de ejecución o credenciales cloud maestras dentro de NOVA.
- No inventar salud, conexión, deployment, certificación ni porcentaje de avance.
- Configuración de Railway/Cloud Run/Docker no significa runtime vivo; verificar endpoint y logs reales.
- No almacenar tokens, service-role keys, cookies, TOTP, KYC, PII restringida ni conversaciones privadas en contexto compartido.
- Datos de PUNTO·G, Chido, Wallet, NEXPA, Trackhok u otros dominios sensibles permanecen aislados salvo hechos explícitamente autorizados/agregados.
- No copiar providers/tools desde Hocker One sin contrato de compatibilidad. Si existen dos registries, documentar owner de verdad, adapter y plan de convergencia.

## 4. Contexto compartido y continuidad

El sistema compartido no es un archivo gigante ni un volcado de chats:

- **Context Bridge** en `HockerAGI/hocker.one` es el ledger operacional compartido para checkpoints, manifests y cobertura.
- **SYNTIA / Memory Mirror** conserva aprendizaje reutilizable revisado y con aislamiento por dominio.
- `AGENTS.md` aporta reglas durables del repo a Codex; no debe contener estado dinámico que envejezca.
- `docs/CONTINUITY.md` define el handoff local de NOVA: SHA, PR, target de deployment, health/readiness, routing, herramientas, memoria, eval evidence, blockers y siguiente acción.

### Al iniciar una sesión

1. lee `AGENTS.md` y `docs/CONTINUITY.md`;
2. confirma el SHA actual de la rama y `main`;
3. revisa PRs abiertos;
4. revalida cualquier dato mutable de deployment/runtime;
5. consulta Context Bridge/Hocker One si la tarea depende del estado global.

### Al cerrar un hito

Después de cambios materiales de runtime, provider routing, tools, memory, deployment, health/readiness, eval evidence, blockers o fase, publica un checkpoint normalizado hacia Context Bridge cuando exista identidad autorizada. Si no puede publicarse, deja el handoff explícito en la rama y marca la evidencia pendiente. Nunca guardes el chat crudo.

## 5. Desarrollo

Runtime actual: Node 22 + Fastify 5 + TypeScript.

Comandos principales:

```bash
npm test
npm run typecheck
npm run build
```

Antes de cambiar routing/modelos/memoria/tools:

1. define comportamiento esperado y riesgo;
2. escribe/ajusta test;
3. implementa el cambio mínimo;
4. ejecuta tests + typecheck + build;
5. verifica auth, timeouts, fallback y sanitización;
6. para cambios de proveedor/modelo, exige regression eval y rollback;
7. para cambios de datos, usa migración compatible y valida RLS/grants en el proyecto autorizado;
8. actualiza el handoff/checkpoint de continuidad al finalizar un hito.

Los cambios exclusivamente Markdown no deben consumir un CI completo. Cualquier cambio de código, tests, workflow, config, manifest, lockfile, Docker/Railway o migración sí mantiene CI obligatorio.

## 6. API y seguridad

- Mantén auth server-to-server mediante `NOVA_ORCHESTRATOR_KEY` o el mecanismo aprobado que lo sustituya.
- Health endpoints pueden ser públicos sólo en el alcance mínimo diseñado; nunca exponen secretos/configuración sensible.
- Validar input/output estructurado y limitar tamaños/timeouts.
- Logs/trazas no deben contener credenciales o PII innecesaria.
- `service_role` sólo en backend confiable y no sustituye autorización de negocio.
- Toda tool externa debe tener scopes mínimos, timeout, manejo de error y evidencia.

## 7. Memoria y aprendizaje

- `nova_threads`/`nova_messages` son continuidad conversacional operativa, no conocimiento canónico global.
- La promoción de aprendizaje reutilizable pasa por SYNTIA/review gate.
- No convertir raw chats en memoria reutilizable automáticamente.
- Mantener procedencia, tenant/project scope, sensibilidad, retención y capacidad de rollback/versionado.

## 8. Runtime live y release

NOVA ya expone `/health/ready` y `railway.json` lo usa como healthcheck. Esto demuestra contrato ejecutable, no un deployment vivo.

Para considerar un runtime dedicado verificado se requiere al menos:

- deployment identificado y asociado a un commit exacto;
- respuesta reproducible de `/health/ready` sobre ese deployment;
- logs/runtime heartbeat observables;
- auth E2E desde Hocker One;
- routing/fallback probado;
- persistencia/telemetría observable;
- evals vigentes;
- budget/cost visibility;
- runbook y rollback.

No fusionar cambios materiales mientras los gates aplicables no estén verdes.
