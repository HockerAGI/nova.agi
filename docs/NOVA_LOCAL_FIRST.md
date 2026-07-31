# NOVA local: continuidad sin Railway ni créditos de IA

Este modo permite ejecutar NOVA y un motor de IA local en una computadora o servidor propio.

## Qué resuelve

- NOVA puede seguir respondiendo cuando Railway no tenga cuota.
- El motor local no consume créditos de OpenAI, Gemini o Anthropic.
- Los modelos descargados quedan guardados en un volumen local.
- Los proveedores de nube pueden mantenerse como respaldo opcional.

## Requisitos

- Docker y Docker Compose.
- Memoria y almacenamiento suficientes para el modelo elegido.
- Una conexión válida con la base de Hocker.

## Arranque

1. Copiar `.env.local.example` como `.env.local`.
2. Completar únicamente las claves privadas necesarias.
3. Ejecutar:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

4. Comprobar NOVA:

```bash
curl http://localhost:8080/health
```

## Cómo funciona la continuidad

1. NOVA revisa qué motores están configurados.
2. Omite los motores cuyo límite mensual ya se alcanzó.
3. Prueba el siguiente motor disponible.
4. Si el motor local está activo, lo utiliza sin consumir créditos externos.
5. Si ningún motor responde, NOVA conserva un modo mínimo de supervivencia y no inventa resultados.

## Seguridad

- Nunca guardar `.env.local` en GitHub.
- Las herramientas que modifican datos no se ejecutan directamente desde NOVA.
- Toda modificación debe pasar por el Owner Gate de Hocker ONE.
- El motor local no elimina las reglas de permisos, aprobación, auditoría ni evidencia.

## Operación recomendada

- Mantener Railway como respaldo, no como único punto de operación.
- Mantener un nodo local encendido para tareas internas y recuperación.
- Usar motores de nube para trabajos donde aporten una ventaja clara.
- Usar el motor local para consultas internas, clasificación, resúmenes y continuidad.
