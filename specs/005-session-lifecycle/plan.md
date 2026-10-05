# Plan de implementación — Spec 005: Ciclo de vida y coordinación de sesión

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 001–004, OWASP enlazado en la spec, contrato auth backend

## Resumen técnico

Ampliar Zustand vanilla con una máquina de estados explícita y un coordinador independiente de React. `authClient` ejecutará CSRF/refresh/logout; una promesa compartida evita refresh duplicado, `navigator.locks` serializa pestañas y `BroadcastChannel` transmite solo señales. Query cache se limpia según identidad. Los estados bloqueados se integran con `/forbidden` y `/unavailable` sin almacenar secretos.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/core/session/session-types.ts`, `session-reducer.ts` | Estados `unknown/authenticated/dead/blocked/unavailable` y eventos | RF-1–RF-5, RF-15, RF-16, RF-20 |
| `src/core/session/session-store.ts` | Tokens/CSRF/identidad solo memoria y fachada router | RF-3, RF-4, RF-11, RF-13 |
| `src/core/session/auth-api.ts` | CSRF, refresh, logout con headers/cookies y Zod | RF-2, RF-18, RF-19 |
| `src/core/session/session-coordinator.ts` | Restauración, single-flight, lectura/mutación 401 | RF-2–RF-8, RF-15, RF-22 |
| `src/core/session/cross-tab.ts`, `session-lock.ts` | Locks, señales y fallback | RF-9–RF-11, RF-17, RF-21 |
| `src/app/session-bootstrap.tsx` | Bloquear contenido hasta resolver sesión | RF-1, RF-3–RF-5 |
| `src/features/auth/logout-dialog.tsx` | Confirmación, éxito, retry y 403 | RF-12–RF-14, RF-16, RF-19 |
| `src/features/auth/security-recovery-panel.tsx` | Contenido de cuarentena y restauración manual que Spec 006 monta en `/forbidden` | RF-16, RF-20 |
| `src/core/session/*.test.ts`, `tests/e2e/session.spec.ts` | Concurrencia, pestañas y errores | RF-1–RF-22 |

## Interfaces y funciones puras

```ts
type SessionState = Unknown | Authenticated | Blocked | Unavailable | Dead
type SessionSignal = 'logged-out' | 'session-replaced' | 'account-changed'
type RecoveryResult = 'recovered' | 'dead' | 'blocked' | 'unavailable'
```

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `reduceSession` | estado + evento | nuevo estado sin efectos | RF-1–RF-5, RF-11, RF-13–RF-17, RF-20 |
| `accessExpiresAt` | `expiresIn`, `hoy: Date` | instante informativo de expiración | RF-3, RNF-3 |
| `restorationOutcome` | paso + categoría error | transición/destino | RF-4, RF-5, RF-15, RF-16, RF-20, RF-21 |
| `shouldPreserveRoute` | UUID/rol/ruta | booleano | RF-17 |

## Algoritmos

```text
RESTORE: GET csrf → POST refresh → GET me → authenticated
401 en cualquier paso → clear session/cache → login
red/503 → unavailable, retry manual

READ 401: singleFlight(refresh) → éxito: replay lectura una vez; fallo: resultado seguro
MUTATION 401: singleFlight(refresh) → nunca replay; éxito: requires-confirmation

403 refresh/logout: quarantine identity/cache, drop usable tokens, /forbidden
acción manual → GET csrf → éxito: ofrecer retry original; fallo: RF-20

CROSS TAB: lock exclusivo → operación → signal sin tokens
signal replaced → limpiar/restore → conservar ruta solo si UUID/rol autorizan
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Reducer puro + store vanilla | usable por Axios/router, testeable | hooks dentro de interceptores/guards | todos |
| Single-flight manual | rotación propia | `axios-auth-refresh` | RF-6–RF-8 |
| Locks + BroadcastChannel | coordinación normativa | transmitir tokens/storage | RF-9–RF-11 |
| Señales mínimas | confidencialidad | perfil/tokens en canal | RNF-2 |
| Fail closed en 403 | contrato no distingue causa | comparar `detail` | RF-16, RF-20 |
| Mutación requiere confirmación | sin idempotency key | replay automático | RF-22 |

## Datos y errores

Tokens nunca salen de memoria ni se serializan. `queryClient.clear()` ocurre en logout/cambio de cuenta y reemplazo de sesión según spec. Un fallo de refresh por timeout/red no se reintenta. La caché en cuarentena permanece en memoria pero no se renderiza; solo se limpia cuando lo exige la transición.

## Pruebas y trazabilidad

- `npm run test`: reducer, reloj inyectado, headers, orden de restore, single-flight, outcomes por paso, locks/channels simulados, caché y logout.
- `npm run test:e2e`: backend real, recarga, expiración, dos pestañas, misma/distinta cuenta, 403/401/503, logout.
- Manual: Chrome DevTools, cookie HttpOnly, storage vacío, consola sin tokens.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de `npm run test:e2e`.

| RF | Diseño/prueba |
|---|---|
| RF-1–RF-5 | reducer/bootstrap; restore success/401/503 |
| RF-6–RF-8, RF-15 | coordinator; concurrencia y refresh fallido |
| RF-9–RF-11 | locks/channel/cache; E2E multipestaña |
| RF-12–RF-14, RF-19 | logout dialog/API; éxito/red/503 |
| RF-16, RF-20 | blocked state/page; matriz recuperación CSRF |
| RF-17, RF-21 | account replacement; cada paso y ruta |
| RF-18 | inspección de tres requests |
| RF-22 | matriz POST/PUT/PATCH/DELETE sin replay |

## Secuencia, dependencias y riesgos

Depende de 001–004 y habilita 006–012. Orden: reducer/store → API → restore → recovery 401 → cross-tab → logout/blocked → E2E. Riesgo: APIs de coordinación ausentes; fallback advierte y mantiene una pestaña operativa. Riesgo: carreras reales; Playwright usará dos páginas del mismo contexto.

## Pendientes de aclaración

Ninguno.
