# Tareas — Spec 002: Fundamentos visuales, responsive y accesibles

> Una tarea por ejecución futura, 20–30 minutos. Cada una comienza con prueba roja, termina con `npm run test` dirigido y actualiza `MEMORY.md`.

- [ ] **T1. Integrar tokens, tipografía, foco y reduced motion.** RF-1, RF-9
  - Hecho cuando: tests estáticos y visuales pasan sin hex en componentes; `MEMORY.md` actualizado.
- [ ] **T2. Implementar utilidades de presentación y badges.** RF-1, RF-2
  - Hecho cuando: iniciales, nulos, roles y estados pasan casos unitarios; `MEMORY.md` actualizado.
- [ ] **T3. Crear Icon y botones compuestos accesibles.** RF-4, RF-8
  - Hecho cuando: whitelist, nombres, teclado y área táctil pasan tests; `MEMORY.md` actualizado.
- [ ] **T4. Crear FormField, Card y Alert.** RF-2, RF-4
  - Hecho cuando: labels, errores y jerarquía semántica pasan Testing Library/axe; `MEMORY.md` actualizado.
- [ ] **T5. Implementar estados asíncronos y skeletons.** RF-5, RF-6
  - Hecho cuando: carga, vacío, error, unavailable y retry tienen tests verdes; `MEMORY.md` actualizado.
- [ ] **T6. Implementar Toast accesible.** RF-5
  - Hecho cuando: éxito/error se anuncian y no duplican envíos; `MEMORY.md` actualizado.
- [ ] **T7. Implementar Modal compuesto y foco.** RF-7
  - Hecho cuando: abrir, tabular, cancelar, error y restaurar foco pasan; `MEMORY.md` actualizado.
- [ ] **T8. Verificar responsive, zoom y movimiento reducido.** RF-3, RF-9
  - Hecho cuando: móvil/tableta/escritorio y zoom 200 % pasan revisión Chrome/axe; `MEMORY.md` actualizado.
- [ ] **T9. Ejecutar puerta integral de UI.** RF-1–RF-9
  - Hecho cuando: typecheck, lint, test y build pasan y `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1 | T1, T2 |
| RF-2 | T2, T4 |
| RF-3 | T8 |
| RF-4 | T3, T4 |
| RF-5 | T5, T6 |
| RF-6 | T5 |
| RF-7 | T7 |
| RF-8 | T3 |
| RF-9 | T1, T8 |
