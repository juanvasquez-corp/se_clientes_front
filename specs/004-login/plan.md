# Plan de implementación — Spec 004: Inicio de sesión

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 001–003, mockups de login

## Resumen técnico

Implementar el login como feature vertical: schema RHF+Zod, servicio sobre `authClient`, estado de sesión mínimo en Zustand vanilla y UI responsive. El bloqueo 429 se calcula con funciones puras y reloj inyectado; no se persiste.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/features/auth/login-schema.ts` | Validar/normalizar `email`, `password` | RF-2 |
| `src/features/auth/retry-after.ts` | Interpretar segundos/fecha/fallback y vencimiento | RF-6, RF-7 |
| `src/core/session/auth-api.ts` | `POST /api/auth/login` con contrato validado; Spec 005 lo amplía con CSRF/refresh/logout | RF-3–RF-8 |
| `src/core/session/session-store.ts` | Credenciales e identidad solo memoria; extensible por Spec 005 | RF-4, RF-9 |
| `src/features/auth/login-form.tsx` | RHF, labels, revelar contraseña, pending, errores | RF-1–RF-8 |
| `src/features/auth/login-page.tsx` | Composición desktop/móvil con assets | RF-1, RF-9 |
| `src/features/auth/*.test.tsx`, `tests/e2e/login.spec.ts` | Matriz login/429/a11y | RF-1–RF-9 |

## Interfaces y funciones puras

```ts
type LoginInput = { email: string; password: string }
type LoginSuccess = { accessToken: string; csrfToken: string; expiresIn: number }
type LoginSessionPort = { acceptLogin(tokens: LoginSuccess): Promise<User> }
```

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `parseRetryAfter` | header, `hoy: Date` | fecha de desbloqueo; fallback +5 min | RF-6 |
| `remainingLockMs` | fecha, `hoy: Date` | milisegundos no negativos | RF-7 |
| `normalizeLoginInput` | valores formulario | email minúscula + payload `password` | RF-2 |

## Algoritmo

```text
validar → bloquear submit → login bajo puerto de sesión
200 → guardar tokens memoria → GET /users/me validado → entregar rol al router
401 → conservar email, borrar password, error genérico
429 → parseRetryAfter(header, hoy) → deshabilitar hasta vencimiento
red/503 → conservar email, borrar password, retry manual
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| RHF + Zod resolver | stack y errores accesibles | estado manual | RF-2 |
| Reloj inyectado | tests deterministas de HTTP-date | `Date.now()` dentro de lógica | RF-6, RF-7 |
| Timer en memoria | spec indica que recarga no conserva bloqueo | storage | RF-6, RF-7 |
| Fondo por CSS media query | assets específicos y sin JS | una imagen recortada | RNF-3 |

## Pruebas y trazabilidad

- `npm run test`: validación, doble submit, 401, red/503, todas las variantes Retry-After con fake timers y accesibilidad.
- E2E/backend real: login de los tres roles, cookie HttpOnly no accesible, consola limpia y móvil.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de `npm run test:e2e`.

| RF | Diseño/prueba |
|---|---|
| RF-1 | login-page/form; snapshot semántico y ausencia de enlaces |
| RF-2 | schema; límites |
| RF-3 | pending; conteo MSW |
| RF-4 | API/store/profile; E2E válido |
| RF-5 | caso 401 |
| RF-6, RF-7 | retry-after + reloj/fake timers |
| RF-8 | red/503 y retry |
| RF-9 | router/session port con cada rol |

## Dependencias, secuencia y riesgos

Depende de 001–003; Spec 005 amplía sesión y Spec 006 registra ruta/destino. Orden: schema/reloj → API/store → form/page → E2E. Riesgo: `Retry-After` no legible por CORS; la función aplica cinco minutos sin cambiar backend.

## Pendientes de aclaración

Ninguno.
