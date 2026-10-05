# Tareas — Spec 001: Inicialización del proyecto y control de versiones

> T1 conserva su evidencia histórica y no se reabre. Desde T2, cada tarea futura dura 20–30 minutos: primero prueba roja específica, luego cambio mínimo, y solo se cierra con la suite completa `npm run test` verde y `MEMORY.md` actualizado.

- [x] **T1. Inicializar Git y separar exclusiones.** RF-7, RF-8
  - Hecho cuando: evidencia histórica confirma Git sin commits, seis recursos en `.git/info/exclude`, ninguno rastreado ni añadido a `.gitignore`; `npm run test` no quedó verde porque no existía `package.json` (ENOENT), excepción de bootstrap documentada y no reabierta; `MEMORY.md` registra el resultado.
- [x] **T2. Crear el runner mínimo verificable.** RF-1, RF-3
  - Hecho cuando: evidencia histórica conserva `package.json`, lockfile, React/DOM canary pareados y dependencias mínimas de TypeScript/Vitest/jsdom/Testing Library; setup, smoke y script `test` quedaron verdes bajo el requisito anterior. T2 no acredita RF-10/RF-11 ni se reabre; `MEMORY.md` registra ese estado.
- [x] **T3. Migrar React a estable y configurar aplicación/stack compatible.** RF-1, RF-2, RF-10, RF-11
  - Hecho cuando: una prueba roja detecta primero la prerelease existente; luego `react` y `react-dom` quedan en 19.3.0 estable, misma versión exacta, lockfile regenerado con npm estándar y sin `force`, `legacy-peer-deps`, overrides o aliases; TanStack y el resto del stack runtime resuelven sus peers; el export estable `ViewTransition`, Vite 5173, Tailwind v4, TypeScript estricto y el smoke de aplicación/providers quedan verificados; `npm run test` queda verde y `MEMORY.md` actualizado.
- [x] **T4. Crear scripts restantes y calidad estática.** RF-1, RF-3, RF-9
  - Hecho cuando: `dev`, `build`, `preview`, `lint` y `typecheck` existen, ESLint queda configurado y un fallo devuelve estado no-cero; `npm run test` queda verde y `MEMORY.md` actualizado.
- [x] **T5. Validar configuración pública y plantilla.** RF-4, RF-5
  - Hecho cuando: tests rojos→verdes cubren env válido/ausente/inválido, `.env` no se rastrea y `.env.example` no contiene secretos; `npm run test` queda verde y `MEMORY.md` actualizado.
- [x] **T6. Integrar assets y tokens Aliar.** RF-6
  - Hecho cuando: assets se sirven sin alteración, CSS/Tailwind referencian tokens y la comprobación de assets pasa; `npm run test` queda verde y `MEMORY.md` actualizado.
- [x] **T7. Añadir MSW y completar providers de prueba.** RF-1, RF-3
  - Hecho cuando: un test rojo de red pasa con MSW sin mockear Axios y el smoke de providers sigue verde; `npm run test` queda verde y `MEMORY.md` actualizado.
- [x] **T8. Configurar Playwright, axe y generación OpenAPI.** RF-1, RF-3
  - Hecho cuando: existen scripts `test:e2e` y `openapi:generate`, smoke E2E y axe se pueden ejecutar y los contratos se generan sin sustituir Zod; `npm run test` queda verde y `MEMORY.md` actualizado.
- [x] **T9. Ejecutar puerta integral de bootstrap.** RF-1–RF-9
  - Hecho cuando: `npm run typecheck && npm run lint && npm run test && npm run build` queda verde, preview sirve el artefacto, navegador/consola/móvil se revisan y `MEMORY.md` queda actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1 | T2 (histórico), T3, T4, T7, T8 |
| RF-2 | T3 |
| RF-3 | T2, T4, T7, T8 |
| RF-4, RF-5 | T5 |
| RF-6 | T6 |
| RF-7, RF-8 | T1 |
| RF-9 | T4, T9 |
| RF-10, RF-11 | T3 |
