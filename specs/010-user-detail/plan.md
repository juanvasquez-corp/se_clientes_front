# Plan de implementación — Spec 010: Detalle administrativo de usuario

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 002–009, `GET /api/users/{uuid}`

## Resumen técnico

Extender `users` con consulta de detalle por UUID tipado, query cancelable y página responsive. Un componente de acciones recibe puertos para edición/estado/eliminación; Spec 012 completa las mutaciones, mientras esta spec define visibilidad propia/ajena.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/features/users/users-api.ts` | Añadir `getUser(uuid, signal)` validado | RF-1, RF-2, RF-7 |
| `src/features/users/user-query-keys.ts`, `user-detail-query.ts` | Key detalle por sesión/UUID | RF-1, RF-8 |
| `src/features/users/user-detail-page.tsx` | Carga, 404, retry y composición | RF-1–RF-3, RF-7, RF-8 |
| `src/features/users/user-detail-card.tsx` | Seis campos públicos y nulos | RF-2 |
| `src/features/users/user-detail-actions.tsx` | Editar y slots de estado/eliminar por target | RF-4–RF-6 |
| `src/features/users/user-detail*.test.tsx`, `tests/e2e/user-detail.spec.ts` | UUID, privacidad, self/other | RF-1–RF-8 |

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `parsePublicUuid` | param desconocido | UUID válido o not-found | RF-1, RF-7 |
| `detailActionsFor` | current UUID, target UUID | edición + acciones ajenas | RF-4–RF-6 |
| `detailBreadcrumb` | viewport | completo o retorno móvil | RF-3 |

No aplica `hoy`.

## Algoritmo

```text
validar param UUID → query getUser(signal)
success → render seis campos y actionsFor
404/UUID inválido → not-found + Volver a usuarios
red/503 → conservar ruta/UUID + retry
mutación posterior success → invalidar/refetch detail mismo UUID
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Query por UUID/época | caché aislada por sesión | objeto pasado desde lista | RF-1, RF-8 |
| Acciones derivadas por UUID | regla propia simple | confiar solo en rol/ocultar tarde | RF-5, RF-6 |
| Slots para Spec 012 | evita acoplar lectura a mutaciones | HTTP en página | RF-5 |
| 404 contextual | ruta normativa sin ruta 404 nueva | añadir endpoint/ruta | RF-7 |

## Pruebas y trazabilidad

- `npm run test`: UUID válido/inválido, data/nulos, self/other, 404, red/503, invalidación y privacidad.
- E2E/backend real: superadmin, master/visualizer bloqueados por guard, móvil/axe.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de E2E y Chrome consola/móvil.

| RF | Diseño/prueba |
|---|---|
| RF-1, RF-2 | API/query/card |
| RF-3 | page/breadcrumb |
| RF-4–RF-6 | actionsFor/component |
| RF-7 | invalid UUID/404 state |
| RF-8 | invalidación y refetch |

## Dependencias, secuencia y riesgos

Depende de 002,003,005,006,008; 011/012 consumen esta página. Orden: param/API/query → card → actions → estados/E2E. Riesgo: mockups sugieren cédula/fechas; no se renderizan porque el contrato no las expone.

## Pendientes de aclaración

Ninguno.
