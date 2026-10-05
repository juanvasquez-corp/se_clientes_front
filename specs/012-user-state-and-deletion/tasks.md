# Tareas — Spec 012: Estado y eliminación lógica de usuarios

> Cada tarea futura dura 20–30 minutos, comienza con test rojo, termina verde y actualiza `MEMORY.md`.

- [ ] **T1. Crear política pura de acciones y payload status.** RF-1–RF-4
  - Hecho cuando: self/other, activo/inactivo y boolean estricto pasan; `MEMORY.md` actualizado.
- [ ] **T2. Implementar APIs y hooks sin retry.** RF-4, RF-5, RF-7, RF-8
  - Hecho cuando: PATCH/DELETE únicos e invalidaciones pasan; `MEMORY.md` actualizado.
- [ ] **T3. Implementar confirmación de estado.** RF-3–RF-5
  - Hecho cuando: target/resultado, cancelar, pending y éxito en detalle pasan; `MEMORY.md` actualizado.
- [ ] **T4. Implementar confirmación destructiva.** RF-6–RF-8
  - Hecho cuando: advertencia, foco, doble envío y navegación a lista pasan; `MEMORY.md` actualizado.
- [ ] **T5. Integrar acciones en detalle y ocultación propia.** RF-1, RF-2
  - Hecho cuando: cuenta propia no muestra acciones y ajena sí; `MEMORY.md` actualizado.
- [ ] **T6. Implementar conflictos y acceso denegado.** RF-9, RF-10
  - Hecho cuando: 409 solo deactivate/delete explica regla y 403 no muestra éxito; `MEMORY.md` actualizado.
- [ ] **T7. Implementar resultados inciertos y página válida.** RF-11
  - Hecho cuando: timeout/red/5xx no reenvían y recarga/paginación recuperan contexto; `MEMORY.md` actualizado.
- [ ] **T8. Integrar `401` y confirmación consumida.** RF-12
  - Hecho cuando: PATCH/DELETE no se repiten y requieren abrir/confirmar otra vez; `MEMORY.md` actualizado.
- [ ] **T9. Verificar estado/eliminación integral.** RF-1–RF-12
  - Hecho cuando: backend/E2E/roles/último admin/móvil/axe y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1, RF-2 | T1, T5 |
| RF-3–RF-5 | T1–T3 |
| RF-6–RF-8 | T2, T4 |
| RF-9, RF-10 | T6 |
| RF-11 | T7 |
| RF-12 | T8 |
