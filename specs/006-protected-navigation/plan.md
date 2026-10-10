# Plan de implementación — Spec 006: Navegación protegida por rol

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Specs 002–005, mapa normativo de rutas

## Resumen técnico

Configurar TanStack Router con las ocho rutas exactas, contexto de sesión vanilla y guards `beforeLoad`. El layout privado tendrá sidebar y menú móvil por rol. Las páginas, no el layout, usarán el `<ViewTransition default="none">` estable exportado por la release fijada de React; toda animación tendrá enter/exit y reduced motion. La corrección RNF-7 de Spec 001/T10 conservará el árbol y guards eager, pero cargará los componentes de página mediante límites lazy de rutas/features.

## Archivos previstos

| Ruta | Responsabilidad | RF |
|---|---|---|
| `src/app/router/router.tsx`, `router-context.ts` | Router tipado y fachada de sesión/query | RF-1–RF-6 |
| `src/app/router/route-tree.tsx` | Solo las ocho rutas; guards/params eager y componentes de página lazy tras Spec 001/T10 | RF-2–RF-6; RNF-7 transversal |
| `src/app/router/guards.ts` | Esperar restore; auth/role redirects | RF-1, RF-5, RF-6, RF-11 |
| `src/shared/layout/app-shell.tsx`, `sidebar.tsx`, `mobile-menu.tsx` | Navegación por rol/viewport | RF-7–RF-10 |
| `src/shared/layout/page-transition.tsx` | ViewTransition solo para páginas | RNF-4 |
| `src/features/system/forbidden-page.tsx`, `unavailable-page.tsx` | Estados públicos y retry | RF-3, RF-11 |
| `src/app/router/*.test.tsx`, `tests/e2e/navigation.spec.ts` | Matriz rutas/roles/móvil | RF-1–RF-11 |

## Funciones puras e interfaces

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `homeForRole` | rol | `/users` o `/profile` | RF-2 |
| `canAccessRoute` | sesión + ruta | allow/login/forbidden | RF-4–RF-6 |
| `navigationForRole` | rol | items permitidos | RF-7, RF-8 |
| `isUsersContext` | pathname | booleano | RF-9 |

No hay fecha; no aplica `hoy`.

## Algoritmo

```text
beforeLoad privada → await session.ready
dead/none → /login
authenticated + /users/* + rol != superadmin → /forbidden
allowed → render AppShell + page
allowed → cargar chunk de página → pending existente → render sin cambiar guard
login success → homeForRole; ignorar redirect params
identity unavailable → /unavailable; retry invoca SessionRecovery
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Router context + beforeLoad | no hooks en guards | ProtectedRoute render tardío | RF-1, RF-5 |
| Route tree explícito | evita rutas fuera de alcance | file routing autogenerado con extras | RF-3, RF-4 |
| CSS menú responsive | misma capacidad, menos JS | dos árboles divergentes | RF-10 |
| ViewTransition estable en páginas | API estable fijada y norma del proyecto | API canary/experimental o wrapper en layout | RNF-4 |
| Componentes lazy, guards eager | reduce entry sin retrasar autorización ni duplicar rutas | árbol completo estático o lazy guards | RF-1–RF-6; RNF-7 transversal |
| Sin redirect de retorno | spec exige destino por rol | query `redirect` | RF-2, RF-6 |

## Pruebas y trazabilidad

- `npm run test`: guards con estados, destinos, menús, active item, foco y reduced motion.
- E2E: roles, URLs pegadas, login, unavailable/retry, móvil y teclado.
- Chrome DevTools: sidebar/menu, consola y transición reducida. Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`, seguida de `npm run test:e2e`.
- La regresión correctiva vive en Spec 001/T10: repite rutas, roles, pending, foco, ViewTransition y E2E reales después del code splitting; T1–T8 de esta spec no se reabren.

| RF | Diseño/prueba |
|---|---|
| RF-1 | guard espera restore |
| RF-2 | homeForRole, E2E roles |
| RF-3, RF-4 | route tree exacto |
| RF-5, RF-6 | guards denied/login |
| RF-7–RF-9 | shell/nav/active tests |
| RF-10 | móvil/teclado |
| RF-11 | unavailable solo identidad no usable |

## Dependencias, secuencia y riesgos

Depende de 002–005; las páginas de 007–012 rellenan rutas ya declaradas. Orden histórico: helpers → router/guards → estados → shell → responsive/E2E. Spec 001/T10 aplica la corrección de carga sin cambiar requisitos. Riesgos: documentación visual usa rutas españolas; se aplican exclusivamente las rutas inglesas normativas. Un chunk tardío no puede omitir pending accesible ni ejecutar antes del guard.

## Pendientes de aclaración

Ninguno.
