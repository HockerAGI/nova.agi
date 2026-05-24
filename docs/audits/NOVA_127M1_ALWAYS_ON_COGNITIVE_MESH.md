# NOVA.AGI · 12.7M-1 Always-On Cognitive Mesh

## Objetivo

Blindar NOVA para que el cambio de proveedor sea invisible para el usuario y la continuidad no se rompa cuando un proveedor falle por cuota, crédito, timeout o error.

## Alcance

- No reemplaza el router nativo existente.
- No duplica Hocker ONE diagnostics provider router.
- No ejecuta acciones productivas.
- No toca Hocker ONE.
- No expone proveedor/modelo al usuario.

## Cambios

- Política invisible en system prompt.
- Sanitización final de fuga de nombres de proveedores/modelos/cuotas.
- Survival Mode si todos los proveedores fallan.
- Endpoint interno `/mesh/status`.
- Overrides opcionales de modelos por variables de entorno.
- Provider status actualizado con política always-on.

## Regla de oro

NOVA mantiene una sola voz pública. Los detalles técnicos quedan en metadata interna.
