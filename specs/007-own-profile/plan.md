# Plan de implementación — Spec 007: Consulta y edición del perfil propio

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 002–006, `PUT /api/users/me`

## Resumen técnico

Crear la feature `profile` con query del usuario actual, vista de solo lectura y formulario RHF+Zod para master/superadmin. El servicio construye un PUT completo y validado; perfiles remotos quedan en TanStack Query, nunca Zustand.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/contracts/schemas/user-input.ts` | Reglas reutilizables de nombre, email y teléfono | RF-6 |
| `src/features/profile/profile-api.ts` | GET/PUT `/api/users/me`, Zod y AbortSignal | RF-1, RF-7, RF-11 |
| `src/features/profile/profile-query.ts` | Query key por época de sesión e invalidación | RF-1, RF-9 |
| `src/features/profile/profile-form-schema.ts` | Campos y anulables | RF-3, RF-6, RF-7 |
| `src/features/profile/profile-page.tsx` | Carga/error y composición por rol | RF-1–RF-5, RF-9 |
| `src/features/profile/profile-form.tsx` | Editar/cancelar/pending/errores | RF-3, RF-6–RF-11 |
| `src/features/profile/profile-readonly.tsx` | Visualizer y datos ausentes | RF-2, RF-4, RF-5 |
| `src/features/profile/*.test.tsx`, `tests/e2e/profile.spec.ts` | Roles, PUT y responsive | RF-1–RF-11 |

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `normalizeOptionalField` | texto | trimmed o `null` | RF-2, RF-7 |
| `buildProfileUpdate` | valores válidos | `{name,last_name,phone_number,email}` | RF-7 |
| `profileModeForRole` | rol | `editable | readonly` | RF-3, RF-4 |

No aplica `hoy`.

## Algoritmo

```text
GET me validado → Query cache
visualizer → pares label/valor sin form
master/superadmin → reset form con respuesta
submit válido → buildProfileUpdate → PUT una vez
success → reemplazar/invalidate me → reset confirmado → toast
cancel → reset último confirmado
error → conservar inputs; 401 sigue Spec 005 sin replay
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Query para perfil | dato remoto | Zustand | RF-1 |
| Pares label/valor visualizer | lectura clara | inputs disabled | RF-4 |
| PUT completo campo por campo | evita borrar anulables | spread del form/state | RF-7 |
| Schema compartido de inputs | misma regla en crear/editar | validaciones duplicadas | RF-6 |

## Pruebas y trazabilidad

- `npm run test`: tres roles, nulos, límites, payload preserve/null, cancel, pending, 409/422/red/503 y axe.
- E2E/backend real: GET/PUT master y superadmin; visualizer sin controles; móvil.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de E2E; Chrome DevTools y consola.

| RF | Diseño/prueba |
|---|---|
| RF-1, RF-2 | API/page/readonly; data/nulos |
| RF-3–RF-5 | mode/components; matriz roles |
| RF-6, RF-7 | schemas/builder; límites y payload |
| RF-8 | mutation pending; doble click |
| RF-9, RF-10 | cache/reset/toast |
| RF-11 | matriz errores y sesión |

## Dependencias, secuencia y riesgos

Depende de 002–006. Orden: inputs → API/query → readonly → form → E2E. Riesgo: omitir anulables en PUT; builder exige las cuatro propiedades y tests de contrato.

## Pendientes de aclaración

Ninguno.
