# Plan de implementación — Spec 001: Inicialización del proyecto y control de versiones

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, `AGENTS.md`, `docs/constitution.md`, `docs/primeros_pasos/front_end.md`

## Resumen técnico

Git y las exclusiones locales ya fueron implementados en T1, sin commits. T1 reveló la excepción de bootstrap: `npm run test` terminó en ENOENT porque aún no existía `package.json`. La secuencia corregida no reabre T1; hace que T2 cree de forma atómica el runner mínimo y un smoke test verde. Desde T2, ninguna tarea puede cerrarse sin `npm run test` verde.

T2 quedó completada históricamente con React/DOM canary y un smoke verde bajo el requisito anterior. T3 alcanzará la nueva conformidad: primero hará fallar una prueba de política frente al manifiesto canary; después migrará ambos paquetes a React/DOM 19.3.0 estables, exactamente pareados y fijados, regenerará el lockfile con npm estándar e instalará el stack compatible sin overrides ni bypass. También verificará que la release estable exporta `ViewTransition` antes de usarla.

Después se completa Vite 8 + TypeScript estricto con Tailwind CSS v4/CSS3, calidad, contratos y pruebas. `.env` será local y `.env.example` versionable. Los seis recursos ya excluidos mediante `.git/info/exclude` nunca se añadirán a `.gitignore`.

## Archivos por crear o modificar

| Ruta | Acción | Responsabilidad | RF/RNF |
|---|---|---|---|
| `package.json`, `package-lock.json` | Creados en T2; migrar en T3/ampliar después | Sustituir canary por React/DOM 19.3.0 estables y pareados; completar stack sin bypass | RF-1, RF-3, RF-9, RF-10, RNF-6 |
| `vitest.config.ts`, `src/test/setup.ts`, `src/test/smoke.test.tsx` | Crear en T2 | jsdom, Testing Library y primer test ejecutable | RF-1, RF-3 |
| `src/test/react-compatibility.test.ts` | Crear en T3 | Fallar con prerelease/despareado/bypass y comprobar export estable de `ViewTransition` | RF-10, RF-11, RNF-6 |
| `vite.config.ts`, `tsconfig*.json` | Crear en T3 | Vite puerto 5173, React, Tailwind v4 y TypeScript estricto | RF-1, RF-2, RNF-1 |
| `eslint.config.js` | Crear en T4 | Lint y scripts de calidad posteriores al runner ya operativo | RF-1, RF-3, RNF-1 |
| `playwright.config.ts` | Crear en T8 | Playwright y axe sin bloquear los tests unitarios previos | RF-1, RF-3 |
| `src/main.tsx`, `src/app/providers.tsx`, `src/app/query-client.ts` | Crear | Entrada mínima y providers del stack aprobado | RF-1, RF-2 |
| `src/config/env.ts`, `src/config/env.test.ts`, `.env.example` | Crear | Validación runtime de `VITE_API_BASE_URL`; plantilla pública | RF-4, RF-5 |
| `.gitignore` | Crear | Ignorar `.env`, dependencias, builds, coverage y artefactos de prueba; nunca los seis recursos excluidos | RF-4, RF-8 |
| `.git/info/exclude` | Completado en T1; solo verificar | Seis exclusiones locales ya presentes | RF-7, RF-8 |
| `public/assets/*`, `src/styles/app.css` | Crear/copiar | Assets Aliar sin alteración e import inicial de Tailwind/tokens | RF-6 |
| `src/contracts/generated/` | Generar | Tipos OpenAPI de compilación; no sustituye Zod | RF-1, RF-3 |

## Arquitectura, componentes y contratos

- Dirección inicial: `main → providers → router/query/session`; las features posteriores conservarán `component → hook → service → Axios → Zod`.
- Dependencias de producción: React/React DOM 19.3.0 estables, exactamente pareados y fijados, Axios, TanStack Query/Router, Zustand, Zod, React Hook Form y resolvers.
- Dependencias de desarrollo: Vite y plugin React, TypeScript, Tailwind v4 y plugin Vite, OpenAPI TypeScript, ESLint/TypeScript ESLint, Vitest, jsdom, Testing Library, MSW, Playwright y axe-core.
- Contrato público inicial: `PublicEnv = { apiBaseUrl: string }`; ninguna variable `VITE_` puede contener secretos.

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `parsePublicEnv` | `Record<string, unknown>` | `PublicEnv` o error sanitizado | RF-4, RF-5 |
| `isAllowedApiBaseUrl` | texto | booleano para URL relativa o HTTP(S) válida | RF-4 |

No hay lógica temporal; no corresponde parámetro `hoy` en esta spec.

## Flujo técnico

```text
[T1 completada] git init + .git/info/exclude; npm run test → ENOENT histórico
→ [T2 completada bajo requisito anterior] canary + runner mínimo + smoke verde
→ T3 rojo: test detecta prerelease actual
→ T3 verde: React/DOM estables pareados + lock estándar + ViewTransition estable + stack runtime
→ T4: scripts restantes y calidad estática; test verde
→ T5–T8: env, assets, MSW, E2E/axe/OpenAPI; test verde en cada cierre
→ copiar assets sin modificarlos
→ validar configuración pública al arrancar
→ T9: puerta integral, preview y navegador
```

## Decisiones técnicas

| Decisión | Elección y motivo | Alternativa descartada | RF/RNF |
|---|---|---|---|
| Exclusiones no públicas | `.git/info/exclude`, autorizado y local | `.gitignore`, prohibido para esos seis recursos | RF-7, RF-8 |
| Estilos | Tailwind v4 vía plugin Vite + tokens CSS en `@theme` | Hex en componentes o configuración v3 | RF-1, RF-6 |
| React | `react`/`react-dom` 19.3.0 estables, misma versión exacta y lockfile estándar | Canary, versiones desalineadas, `force`, `legacy-peer-deps`, overrides o aliases | RF-1, RF-10, RNF-6 |
| View Transitions | Usar solo el export estable `ViewTransition` de la release fijada | Import canary/experimental o polyfill oculto | RF-11 |
| Configuración | Zod `safeParse` al inicio | Leer `import.meta.env` sin validar | RF-4, RNF-2 |
| Tests HTTP | MSW a nivel de red | Mock directo de Axios | RF-1, RNF-4 |

## Estrategia de pruebas y verificación

- **Excepción histórica:** T1 quedó completada con evidencia Git, pero `npm run test` no existía y falló con ENOENT. No se falsifica un verde ni se repite T1.
- **Regla desde T2:** cada tarea pendiente empieza con su prueba roja específica y solo se marca completa tras ejecutar toda la suite mediante `npm run test` verde.
- T2 estableció el test base con canary bajo el requisito anterior. T3 comienza con una prueba roja que detecta esa prerelease, migra a estable, comprueba peers/export y agrega smoke de aplicación/providers; T5 cubre configuración, T6 assets, T7 red MSW y T8 conserva la suite verde mientras añade verificadores separados.
- Verificaciones de proceso: scripts individuales, artefactos, lockfile y estado Git (`git status`, `git check-ignore -v`).
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`.
- Manual: `npm run dev` en `http://localhost:5173`, `npm run preview`, consola limpia y comprobación de assets con Chrome DevTools.

### Evidencia de test verde por tarea pendiente

| Tarea | Suite disponible al cerrarla |
|---|---|
| T2 | Evidencia histórica: smoke Testing Library verde con canary; no acredita RF-10/RF-11 |
| T3 | Política React estable/pareada/sin bypass + export `ViewTransition` + smoke aplicación/providers |
| T4 | Suite T3 sin regresiones tras scripts/lint |
| T5 | Suite previa + casos env válido/ausente/inválido |
| T6 | Suite previa + disponibilidad/referencias de assets |
| T7 | Suite previa + primera integración MSW |
| T8 | Suite unitaria completa; E2E/axe/OpenAPI se verifican además por sus scripts |
| T9 | Suite completa dentro de la puerta integral |

## Trazabilidad

| Requisito | Implementación | Verificación |
|---|---|---|
| RF-1 | manifiesto/configuración/providers | instalación estable limpia + smoke test |
| RF-2 | Vite puerto fijo | navegador en 5173 |
| RF-3 | scripts | ejecución individual |
| RF-4 | `.env` + `parsePublicEnv` | tests env y estado Git |
| RF-5 | `.env.example` | revisión sin secretos |
| RF-6 | `public/assets`, estilos | hashes/carga en navegador |
| RF-7 | `git init`, índice | `git status` |
| RF-8 | exclusiones separadas | `git check-ignore -v` por recurso |
| RF-9 | build/preview | build servible y fallo no-cero provocado |
| RF-10 | manifiesto/lock/test de compatibilidad | versiones estables iguales, peers satisfechos, sin bypass |
| RF-11 | export estable y page transition posterior | import desde React estable y navegación funcional |
| RNF-6 | npm estándar y lockfile | instalación sin ERESOLVE/peer warnings de React |

## Secuencia, dependencias y riesgos

1. T1 ya completada: Git/exclusiones. 2. T2 ya completada históricamente: runner canary verde. 3. T3 migra a estable y completa aplicación/stack. 4. T4 calidad/scripts. 5. T5–T8 capacidades restantes. 6. T9 puerta final.
- No depende de otra spec; habilita todas las demás.
- No se planifica `git init` ni la configuración inicial de `.git/info/exclude` como trabajo pendiente.
- Riesgo resuelto en requisitos: la canary existente es incompatible con peers estables. T3 la reemplaza antes de instalar TanStack y prohíbe cualquier bypass.
- Riesgo: divergencia entre documentación y paquete. Mitigación: comprobar en T3 el export real de `ViewTransition` desde React estable y mantener navegación funcional sin API experimental.
- Riesgo: OpenAPI requiere backend disponible. El script fallará de forma explícita; no se modifica backend.
- Riesgo corregido: tareas sin runner no podían demostrar verde. Mitigación: T2 instala el runner antes de cualquier otro cambio pendiente.
- No se ejecutan commits hasta aprobación futura.

## Pendientes de aclaración

Ninguno.
