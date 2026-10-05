# Tareas — Spec 011: Edición administrativa de usuario

> Cada tarea futura dura 20–30 minutos, usa TDD rojo→verde y actualiza `MEMORY.md` al cerrar.

- [ ] **T1. Crear defaults y schemas de edición.** RF-1–RF-4, RF-12
  - Hecho cuando: precarga pública, cédula vacía y límites pasan; `MEMORY.md` actualizado.
- [ ] **T2. Implementar reglas de edición propia.** RF-5, RF-6
  - Hecho cuando: rol/estado readonly y ausentes del cambio pasan; `MEMORY.md` actualizado.
- [ ] **T3. Crear builder administrativo.** RF-3, RF-5–RF-7
  - Hecho cuando: anulables, cédula/rol condicionales y ausencia de estado pasan; `MEMORY.md` actualizado.
- [ ] **T4. Implementar API y mutation sin retry.** RF-7–RF-9
  - Hecho cuando: un PUT valida respuesta e invalida queries; `MEMORY.md` actualizado.
- [ ] **T5. Construir formulario y página responsive.** RF-1, RF-2, RF-4–RF-8
  - Hecho cuando: own/other, labels, pending y móvil pasan; `MEMORY.md` actualizado.
- [ ] **T6. Integrar éxito y cancelación.** RF-9, RF-10
  - Hecho cuando: ambos vuelven al detalle y solo éxito muta; `MEMORY.md` actualizado.
- [ ] **T7. Integrar errores corregibles y 404/timeout.** RF-11
  - Hecho cuando: valores/restricciones se conservan y no hay replay; `MEMORY.md` actualizado.
- [ ] **T8. Integrar `401` y borrado de cédula.** RF-13
  - Hecho cuando: un PUT, refresh separado, cédula vacía y nueva confirmación pasan; `MEMORY.md` actualizado.
- [ ] **T9. Verificar edición integral.** RF-1–RF-13
  - Hecho cuando: backend/E2E/own/other/privacidad/móvil/axe y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1–RF-4, RF-12 | T1, T5 |
| RF-5, RF-6 | T2, T3 |
| RF-7, RF-8 | T3–T5 |
| RF-9, RF-10 | T4, T6 |
| RF-11 | T7 |
| RF-13 | T8 |
