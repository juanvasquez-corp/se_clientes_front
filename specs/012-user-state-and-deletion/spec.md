# Spec 012 — Estado y eliminación lógica de usuarios

**Estado:** aprobada  
**Versión:** 1.4.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

El superadmin necesita activar, desactivar o eliminar lógicamente otras cuentas. Son operaciones sensibles sujetas a confirmación y a reglas que protegen la cuenta propia y el último superadmin activo.

## Usuarios / actores

- **Superadmin:** cambia estado o elimina cuentas de terceros.
- **Backend:** decide autorización, protege el último superadmin y realiza eliminación lógica irreversible para la UI.

## Historias de usuario

- **HU-1:** Como superadmin, quiero activar o desactivar otra cuenta para controlar su acceso.
- **HU-2:** Como superadmin, quiero eliminar una cuenta con confirmación para evitar acciones accidentales.
- **HU-3:** Como superadmin, quiero recibir una explicación cuando una regla de negocio rechaza la operación.

## Definiciones

- **Eliminación lógica:** la cuenta deja de estar disponible y no puede restaurarse desde el frontend.
- **Último superadmin protegido:** única cuenta superadmin activa y no eliminada, que no puede perder ese estado.

## Requisitos funcionales

- **RF-1 — Acciones de terceros:** MIENTRAS el objetivo sea otra cuenta, EL SISTEMA ofrece activar o desactivar según su estado actual y eliminarla.
- **RF-2 — Protección propia:** SI el objetivo es la cuenta del superadmin autenticado, ENTONCES EL SISTEMA no muestra acciones para cambiar su estado ni eliminarla.
- **RF-3 — Confirmación de estado:** CUANDO se solicita activar o desactivar, EL SISTEMA confirma la cuenta y el estado resultante antes de enviar la operación.
- **RF-4 — Cambio de estado:** CUANDO el superadmin confirma, EL SISTEMA envía exclusivamente el estado booleano solicitado mediante la operación específica de estado.
- **RF-5 — Estado actualizado:** CUANDO el backend confirma el cambio, EL SISTEMA permanece en el detalle, actualiza los datos relacionados y comunica éxito.
- **RF-6 — Confirmación destructiva:** CUANDO se solicita eliminar, EL SISTEMA muestra una confirmación que identifica la cuenta, advierte que no puede deshacerse y permite cancelar.
- **RF-7 — Eliminación confirmada:** CUANDO el superadmin confirma la eliminación, EL SISTEMA ejecuta una sola solicitud y bloquea nuevos envíos mientras está pendiente.
- **RF-8 — Eliminación exitosa:** CUANDO el backend confirma la eliminación, EL SISTEMA comunica éxito, retira la cuenta de los datos en memoria y navega al listado.
- **RF-9 — Conflicto de negocio:** SI desactivar o eliminar responde `409`, ENTONCES EL SISTEMA conserva el contexto y explica de forma visible que debe permanecer un superadmin activo.
- **RF-10 — Rechazo de permiso:** SI la operación responde `403`, ENTONCES EL SISTEMA no modifica la presentación como si hubiera tenido éxito y muestra acceso denegado.
- **RF-11 — Resultado incierto:** SI una mutación falla por timeout, red o `5xx`, ENTONCES EL SISTEMA no la reintenta automáticamente y ofrece recargar el detalle o listado para comprobar el estado.
- **RF-12 — `401` en estado o eliminación:** SI el cambio de estado o la eliminación responde `401`, ENTONCES EL SISTEMA no repite la operación; tras una renovación exitosa permanece en el detalle y exige abrir y confirmar de nuevo la acción antes de un nuevo envío; si la renovación falla, aplica el resultado correspondiente de la Spec 005.

## Requisitos no funcionales

- **RNF-1 — Autoridad:** Las restricciones visuales no sustituyen la validación transaccional del backend.
- **RNF-2 — Accesibilidad:** Confirmaciones, estado pendiente, conflicto y éxito gestionan foco y se anuncian de forma accesible.
- **RNF-3 — Consistencia:** Activo se representa con semántica positiva; inactivo y eliminación se distinguen sin depender solo del color.
- **RNF-4 — Irreversibilidad:** La interfaz no ofrece restauración de cuentas eliminadas.

## Dependencias y precedencia

- Depende de las Specs 002, 003, 005, 006, 008 y 010.
- Esta spec prevalece para confirmación, resultado y navegación de estado/eliminación. Ninguna de estas mutaciones se repite automáticamente tras `401`, timeout, red o `5xx`.
- Los fallos funcionales de PATCH/DELETE permanecen en detalle o conservan el contexto de confirmación; los fallos de la recuperación de sesión iniciada por un `401` aplican la Spec 005 y pueden llevar a `/login`, `/forbidden` o `/unavailable`.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Prueba de cuenta ajena activa/inactiva con acciones correspondientes y Eliminar. |
| RF-2 | Prueba de cuenta propia sin estado ni eliminación. |
| RF-3 | Prueba de confirmación de activación/desactivación con cuenta y resultado visibles. |
| RF-4 | Inspección de PATCH con un único booleano real. |
| RF-5 | E2E de estado exitoso permaneciendo en detalle y actualizando datos relacionados. |
| RF-6 | Prueba por teclado de modal destructivo, advertencia y cancelación. |
| RF-7 | Prueba de doble confirmación con un solo DELETE. |
| RF-8 | E2E de eliminación exitosa hacia listado y cuenta ausente. |
| RF-9 | Pruebas `409` al desactivar y eliminar con contexto conservado y explicación visible del último superadmin activo; activación no espera ese conflicto. |
| RF-10 | Prueba `403` sin actualización optimista falsa y con acceso denegado visible. |
| RF-11 | Pruebas de timeout, red y `5xx` con cero reenvíos automáticos y comprobación manual disponible. |
| RF-12 | Pruebas PATCH/DELETE con `401`, una renovación separada, un solo envío original y nueva confirmación obligatoria. |

## Casos límite y errores

- **Último superadmin no identificable localmente:** la acción puede llegar al backend; un `409` conserva contexto y comunica la regla.
- **Cuenta ya cambió de estado:** la respuesta confirmada o una recarga reemplaza el estado obsoleto.
- **Cuenta eliminada en otra pestaña:** `404` → se retira del contexto y se ofrece volver al listado.
- **Doble confirmación:** solo una solicitud puede quedar en curso.
- **Cancelar modal:** no se envía solicitud y el foco regresa a la acción original.
- **Renovación tras `401`:** aunque la sesión se recupere, la confirmación anterior queda consumida y la acción debe abrirse y confirmarse de nuevo.
- **Eliminación en última página:** el listado navega a la última página válida disponible.

## Fuera de alcance

- Eliminar, desactivar o cambiar el rol propio.
- Restaurar cuentas eliminadas.
- Eliminación masiva o cambios de estado masivos.
- Decidir en el frontend cuál cuenta es el último superadmin protegido.

## Criterios de finalización

- [ ] Solo superadmin puede cambiar estado o eliminar cuentas de terceros.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Las acciones propias prohibidas no aparecen.
- [ ] Cambio de estado permanece en detalle y eliminación vuelve al listado.
- [ ] Las confirmaciones evitan doble envío y son operables por teclado.
- [ ] `403`, `404`, `409`, red y `503` no producen estados de éxito falsos ni reintentos automáticos.
- [ ] No existe ninguna acción de restauración.

## Dudas abiertas

Ninguna.
