# Tareas — Spec 004: Inicio de sesión

> TDD rojo→verde, una tarea futura de 20–30 minutos, prueba dirigida y actualización de `MEMORY.md` al cerrar.

- [x] **T1. Crear schema de credenciales.** RF-2
  - Hecho cuando: límites y normalización pasan tras test rojo; `MEMORY.md` actualizado.
- [x] **T2. Implementar parser de Retry-After con `hoy`.** RF-6, RF-7
  - Hecho cuando: segundos, cero, negativo, fecha pasada/futura, CORS y fallback pasan; `MEMORY.md` actualizado.
- [x] **T3. Implementar login API y sesión mínima en memoria.** RF-3, RF-4
  - Hecho cuando: MSW observa un POST correcto, perfil validado y cero persistencia; `MEMORY.md` actualizado.
- [x] **T4. Construir formulario accesible.** RF-1, RF-2, RF-3
  - Hecho cuando: labels, revelar, foco de error y doble submit pasan; `MEMORY.md` actualizado.
- [x] **T5. Manejar credenciales e indisponibilidad.** RF-5, RF-8
  - Hecho cuando: 401/red/503 conservan email, borran password y ofrecen feedback correcto; `MEMORY.md` actualizado.
- [x] **T6. Integrar bloqueo 429 en la UI.** RF-6, RF-7
  - Hecho cuando: fake timers rehabilitan exactamente y recarga no persiste bloqueo; `MEMORY.md` actualizado.
- [x] **T7. Maquetar login desktop/móvil.** RF-1
  - Hecho cuando: fondos/logo coinciden con mockups y axe pasa; `MEMORY.md` actualizado.
- [x] **T8. Integrar destinos de sesión existente.** RF-4, RF-9
  - Hecho cuando: cada rol entrega el destino normativo y `/login` no permanece abierto; `MEMORY.md` actualizado.
- [x] **T9. Verificar login integral.** RF-1–RF-9
  - Hecho cuando: test, E2E, backend real, Chrome móvil/consola y puerta de calidad pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1 | T4, T7 |
| RF-2 | T1, T4 |
| RF-3, RF-4 | T3, T8 |
| RF-5, RF-8 | T5 |
| RF-6, RF-7 | T2, T6 |
| RF-9 | T8 |
