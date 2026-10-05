# Tareas — Spec 008: Listado, búsqueda y paginación de usuarios

> TDD rojo→verde; 20–30 minutos por tarea futura, test dirigido y `MEMORY.md` actualizado.

- [ ] **T1. Implementar contratos/API de listado y búsqueda.** RF-1, RF-4, RF-7
  - Hecho cuando: Zod, params, POST exacto y 404 especializado pasan; `MEMORY.md` actualizado.
- [ ] **T2. Crear query keys, cancelación y modos.** RF-1, RF-3, RF-4, RF-6, RF-9
  - Hecho cuando: keys por sesión, AbortSignal y transición list/search pasan; `MEMORY.md` actualizado.
- [ ] **T3. Implementar tabla y datos públicos.** RF-2, RF-11
  - Hecho cuando: columnas, nulos y acciones propias/ajenas pasan; `MEMORY.md` actualizado.
- [ ] **T4. Implementar paginación.** RF-1, RF-3
  - Hecho cuando: primera/intermedia/última y fuera de rango pasan; `MEMORY.md` actualizado.
- [ ] **T5. Implementar buscador exacto y limpiar.** RF-4–RF-7
  - Hecho cuando: válido/inválido/404/clear pasan sin filtros extra; `MEMORY.md` actualizado.
- [ ] **T6. Integrar estados y Crear usuario.** RF-8, RF-9, RF-12
  - Hecho cuando: skeleton, vacío, error y acción `/users/new` pasan; `MEMORY.md` actualizado.
- [ ] **T7. Implementar tarjetas móviles accesibles.** RF-10
  - Hecho cuando: cards conservan datos/acción, touch target y axe pasan; `MEMORY.md` actualizado.
- [ ] **T8. Verificar directorio integral.** RF-1–RF-12
  - Hecho cuando: E2E/backend/roles/móvil/consola y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1–RF-3 | T1–T4 |
| RF-4–RF-7 | T1, T2, T5 |
| RF-8, RF-9 | T6 |
| RF-10 | T7 |
| RF-11 | T3 |
| RF-12 | T6 |
