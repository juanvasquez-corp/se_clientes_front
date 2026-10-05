# Plan de implementación — Spec 008: Listado, búsqueda y paginación de usuarios

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 002–007, endpoints list/search

## Resumen técnico

Crear la feature `users` con servicios de listado y búsqueda exacta, queries cancelables y una página que alterna tabla desktop/tarjetas móvil. Búsqueda y paginación son modos mutuamente excluyentes; no se añaden filtros de rol/estado.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/features/users/users-api.ts` | GET paginado y POST search exacto con Zod | RF-1, RF-4, RF-7 |
| `src/features/users/user-query-keys.ts`, `users-query.ts` | Keys por sesión/página/email, AbortSignal | RF-1, RF-3, RF-4, RF-6, RF-9 |
| `src/features/users/search-schema.ts` | Email exacto normalizado | RF-4, RF-5 |
| `src/features/users/users-page.tsx` | Header, Crear, estados y modo | RF-1, RF-6–RF-9, RF-12 |
| `src/features/users/user-table.tsx`, `user-card-list.tsx` | Datos/acciones desktop y móvil | RF-2, RF-10, RF-11 |
| `src/features/users/user-search.tsx`, `pagination.tsx` | Buscar/limpiar/paginar | RF-3–RF-7 |
| `src/features/users/*.test.tsx`, `tests/e2e/users-directory.spec.ts` | Directorio completo | RF-1–RF-12 |

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `normalizePage` | número | entero ≥1 | RF-3 |
| `directoryMode` | email activo | `list | search` | RF-4, RF-6 |
| `lastValidPageAfterDelete` | total, size, actual | página válida | caso límite |
| `canManageTarget` | current UUID, target UUID | acciones propias ocultas | RF-11 |

No aplica `hoy`.

## Algoritmo

```text
modo list → GET /users?page&size (máximo 50)
submit email válido → modo search → POST /users/search
404 search → estado sin resultado; no error global
clear → cancelar search → modo list/página conservada
nueva interacción cancela AbortSignal anterior
desktop tabla; mobile cards por CSS
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Search como query POST | lectura cacheable/cancelable | mutation persistente | RF-4, RNF-3 |
| Estado de modo local/URL interna tipada | no Zustand remoto | duplicar resultados en store | RF-1–RF-6 |
| Tabla + cards CSS | semántica óptima por viewport | comprimir tabla | RF-10 |
| Sin filtros | API no los soporta | filtrar página localmente | fuera de alcance |

## Pruebas y trazabilidad

- `npm run test`: paginación, search válido/inválido/404, clear, abort, vacío, nulos, acciones propias y Crear.
- E2E/backend real: solo superadmin, desktop/móvil, red/503 y teclado/axe.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de E2E y Chrome consola/móvil.

| RF | Diseño/prueba |
|---|---|
| RF-1–RF-3 | API/query/table/pagination |
| RF-4–RF-7 | schema/search/modes/404 |
| RF-8, RF-9 | AsyncState/skeleton |
| RF-10 | card list responsive |
| RF-11 | canManageTarget/actions |
| RF-12 | page header/empty action |

## Dependencias, secuencia y riesgos

Depende de 002,003,005,006 y reutiliza componentes 007. Orden: API/keys → list/pagination → search → responsive/actions → E2E. Riesgo: mockups muestran filtros prohibidos; no se implementan.

## Pendientes de aclaración

Ninguno.
