# Tareas — Spec 003: Integración segura y tratamiento de errores

> Cada tarea futura dura 20–30 minutos, empieza con test rojo, termina con `npm run test` dirigido y actualiza `MEMORY.md`.

- [ ] **T1. Crear schemas estrictos de éxito y errores.** RF-1, RF-2
  - Hecho cuando: válido, extra, inválido y JSON corrupto pasan tras rojo inicial; `MEMORY.md` actualizado.
- [ ] **T2. Implementar clasificación HTTP y ContractError.** RF-4, RF-6, RF-7, RF-8, RF-18
  - Hecho cuando: matriz de códigos no depende de mensajes; `MEMORY.md` actualizado.
- [ ] **T3. Mapear errores `422` a campos.** RF-5
  - Hecho cuando: ubicaciones conocidas/desconocidas pasan tests; `MEMORY.md` actualizado.
- [ ] **T4. Implementar payload whitelist y destinos propios.** RF-3, RF-17
  - Hecho cuando: extras y URL externa se rechazan antes de enviar credenciales; `MEMORY.md` actualizado.
- [ ] **T5. Crear authClient con cookies y headers.** RF-13, RF-14, RF-15
  - Hecho cuando: MSW observa intención, JSON, cookie y CSRF correctos; `MEMORY.md` actualizado.
- [ ] **T6. Crear apiClient con bearer, JSON y AbortSignal.** RF-10, RF-16
  - Hecho cuando: bearer solo va a targets propios y cancelación descarta respuesta; `MEMORY.md` actualizado.
- [ ] **T7. Configurar retries y recuperación de `401`.** RF-9, RF-19
  - Hecho cuando: lectura se repite una vez tras recuperar y ninguna mutación se repite; `MEMORY.md` actualizado.
- [ ] **T8. Configurar invalidación y limpieza de caché.** RF-11, RF-12
  - Hecho cuando: mutación invalida y logout/cambio de cuenta limpia; `MEMORY.md` actualizado.
- [ ] **T9. Ejecutar matriz integral de contratos y errores.** RF-1–RF-19
  - Hecho cuando: `npm run test`, typecheck, lint y build pasan; `MEMORY.md` actualizado.

## Matriz RF → tarea

| RF | Tarea |
|---|---|
| RF-1, RF-2 | T1 |
| RF-3, RF-17 | T4 |
| RF-4, RF-6–RF-8, RF-18 | T2 |
| RF-5 | T3 |
| RF-9, RF-19 | T7 |
| RF-10, RF-16 | T6 |
| RF-11, RF-12 | T8 |
| RF-13–RF-15 | T5 |
