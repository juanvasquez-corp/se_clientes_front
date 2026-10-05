# Plan de implementación — Spec 003: Integración segura y tratamiento de errores

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 001–002, contrato FastAPI efectivo

## Resumen técnico

Crear contratos Zod estrictos, dos instancias Axios y una taxonomía de errores independiente de textos. TanStack Query gestionará caché/cancelación; el coordinador de sesión de Spec 005 será una interfaz inyectada para recuperar un único `401` de lectura sin repetir mutaciones.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/contracts/schemas/user.ts`, `auth.ts`, `error.ts` | Schemas estrictos de éxito y `detail` | RF-1, RF-2, RF-5 |
| `src/core/http/errors.ts` | `ContractError`, `ApiError`, clasificación estable | RF-4, RF-6–RF-8, RF-18 |
| `src/core/http/parse-response.ts` | `safeParse` y rechazo de JSON corrupto | RF-1, RF-2 |
| `src/core/http/request-policy.ts` | URLs permitidas, headers, retry y payload | RF-3, RF-9, RF-13–RF-17, RF-19 |
| `src/core/http/auth-client.ts`, `api-client.ts` | Instancias separadas; bearer/401 sin recursión | RF-9, RF-13–RF-17 |
| `src/core/http/validation-errors.ts` | Mapeo de `detail[].loc` a formulario | RF-5 |
| `src/app/query-client.ts` | Retry de lecturas, cero mutations, clear/invalidate | RF-8–RF-12 |
| `src/core/http/*.test.ts`, `src/contracts/schemas/*.test.ts` | Contratos y políticas MSW | RF-1–RF-19 |

## Arquitectura e interfaces

```ts
type SessionRecovery = { recoverRead(): Promise<'recovered'|'dead'|'blocked'|'unavailable'> }
type ApiFailure = { kind: 'bad-request'|'unauthorized'|'forbidden'|'not-found'|'conflict'|'validation'|'unavailable'|'contract'; status?: number; fields?: Record<string,string> }
```

`authClient` solo conoce `/api/auth/*`, usa cookies e intención de navegador y nunca se auto-intercepta. `apiClient` acepta endpoints tipados propios, toma bearer desde Zustand vanilla y consume `AbortSignal`. Servicios validan antes de devolver.

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `classifyApiFailure` | status + `unknown` | `ApiFailure` | RF-4, RF-6–RF-8, RF-18 |
| `mapValidationIssues` | `detail[]`, campos permitidos | errores campo/general | RF-5 |
| `isKnownApiTarget` | base + URL | booleano | RF-17 |
| `shouldRetryRead` | contador + failure | booleano | RF-8, RF-9 |
| `buildJsonBody` | whitelist + valores | objeto sin extras | RF-3 |

No hay fecha; no aplica `hoy`.

## Algoritmo

```text
request → validar target propio → adjuntar headers permitidos
response success → safeParse(schema) → data o ContractError
error → clasificar por status/schema
si lectura y primer 401 → recoverRead → repetir una vez solo si recovered
si mutación 401 → recoverRead sin repetir → devolver requires-confirmation
si mutación success → invalidar queries relacionadas
logout/cambio de cuenta → queryClient.clear()
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Dos clientes Axios | evita interceptor recursivo en auth | cliente único | RF-13–RF-17 |
| Zod estricto + `safeParse` | datos externos no confiables | tipos OpenAPI solos | RF-1, RF-2 |
| Status + shape | contrato estable | comparar mensajes españoles | RF-4 |
| Allowlist de endpoints | impide fuga de bearer | URL arbitraria | RF-17 |
| MSW | prueba red observable | mock Axios | todos |

## Pruebas y trazabilidad

- `npm run test`: schemas válido/inválido/JSON corrupto; códigos 400/401/403/404/409/413/415/422/503; headers; allowlist; AbortSignal; conteo de retries; clear/invalidate.
- Prueba de integración MSW para lectura `401→refresh→lectura` y mutación `401→refresh` sin replay.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`; navegador real se reserva para Specs 004–012.

| RF | Diseño/prueba |
|---|---|
| RF-1, RF-2 | schemas + parse-response; casos válido/inválido/corrupto |
| RF-3 | buildJsonBody; whitelist |
| RF-4–RF-8, RF-18 | classifier/mapping; matriz HTTP |
| RF-9, RF-19 | interceptor/policy; conteo de requests |
| RF-10 | AbortSignal; respuesta tardía descartada |
| RF-11, RF-12 | invalidación/clear |
| RF-13–RF-16 | inspección MSW de headers/cookies/JSON |
| RF-17 | URL externa rechazada sin credenciales |

## Secuencia, dependencias y riesgos

Depende de 001–002; 005 implementa `SessionRecovery`; 004/008 especializan 429/404. Orden: schemas → errores → políticas → clientes → Query → integración. Riesgo: OpenAPI no describe todos los errores; mantener schemas explícitos, sin tocar backend.

## Pendientes de aclaración

Ninguno.
