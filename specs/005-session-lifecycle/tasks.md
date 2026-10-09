# Tareas — Spec 005: Ciclo de vida y coordinación de sesión

> TDD rojo→verde; cada tarea futura dura 20–30 minutos, ejecuta prueba dirigida y actualiza `MEMORY.md`.

- [x] **T1. Modelar reducer y store de sesión en memoria.** RF-1, RF-3, RF-4
  - Hecho cuando: transiciones y ausencia de persistencia pasan; `MEMORY.md` actualizado.
- [x] **T2. Implementar API de CSRF, refresh y logout.** RF-2, RF-18, RF-19
  - Hecho cuando: orden, headers, cookies y schemas pasan MSW; `MEMORY.md` actualizado.
- [x] **T3. Implementar bootstrap y resultados iniciales.** RF-1–RF-5
  - Hecho cuando: success/401/red/503 muestran estado exacto y ocultan contenido; `MEMORY.md` actualizado.
- [x] **T4. Implementar single-flight y recuperación de lecturas.** RF-6–RF-8, RF-15
  - Hecho cuando: múltiples 401 producen un refresh, una repetición máxima y cero bucles; `MEMORY.md` actualizado.
- [x] **T5. Implementar política `401` de mutaciones.** RF-7, RF-22
  - Hecho cuando: POST/PUT/PATCH/DELETE nunca se repiten y exigen confirmación tras renovar; `MEMORY.md` actualizado.
- [x] **T6. Implementar locks y señales multipestaña.** RF-9, RF-11, RF-17
  - Hecho cuando: señales no contienen secretos, limpian caché y preservan solo ruta autorizada; `MEMORY.md` actualizado.
- [x] **T7. Implementar fallback sin coordinación y outcomes por paso.** RF-10, RF-21
  - Hecho cuando: advertencia y matriz CSRF/refresh/perfil pasan; `MEMORY.md` actualizado.
- [x] **T8. Implementar confirmación y flujo de logout.** RF-12–RF-14, RF-19
  - Hecho cuando: cancelar, éxito, red y 503 preservan/limpian según spec; `MEMORY.md` actualizado.
- [x] **T9. Implementar cuarentena 403 y recuperación manual.** RF-16, RF-20
  - Hecho cuando: `/forbidden`, `/unavailable`, identidad/caché ocultas y cero retry automático pasan; `MEMORY.md` actualizado.
- [x] **T10. Verificar sesión integral y multipestaña.** RF-1–RF-22
  - Hecho cuando: test/E2E/backend real/storage/cookies/Chrome y puerta integral pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1–RF-5 | T1, T3 |
| RF-6–RF-8, RF-15 | T4 |
| RF-9, RF-11, RF-17 | T6 |
| RF-10, RF-21 | T7 |
| RF-12–RF-14, RF-19 | T8 |
| RF-16, RF-20 | T9 |
| RF-18 | T2 |
| RF-22 | T5 |
