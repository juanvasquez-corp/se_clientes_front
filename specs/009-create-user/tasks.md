# Tareas — Spec 009: Creación de usuario

> Cada tarea futura: 20–30 minutos, prueba roja primero, verde después y actualización de `MEMORY.md`.

- [ ] **T1. Crear schema de creación.** RF-2–RF-6
  - Hecho cuando: límites cédula/nombres/teléfono/password/rol pasan; `MEMORY.md` actualizado.
- [ ] **T2. Crear builder de payload exacto.** RF-3, RF-4, RF-7
  - Hecho cuando: ceros/anulables y ausencia de estado/extras pasan; `MEMORY.md` actualizado.
- [ ] **T3. Implementar API y mutation sin retry.** RF-7–RF-9
  - Hecho cuando: un POST validado invalida listado y devuelve UUID; `MEMORY.md` actualizado.
- [ ] **T4. Construir formulario accesible.** RF-1, RF-2, RF-5, RF-6
  - Hecho cuando: labels, reveal, foco/error y responsive pasan; `MEMORY.md` actualizado.
- [ ] **T5. Integrar pending, cancelación y éxito.** RF-8–RF-10
  - Hecho cuando: doble submit bloqueado, cancelar lista y éxito detalle pasan; `MEMORY.md` actualizado.
- [ ] **T6. Integrar 409/422 y fallos ambiguos.** RF-11
  - Hecho cuando: valores no sensibles permanecen y no hay retry; `MEMORY.md` actualizado.
- [ ] **T7. Integrar `401` y borrado de contraseña.** RF-12
  - Hecho cuando: un solo POST, refresh separado, password vacío y confirmación nueva pasan; `MEMORY.md` actualizado.
- [ ] **T8. Verificar creación integral.** RF-1–RF-12
  - Hecho cuando: backend/E2E/roles/móvil/axe/privacidad y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1, RF-2 | T1, T4 |
| RF-3–RF-7 | T1–T3 |
| RF-8–RF-10 | T3, T5 |
| RF-11 | T6 |
| RF-12 | T7 |
