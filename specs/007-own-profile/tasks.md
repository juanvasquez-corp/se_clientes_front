# Tareas — Spec 007: Consulta y edición del perfil propio

> Cada tarea futura dura 20–30 minutos, empieza con prueba roja, termina verde y actualiza `MEMORY.md`.

- [ ] **T1. Crear schemas reutilizables y builder de perfil.** RF-6, RF-7
  - Hecho cuando: límites, normalización, conservar/null y payload exacto pasan; `MEMORY.md` actualizado.
- [ ] **T2. Implementar API y query de perfil.** RF-1, RF-11
  - Hecho cuando: GET/PUT validan Zod, usan AbortSignal y manejan error; `MEMORY.md` actualizado.
- [ ] **T3. Implementar presentación de datos y nulos.** RF-1, RF-2, RF-5
  - Hecho cuando: seis campos y “No informado” pasan tests; `MEMORY.md` actualizado.
- [ ] **T4. Implementar modo visualizer.** RF-4
  - Hecho cuando: no existen Guardar/Editar/admin y axe pasa; `MEMORY.md` actualizado.
- [ ] **T5. Implementar formulario master/superadmin.** RF-3, RF-6, RF-7
  - Hecho cuando: solo cuatro campos editables y payload completo pasan; `MEMORY.md` actualizado.
- [ ] **T6. Integrar pending, éxito y cancelación.** RF-8–RF-10
  - Hecho cuando: doble submit, reset confirmado y toast pasan; `MEMORY.md` actualizado.
- [ ] **T7. Integrar errores y sesión sin replay.** RF-11
  - Hecho cuando: 401/409/422/red/503 conservan contexto según specs transversales; `MEMORY.md` actualizado.
- [ ] **T8. Verificar perfiles integralmente.** RF-1–RF-11
  - Hecho cuando: roles/backend/E2E/móvil/axe y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1, RF-2, RF-5 | T2, T3 |
| RF-3 | T5 |
| RF-4 | T4 |
| RF-6, RF-7 | T1, T5 |
| RF-8–RF-10 | T6 |
| RF-11 | T2, T7 |
