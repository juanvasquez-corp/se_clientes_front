# Spec 007 — Consulta y edición del perfil propio

**Estado:** aprobada  
**Versión:** 1.1.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

Todos los usuarios autenticados necesitan consultar su cuenta. Superadmin y master pueden mantener sus datos básicos; visualizer dispone únicamente de lectura. La interfaz debe preservar campos opcionales y evitar acciones que el rol no posee.

## Usuarios / actores

- **Superadmin:** consulta y edita sus datos básicos.
- **Master:** consulta y edita sus datos básicos.
- **Visualizer:** consulta su perfil sin controles de edición.

## Historias de usuario

- **HU-1:** Como usuario autenticado, quiero consultar mi perfil para verificar mis datos y estado.
- **HU-2:** Como master o superadmin, quiero actualizar mis datos básicos para mantenerlos vigentes.
- **HU-3:** Como visualizer, quiero distinguir claramente que mi perfil es de solo lectura.

## Requisitos funcionales

- **RF-1 — Datos públicos:** CUANDO se carga `/profile`, EL SISTEMA muestra nombre, apellido, correo, teléfono, rol y estado de la cuenta actual.
- **RF-2 — Ausencias opcionales:** SI apellido o teléfono son nulos, ENTONCES EL SISTEMA los presenta como datos no informados.
- **RF-3 — Edición permitida:** MIENTRAS el rol sea master o superadmin, EL SISTEMA permite editar nombre, apellido, teléfono y correo.
- **RF-4 — Solo lectura:** MIENTRAS el rol sea visualizer, EL SISTEMA presenta todos los datos en solo lectura y no muestra Guardar, Editar ni acciones administrativas.
- **RF-5 — Rol y estado informativos:** EL SISTEMA muestra rol y estado como información no editable para todos los roles en el perfil propio.
- **RF-6 — Validación:** CUANDO se intenta guardar, EL SISTEMA exige nombre de 1 a 50 caracteres tras eliminar espacios extremos, apellido nulo o de 1 a 50 caracteres con la misma normalización, teléfono nulo o de 7 a 20 caracteres y correo con formato válido normalizado a minúsculas.
- **RF-7 — Semántica de actualización:** CUANDO master o superadmin guarda, EL SISTEMA envía siempre nombre y correo, conserva apellido y teléfono con sus valores actuales o envía `null` cuando el usuario decide borrarlos.
- **RF-8 — Guardado pendiente:** MIENTRAS el guardado está en curso, EL SISTEMA impide un segundo envío y comunica el estado.
- **RF-9 — Guardado exitoso:** CUANDO la actualización finaliza correctamente, EL SISTEMA permanece en el perfil, muestra los valores confirmados y comunica el éxito.
- **RF-10 — Cancelación:** CUANDO se cancelan cambios no guardados, EL SISTEMA restaura los últimos valores confirmados.
- **RF-11 — Error de edición:** SI la actualización falla, ENTONCES EL SISTEMA conserva los valores escritos y aplica el tratamiento de errores de la Spec 003.

## Requisitos no funcionales

- **RNF-1 — Privacidad:** El perfil no muestra cédula, identificador interno, fechas, contraseña ni hash.
- **RNF-2 — Accesibilidad:** La condición editable o de solo lectura no se comunica únicamente por color.
- **RNF-3 — Responsive:** En móvil, el perfil conserva identidad, información y acciones sin desplazamiento horizontal.
- **RNF-4 — Consistencia:** Rol y estado usan las representaciones semánticas aprobadas.

## Dependencias y precedencia

- Depende de las Specs 002, 003, 005 y 006 para interfaz, errores, sesión y acceso.
- Esta spec prevalece para permisos y validación de Mi perfil; la Spec 003 conserva el tratamiento general de errores y la Spec 005 el `401` recuperable.
- Red o `503` después de establecer identidad permanecen en `/profile` con reintento contextual; no usan `/unavailable`.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Prueba de carga con una respuesta pública completa y revisión de los seis campos. |
| RF-2 | Prueba con apellido/teléfono nulos sin mostrar `null`. |
| RF-3 | Pruebas de controles editables para master y superadmin. |
| RF-4 | Prueba visualizer sin Guardar, Editar ni acciones administrativas. |
| RF-5 | Prueba de rol/estado no editables en los tres roles. |
| RF-6 | Pruebas de límites 0/1/50/51 para nombres, 6/7/20/21 para teléfono y correo válido/inválido con normalización. |
| RF-7 | Inspección de payload al conservar y borrar cada campo anulable. |
| RF-8 | Prueba de doble guardado con una sola solicitud. |
| RF-9 | Prueba de éxito que permanece en `/profile` y muestra respuesta confirmada. |
| RF-10 | Prueba de cancelación que restaura valores confirmados. |
| RF-11 | Pruebas `401`, `409`, `422`, red y `503` con conservación contextual según corresponda. |

## Casos límite y errores

- **Borrar apellido o teléfono:** campo opcional vacío confirmado → se envía `null`.
- **Sin cambios:** guardar valores idénticos → no se presenta información diferente de la confirmada por el backend.
- **Correo reservado:** `409` → se conserva el formulario y se muestra conflicto junto al contexto aplicable.
- **Validación del backend:** `422` → errores asociados a los campos correspondientes.
- **Cuenta desactivada durante la edición:** la sesión deja de ser válida → se aplica la Spec 005.

## Fuera de alcance

- Cambiar rol, estado, cédula o contraseña desde Mi perfil.
- Eliminar la propia cuenta.
- Consultar perfiles de otras personas.

## Criterios de finalización

- [ ] Los tres roles consultan únicamente los campos públicos de su cuenta.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Master y superadmin editan los cuatro campos permitidos y visualizer permanece en solo lectura.
- [ ] Los campos anulables se conservan o borran explícitamente sin pérdidas accidentales.
- [ ] Éxito, cancelación, `409`, `422` e indisponibilidad conservan el contexto esperado.
- [ ] Las vistas de escritorio y móvil cumplen el mockup correspondiente y la accesibilidad básica.

## Dudas abiertas

Ninguna.
