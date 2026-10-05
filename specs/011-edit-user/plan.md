# Plan de implementación — Spec 011: Edición administrativa de usuario

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 002–010, `PUT /api/users/{uuid}`

## Resumen técnico

Crear un formulario administrativo precargado desde el detalle público. El schema comparte identidad, añade cédula opcional vacía y rol condicional. El builder siempre envía perfil básico completo, omite cédula vacía y rol propio/no modificado, y nunca incluye estado.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/features/users/edit-user-schema.ts` | Perfil, cédula opcional y rol | RF-2–RF-5, RF-12 |
| `src/features/users/edit-user-payload.ts` | PUT completo/condicional | RF-3, RF-5–RF-7 |
| `src/features/users/users-api.ts` | Añadir `updateUser(uuid,payload)` | RF-7, RF-9, RF-11, RF-13 |
| `src/features/users/use-edit-user.ts` | Mutation sin retry e invalidaciones | RF-8, RF-9, RF-11, RF-13 |
| `src/features/users/edit-user-form.tsx` | Precarga, restricciones, pending y errores | RF-1–RF-8, RF-11–RF-13 |
| `src/features/users/edit-user-page.tsx` | Breadcrumb, cancel y navegación detalle | RF-1, RF-9, RF-10 |
| `src/features/users/edit-user*.test.tsx`, `tests/e2e/edit-user.spec.ts` | Own/other, privacidad y PUT | RF-1–RF-13 |

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `editDefaultsFromUser` | UserResponse | form con `cedula=''` | RF-1 |
| `buildAdminUpdatePayload` | values + target/current UUID/rol inicial | payload sin estado y campos condicionales | RF-3–RF-7 |
| `clearCedulaAfter401` | values | values con cédula vacía | RF-13 |
| `isOwnAdministrativeEdit` | UUIDs | booleano | RF-5 |

No aplica `hoy`.

## Algoritmo

```text
query detail → defaults públicos + cedula vacía
self → role readonly/omitido; other → role selector
submit → validar → builder → PUT una vez
success → invalidar list/detail/profile aplicables → /users/$uuid
403/409/422 → conservar valores, mantener restricciones
401 → refresh sin replay → borrar cédula → nueva confirmación
cancel → detail sin PUT
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Cédula fuera de defaults remotos | API no la devuelve | valor inventado/precargado | RF-1, RF-3 |
| Readonly visual para rol/estado | información copiable y no enviada | hidden mutable/disabled ambiguo | RF-5, RF-6 |
| Builder condicional | semántica PUT segura | spread del formulario | RF-7 |
| Invalidar detalle/lista/perfil propio | coherencia | editar caché parcial manual | RF-9 |

## Pruebas y trazabilidad

- `npm run test`: defaults, límites, cédula ASCII/ceros/omisión, self/other, payload, pending, success/cancel, 403/409/422/404/timeout/401.
- E2E/backend real: editar tercero, propia cuenta/cédula, último admin, URL/log sin cédula, móvil/axe.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de E2E y Chrome consola/móvil.

| RF | Diseño/prueba |
|---|---|
| RF-1 | defaults/page; cédula vacía |
| RF-2–RF-6, RF-12 | schema/form; matriz own/other/límites |
| RF-7 | builder/body exacto |
| RF-8 | mutation count |
| RF-9, RF-10 | navegación e invalidación |
| RF-11 | matriz 403/409/422 y restricciones |
| RF-13 | no replay, clear cédula, confirmación |

## Dependencias, secuencia y riesgos

Depende de 002,003,005,006,010; Spec 012 gestiona estado aparte. Orden: defaults/schema/builder → API/hook → form/page → errors/E2E. Riesgo: cédula sensible en logs/devtools; nunca se registra y tests inspeccionan solo body capturado en memoria.

## Pendientes de aclaración

Ninguno.
