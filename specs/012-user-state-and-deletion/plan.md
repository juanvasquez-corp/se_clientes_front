# Plan de implementación — Spec 012: Estado y eliminación lógica de usuarios

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 002–011, endpoints status/delete

## Resumen técnico

Completar las acciones del detalle con mutations separadas PATCH/DELETE, confirmaciones compuestas y política sin retry. El frontend oculta acciones propias, pero deja al backend resolver último superadmin y clasifica 409 por operación/status, no por mensaje.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/features/users/user-action-policy.ts` | Acciones propias/ajenas y estado objetivo | RF-1, RF-2 |
| `src/features/users/users-api.ts` | Añadir PATCH status y DELETE | RF-4, RF-7, RF-10–RF-12 |
| `src/features/users/use-user-status.ts`, `use-delete-user.ts` | Mutations sin retry e invalidación | RF-5, RF-8–RF-12 |
| `src/features/users/status-dialog.tsx` | Confirmación activa/inactiva | RF-3–RF-5, RF-9–RF-12 |
| `src/features/users/delete-user-dialog.tsx` | Confirmación destructiva | RF-6–RF-12 |
| `src/features/users/user-detail-actions.tsx` | Integrar botones válidos en detalle | RF-1, RF-2 |
| `src/features/users/user-state*.test.tsx`, `tests/e2e/user-state.spec.ts` | Reglas, conflictos y navegación | RF-1–RF-12 |

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `availableAccountActions` | current UUID, target | status/delete permitidos | RF-1, RF-2 |
| `buildStatusPayload` | estado objetivo | `{ is_active: boolean }` estricto | RF-3, RF-4 |
| `pageAfterDeletion` | total, size, current | última página válida | RF-8, caso límite |
| `operationConflictMessage` | operación + status | regla último superadmin sin comparar backend text | RF-9 |

No aplica `hoy`.

## Algoritmo

```text
derive actions → self: ocultar; other: mostrar según estado
open confirm → mostrar target/result → confirm una vez
PATCH success → invalidate detail/list → permanecer detail + toast
DELETE success → remove/invalidate → navigate /users en página válida
409 deactivate/delete → conservar dialog/context + regla visible
403 → sin estado optimista + acceso denegado
timeout/red/5xx → no replay; recargar para comprobar
401 → refresh sin replay → cerrar confirm consumida → exigir abrir/confirmar otra vez
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Hooks separados status/delete | contratos y navegación distintos | mutation genérica con booleanos | RF-3–RF-8 |
| Sin optimistic update | reglas concurrentes backend | cambiar UI antes de confirmar | RF-5, RF-9, RF-10 |
| 409 por operación/status | no comparar mensajes | texto español backend | RF-9 |
| Confirmación consumida tras 401 | evita replay accidental | reabrir/enviar solo | RF-12 |
| No calcular último admin | paginación impide certeza | contar página local | RF-9 |

## Pruebas y trazabilidad

- `npm run test`: actions self/other, boolean body, modal/foco, doble confirm, success, 403/404/409/timeout/401, página tras delete.
- E2E/backend real: activar/desactivar/eliminar tercero, propia cuenta, último superadmin, roles y no restauración.
- Chrome móvil/teclado/axe/consola; puerta `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de E2E.

| RF | Diseño/prueba |
|---|---|
| RF-1, RF-2 | policy/actions; self/other |
| RF-3–RF-5 | status dialog/hook; confirm/body/success |
| RF-6–RF-8 | delete dialog/hook; single request/list |
| RF-9 | 409 deactivate/delete y activación sin conflicto esperado |
| RF-10 | 403 visible sin update optimista |
| RF-11 | timeout/red/5xx cero retry |
| RF-12 | 401, refresh, confirmación consumida |

## Dependencias, secuencia y riesgos

Depende de 002,003,005,006,008,010 y reutiliza acciones de 010. Orden: policy/builders → APIs/hooks → dialogs → integración/navegación → E2E. Riesgo: concurrencia del último admin; backend manda y se verifica 409, sin suposición local.

## Pendientes de aclaración

Ninguno.
