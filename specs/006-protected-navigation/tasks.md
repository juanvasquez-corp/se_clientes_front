# Tareas — Spec 006: Navegación protegida por rol

> Cada tarea futura dura 20–30 minutos, inicia con test rojo, termina verde y actualiza `MEMORY.md`.

- [ ] **T1. Crear helpers puros de rol y ruta.** RF-2, RF-5–RF-9
  - Hecho cuando: matriz de roles/rutas/menús pasa; `MEMORY.md` actualizado.
- [ ] **T2. Declarar route tree exacto y contexto.** RF-3, RF-4
  - Hecho cuando: solo existen ocho rutas normativas y params son tipados; `MEMORY.md` actualizado.
- [ ] **T3. Implementar guards que esperan sesión.** RF-1, RF-5, RF-6
  - Hecho cuando: restore, login y forbidden pasan sin flash privado; `MEMORY.md` actualizado.
- [ ] **T4. Implementar destinos posteriores al login.** RF-2, RF-6
  - Hecho cuando: cada rol aterriza correctamente e ignora retorno; `MEMORY.md` actualizado.
- [ ] **T5. Construir AppShell y sidebar por rol.** RF-7–RF-9
  - Hecho cuando: opciones y active item pasan Testing Library/axe; `MEMORY.md` actualizado.
- [ ] **T6. Construir menú móvil y foco.** RF-10
  - Hecho cuando: abre/cierra, filtra opciones y mueve foco al navegar; `MEMORY.md` actualizado.
- [ ] **T7. Integrar forbidden, unavailable y page transitions.** RF-3, RF-11
  - Hecho cuando: las páginas importan únicamente el `ViewTransition` estable de la release fijada, retry, contenido oculto y reduced motion pasan, `npm run test` queda verde y `MEMORY.md` actualizado.
- [ ] **T8. Verificar navegación integral.** RF-1–RF-11
  - Hecho cuando: roles/E2E/móvil/Chrome/consola y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1 | T3 |
| RF-2 | T1, T4 |
| RF-3, RF-4 | T2, T7 |
| RF-5, RF-6 | T1, T3, T4 |
| RF-7–RF-9 | T5 |
| RF-10 | T6 |
| RF-11 | T7 |
