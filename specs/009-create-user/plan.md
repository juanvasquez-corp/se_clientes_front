# Plan de implementación — Spec 009: Creación de usuario

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 002–008, `POST /api/users/create`

## Resumen técnico

Implementar formulario administrativo RHF+Zod reutilizando schemas de campos. El builder produce exactamente `document_number,name,last_name,email,phone_number,password,role`; nunca `is_active`. La cédula corresponde a `document_number`. La mutación no reintenta y navega al detalle devuelto.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/features/users/create-user-schema.ts` | Cédula, identidad, contraseña y rol | RF-2–RF-6 |
| `src/features/users/create-user-payload.ts` | Payload exacto y anulables | RF-3–RF-7 |
| `src/features/users/users-api.ts` | Añadir `createUser` validado | RF-7, RF-9, RF-11, RF-12 |
| `src/features/users/use-create-user.ts` | Mutation sin retry, invalidación y auth-required | RF-8, RF-9, RF-11, RF-12 |
| `src/features/users/create-user-form.tsx` | Campos, password reveal, errores/pending | RF-1–RF-8, RF-11, RF-12 |
| `src/features/users/create-user-page.tsx` | Breadcrumb, cancelación y navegación | RF-1, RF-9, RF-10 |
| `src/features/users/create-user*.test.tsx`, `tests/e2e/create-user.spec.ts` | Contrato y flujo | RF-1–RF-12 |

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `normalizeDocumentNumber` | texto | dígitos como string, ceros intactos | RF-3 |
| `buildCreateUserPayload` | valores válidos | payload exacto | RF-7 |
| `clearSensitiveAfter401` | valores | mismos valores con `password=''` | RF-12 |

No aplica `hoy`.

## Algoritmo

```text
validar siete campos → builder → POST una vez
201 + UserResponse válido → invalidar list → toast → /users/$uuid
409/422 → conservar no sensibles y mapear errores
401 → recuperar sesión sin replay → borrar password → exigir reingreso/confirmación
timeout/red/5xx → no replay; mostrar verificación manual
cancel → /users sin POST
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Schema específico compuesto | contraseña/cédula solo creación | schema genérico permisivo | RF-2–RF-6 |
| Builder explícito | evita `is_active`/extras | spread form | RF-7 |
| Password solo RHF y reset | secreto efímero | estado global/storage | RNF-1 |
| Sin retry mutation | duplicados sin idempotency key | retry automático | RF-8, RF-12 |

## Pruebas y trazabilidad

- `npm run test`: límites completos, payload exacto, doble submit, 201, 409/422, 401 y password limpiada, timeout.
- E2E/backend real: crear cada rol, detalle destino, cédula nunca URL/log, responsive/axe.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de E2E y Chrome consola/móvil.

| RF | Diseño/prueba |
|---|---|
| RF-1, RF-2 | page/form |
| RF-3–RF-6 | schema y límites |
| RF-7 | builder/MSW body |
| RF-8 | mutation count |
| RF-9, RF-10 | navegación success/cancel |
| RF-11 | 409/422 |
| RF-12 | 401, no replay, clear password |

## Dependencias, secuencia y riesgos

Depende de 002–008. Orden: schema/builder → API/hook → form/page → errores/E2E. Riesgo: mockup incluye estado; se omite por contrato normativo. La cédula nunca se precarga ni se usa en navegación.

## Pendientes de aclaración

Ninguno.
