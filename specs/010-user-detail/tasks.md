# Tareas — Spec 010: Detalle administrativo de usuario

> Cada tarea futura dura 20–30 minutos, comienza roja, termina verde y actualiza `MEMORY.md`.

- [x] **T1. Validar UUID e implementar API/query de detalle.** RF-1, RF-7
  - Hecho cuando: UUID válido, inválido, 404 y AbortSignal pasan; `MEMORY.md` actualizado.
- [x] **T2. Renderizar tarjeta de datos públicos.** RF-2
  - Hecho cuando: seis campos/nulos pasan y datos prohibidos no existen; `MEMORY.md` actualizado.
- [x] **T3. Implementar contexto y breadcrumb responsive.** RF-3
  - Hecho cuando: volver/listado y variante móvil pasan; `MEMORY.md` actualizado.
- [x] **T4. Implementar acciones propias y ajenas.** RF-4–RF-6
  - Hecho cuando: editar siempre y estado/eliminar solo ajenos pasan; `MEMORY.md` actualizado.
- [x] **T5. Integrar estados 404/red/503.** RF-7
  - Hecho cuando: not-found y retry contextual pasan; `MEMORY.md` actualizado.
- [x] **T6. Integrar actualización contextual.** RF-8
  - Hecho cuando: invalidación mantiene UUID y muestra datos confirmados; `MEMORY.md` actualizado.
- [x] **T7. Verificar detalle integral.** RF-1–RF-8
  - Hecho cuando: roles/E2E/backend/móvil/axe/privacidad y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1 | T1 |
| RF-2 | T2 |
| RF-3 | T3 |
| RF-4–RF-6 | T4 |
| RF-7 | T1, T5 |
| RF-8 | T6 |
