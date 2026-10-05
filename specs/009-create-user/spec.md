# Spec 009 — Creación de usuario

**Estado:** aprobada  
**Versión:** 1.3.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

El superadmin necesita registrar cuentas internas con una contraseña inicial y un rol. La cuenta nace activa por regla del backend; el formulario debe enviar únicamente los campos publicados y, al finalizar, llevar al detalle de la nueva cuenta.

## Usuarios / actores

- **Superadmin:** crea cuentas internas.
- **Backend:** valida unicidad, datos, rol y contraseña, y define el estado activo inicial.

## Historias de usuario

- **HU-1:** Como superadmin, quiero crear una cuenta con su identidad, rol y contraseña inicial para habilitar a un usuario interno.
- **HU-2:** Como superadmin, quiero corregir errores del formulario sin perder los demás datos escritos.

## Requisitos funcionales

- **RF-1 — Acceso:** CUANDO un superadmin abre `/users/new`, EL SISTEMA presenta el formulario de creación dentro del módulo Usuarios.
- **RF-2 — Campos permitidos:** EL SISTEMA solicita cédula, nombre, apellido opcional, correo, teléfono opcional, contraseña inicial y rol.
- **RF-3 — Validación de cédula:** CUANDO se valida la cédula, EL SISTEMA exige entre 1 y 20 dígitos ASCII y conserva ceros iniciales.
- **RF-4 — Validación de identidad:** EL SISTEMA exige nombre de 1 a 50 caracteres sin espacios extremos, apellido opcional con la misma regla, correo válido normalizado y teléfono opcional de 7 a 20 caracteres.
- **RF-5 — Validación de contraseña:** EL SISTEMA exige una contraseña inicial de 15 a 128 caracteres.
- **RF-6 — Validación de rol:** EL SISTEMA acepta únicamente superadmin, master o visualizer.
- **RF-7 — Payload de creación:** CUANDO el formulario es válido, EL SISTEMA envía exclusivamente los siete campos permitidos por el contrato y no envía estado.
- **RF-8 — Envío único:** MIENTRAS la creación está pendiente, EL SISTEMA impide envíos duplicados y comunica actividad.
- **RF-9 — Creación exitosa:** CUANDO el backend crea la cuenta, EL SISTEMA comunica éxito y navega al detalle identificado por el UUID público recibido.
- **RF-10 — Cancelación:** CUANDO el superadmin cancela, EL SISTEMA vuelve al listado sin crear la cuenta.
- **RF-11 — Error corregible:** SI la creación responde `409` o `422`, ENTONCES EL SISTEMA permanece en el formulario, conserva los valores no sensibles y muestra los errores aplicables.
- **RF-12 — `401` al crear:** SI la creación responde `401`, ENTONCES EL SISTEMA no la repite; tras una renovación exitosa permanece en el formulario, conserva los valores no sensibles, limpia la contraseña y exige volver a ingresarla y confirmar un nuevo envío; si la renovación falla, aplica el resultado correspondiente de la Spec 005.

## Requisitos no funcionales

- **RNF-1 — Secreto:** La contraseña se oculta, no se registra, no se persiste y se elimina de memoria al abandonar o completar el formulario.
- **RNF-2 — Privacidad:** La cédula viaja solo en el cuerpo de la operación; nunca aparece en URL, logs, mensajes ni navegación posterior.
- **RNF-3 — Accesibilidad:** Todos los campos tienen etiqueta; los errores se asocian al control y el primer error recibe foco.
- **RNF-4 — Responsive:** El formulario usa dos columnas cuando hay espacio y una sola columna en móvil.

## Dependencias y precedencia

- Depende de las Specs 002, 003, 005, 006 y 008.
- Esta spec prevalece para validación, payload y navegación de creación; la Spec 003 gobierna errores generales y la Spec 005 el primer `401` de lectura, pero la mutación de creación nunca se repite automáticamente.
- Red, timeout o `503` de la creación permanecen en `/users/new`; si ocurren durante la recuperación de sesión posterior a un `401`, prevalecen los estados de la Spec 005.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | E2E de acceso superadmin a `/users/new` y rechazo de otros roles por Spec 006. |
| RF-2 | Revisión de los siete campos y ausencia de estado. |
| RF-3 | Pruebas de cédula con 0/1/20/21 caracteres, no ASCII/no dígito y ceros iniciales. |
| RF-4 | Pruebas de límites de nombres/teléfono y correo inválido/normalizado. |
| RF-5 | Pruebas de contraseña con 14/15/128/129 caracteres. |
| RF-6 | Prueba de tres roles válidos y valor desconocido rechazado. |
| RF-7 | Inspección del payload exacto y ausencia de `is_active`/propiedades extra. |
| RF-8 | Prueba de doble envío con una sola solicitud. |
| RF-9 | E2E de creación exitosa hacia el detalle del UUID recibido. |
| RF-10 | Prueba de Cancelar hacia listado sin solicitud. |
| RF-11 | Pruebas `409`/`422` con datos no sensibles conservados y contraseña no persistida. |
| RF-12 | Prueba `401` con un solo POST, renovación separada, contraseña limpia y nuevo envío imposible sin confirmación. |

## Casos límite y errores

- **Cédula con ceros iniciales:** se conserva como cadena sin conversión numérica.
- **Apellido o teléfono vacíos:** se envían como `null` según el contrato, no como campos arbitrarios.
- **Correo o cédula reservados:** `409` → se mantiene el formulario y se presenta conflicto.
- **Contraseña visible temporalmente:** solo cambia su representación; nunca su valor ni almacenamiento.
- **Timeout tras enviar:** no se reenvía automáticamente porque la cuenta pudo haberse creado.
- **Renovación tras `401`:** aunque la sesión se recupere, la contraseña siempre se borra y debe volver a escribirse antes de una nueva confirmación manual.

## Fuera de alcance

- Elegir estado inicial; toda cuenta nace activa.
- Enviar invitaciones, generar contraseñas o forzar cambio en primer ingreso.
- Mostrar posteriormente la contraseña o la cédula.
- Crear cuentas por lotes.

## Criterios de finalización

- [ ] Solo superadmin puede abrir y enviar el formulario.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Todas las reglas de campos coinciden con el contrato efectivo.
- [ ] El payload no contiene estado ni propiedades adicionales.
- [ ] El éxito navega al detalle y los errores corregibles conservan el contexto.
- [ ] Cédula y contraseña no aparecen en URL, almacenamiento o diagnósticos.

## Dudas abiertas

Ninguna.
