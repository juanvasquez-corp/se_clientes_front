# Spec 011 — Edición administrativa de usuario

**Estado:** aprobada  
**Versión:** 1.4.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

El superadmin necesita actualizar perfiles, corregir una cédula y cambiar el rol de otras cuentas. Como la API nunca devuelve la cédula, su corrección debe ser opcional y vacía; el estado se gestiona por una operación independiente.

## Usuarios / actores

- **Superadmin:** edita cuentas propias o de terceros bajo restricciones distintas.
- **Backend:** aplica permisos, unicidad y protección del último superadmin.

## Historias de usuario

- **HU-1:** Como superadmin, quiero actualizar los datos públicos de otra cuenta para mantenerlos correctos.
- **HU-2:** Como superadmin, quiero corregir una cédula sin verla ni exponerla.
- **HU-3:** Como superadmin, quiero cambiar el rol de otra cuenta sin poder cambiar el mío.

## Requisitos funcionales

- **RF-1 — Precarga segura:** CUANDO se abre `/users/$userUuid/edit`, EL SISTEMA carga nombre, apellido, correo, teléfono, rol y estado públicos, pero deja vacía cualquier corrección de cédula.
- **RF-2 — Perfil básico:** EL SISTEMA permite editar nombre, apellido, correo y teléfono tanto en cuenta propia como de terceros.
- **RF-3 — Corrección de cédula:** CUANDO el superadmin escribe una cédula de 1 a 20 dígitos ASCII, EL SISTEMA conserva sus ceros iniciales y la incluye en la actualización; si permanece vacía, la omite por completo; cualquier otro valor impide el envío.
- **RF-4 — Rol de terceros:** SI la cuenta pertenece a otra persona, ENTONCES EL SISTEMA permite seleccionar superadmin, master o visualizer.
- **RF-5 — Rol propio protegido:** SI la cuenta es la del superadmin autenticado, ENTONCES EL SISTEMA muestra el rol como solo lectura y nunca lo incluye como cambio.
- **RF-6 — Estado separado:** EL SISTEMA muestra el estado como información y no lo envía dentro de la actualización administrativa.
- **RF-7 — Payload completo:** CUANDO se guarda, EL SISTEMA envía siempre nombre y correo, conserva apellido y teléfono con sus valores actuales o `null` al borrarlos, y añade únicamente la cédula o el rol que realmente correspondan.
- **RF-8 — Envío único:** MIENTRAS la actualización está pendiente, EL SISTEMA evita un segundo envío y comunica actividad.
- **RF-9 — Actualización exitosa:** CUANDO el backend confirma los cambios, EL SISTEMA comunica éxito y navega al detalle actualizado del mismo UUID.
- **RF-10 — Cancelación:** CUANDO el superadmin cancela, EL SISTEMA vuelve al detalle sin enviar cambios.
- **RF-11 — Error corregible:** SI la actualización responde `403`, `409` o `422`, ENTONCES EL SISTEMA conserva los valores escritos, protege campos restringidos y presenta el error correspondiente.
- **RF-12 — Validación de perfil:** CUANDO se intenta guardar, EL SISTEMA exige nombre de 1 a 50 caracteres tras eliminar espacios extremos, apellido nulo o de 1 a 50 caracteres con igual normalización, teléfono nulo o de 7 a 20 caracteres y correo con formato válido normalizado a minúsculas.
- **RF-13 — `401` al editar:** SI la actualización responde `401`, ENTONCES EL SISTEMA no la repite; tras una renovación exitosa permanece en edición, conserva los datos públicos escritos, limpia la corrección de cédula y exige una nueva confirmación para guardar; si la renovación falla, aplica el resultado correspondiente de la Spec 005.

## Requisitos no funcionales

- **RNF-1 — Privacidad:** La cédula nunca se precarga, muestra tras guardar, incorpora a URL, registra o conserva como dato remoto.
- **RNF-2 — Integridad:** No se pierden apellido o teléfono por omisión accidental durante una actualización.
- **RNF-3 — Accesibilidad:** Los campos de solo lectura y las restricciones propias incluyen explicación textual.
- **RNF-4 — Responsive:** El formulario mantiene acciones y jerarquía en una columna móvil y distribución amplia en escritorio.

## Dependencias y precedencia

- Depende de las Specs 002, 003, 005, 006 y 010.
- Esta spec prevalece para validación, payload y navegación de edición; la Spec 012 gobierna exclusivamente estado/eliminación. Una mutación PUT nunca se repite automáticamente tras `401`, timeout, red o `5xx`.
- Los fallos funcionales del PUT permanecen en `/users/$userUuid/edit` salvo `404`; los fallos de la recuperación de sesión iniciada por un `401` aplican la Spec 005 y pueden llevar a `/login`, `/forbidden` o `/unavailable`.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Prueba de precarga pública con campo cédula vacío. |
| RF-2 | Prueba de edición de los cuatro campos en cuenta propia y ajena. |
| RF-3 | Pruebas de cédula con 0/1/20/21 caracteres, no ASCII/no dígito y ceros iniciales, inspeccionando omisión cuando está vacía. |
| RF-4 | Prueba de tres roles disponibles para otra cuenta. |
| RF-5 | Prueba de cuenta propia con rol solo lectura y ausente del cambio. |
| RF-6 | Inspección de estado visible y ausente del payload PUT. |
| RF-7 | Inspección de payload al conservar/borrar anulables y cambiar/omitir cédula o rol. |
| RF-8 | Prueba de doble guardado con una sola solicitud. |
| RF-9 | E2E de éxito hacia el detalle del mismo UUID. |
| RF-10 | Prueba de cancelación hacia detalle sin PUT. |
| RF-11 | Pruebas `403`, `409` y `422` con valores conservados, rol propio aún de solo lectura, estado aún excluido del payload y error visible. |
| RF-12 | Pruebas de límites 0/1/50/51 para nombres, 6/7/20/21 para teléfono y correo válido/inválido normalizado. |
| RF-13 | Prueba `401` con un solo PUT, renovación separada, datos públicos conservados, cédula limpia y nueva confirmación exigida. |

## Casos límite y errores

- **Cédula vacía:** se omite; nunca se envía `null`.
- **Cédula con ceros iniciales:** se conserva como cadena.
- **Cambio del último superadmin:** `409` → se permanece en edición y se presenta la regla sin asumir que el frontend conoce el conteo global.
- **Intento de cambiar rol propio:** el control no permite el cambio; un `403` inesperado se presenta sin reintento.
- **Cuenta eliminada durante edición:** `404` → se muestra recurso no encontrado con regreso al listado.
- **Timeout tras guardar:** no se reenvía automáticamente; se ofrece recargar el detalle para comprobar el resultado.
- **Renovación tras `401`:** aunque la sesión se recupere, la corrección de cédula siempre se borra y debe volver a escribirse antes de una nueva confirmación manual.

## Fuera de alcance

- Cambiar estado dentro del payload de edición.
- Editar, restablecer o mostrar contraseñas.
- Precargar o consultar la cédula actual.
- Restaurar cuentas eliminadas.

## Criterios de finalización

- [ ] La edición propia y de terceros aplica controles diferentes para el rol.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] La cédula empieza vacía y solo se envía al escribir una corrección válida.
- [ ] Los campos anulables se conservan o borran explícitamente.
- [ ] El estado no forma parte de la actualización y la contraseña no aparece.
- [ ] Éxito permanece en contexto del detalle; cancelación y errores no pierden datos escritos.

## Dudas abiertas

Ninguna.
