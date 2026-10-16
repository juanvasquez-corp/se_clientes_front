# Spec 010 — Detalle administrativo de usuario

**Estado:** implementada
**Versión:** 1.1.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

El superadmin necesita consultar una cuenta concreta antes de editarla o gestionar su estado. El detalle debe usar únicamente datos públicos y adaptar sus acciones cuando la cuenta consultada es la propia.

## Usuarios / actores

- **Superadmin:** consulta cuentas propias o de terceros y accede a acciones permitidas.
- **Master y visualizer:** no acceden a detalles administrativos.

## Historias de usuario

- **HU-1:** Como superadmin, quiero consultar los datos públicos de una cuenta para decidir la acción administrativa adecuada.
- **HU-2:** Como superadmin, quiero distinguir mi propia cuenta para no intentar acciones prohibidas.

## Requisitos funcionales

- **RF-1 — Carga por UUID:** CUANDO un superadmin abre `/users/$userUuid`, EL SISTEMA consulta la cuenta mediante su UUID público.
- **RF-2 — Información visible:** CUANDO la cuenta existe, EL SISTEMA muestra nombre, apellido, correo, teléfono, rol y estado.
- **RF-3 — Contexto administrativo:** EL SISTEMA muestra la ubicación dentro de Usuarios y ofrece volver al listado.
- **RF-4 — Edición:** CUANDO la cuenta está disponible, EL SISTEMA ofrece abrir su edición administrativa.
- **RF-5 — Acciones de terceros:** SI la cuenta pertenece a otra persona, ENTONCES EL SISTEMA ofrece las acciones de cambio de estado y eliminación permitidas por la Spec 012.
- **RF-6 — Cuenta propia:** SI el UUID corresponde al superadmin autenticado, ENTONCES EL SISTEMA oculta eliminación y cambio de estado y comunica que su rol y estado no pueden modificarse.
- **RF-7 — Recurso inexistente:** SI el backend responde `404`, ENTONCES EL SISTEMA muestra un estado de usuario no encontrado con regreso al listado.
- **RF-8 — Recarga contextual:** CUANDO una edición concluye correctamente, EL SISTEMA vuelve al detalle del mismo UUID; CUANDO cambia el estado, permanece en ese detalle; en ambos casos muestra los datos confirmados actualizados.

## Requisitos no funcionales

- **RNF-1 — Privacidad:** El detalle nunca muestra cédula, ID interno, fechas, contraseña o hash.
- **RNF-2 — Accesibilidad:** Etiquetas, valores, badges y acciones son comprensibles sin depender solo del color.
- **RNF-3 — Responsive:** El detalle conserva jerarquía y acciones válidas en escritorio y móvil.
- **RNF-4 — Seguridad:** El frontend no deduce autorización distinta de las restricciones visuales documentadas; el backend decide cada operación.

## Dependencias y precedencia

- Depende de las Specs 002, 003, 005, 006 y 008; enlaza las Specs 011 y 012.
- Esta spec prevalece para presentación del detalle y su `404`; el primer `401` de lectura sigue la Spec 005.
- Red o `503` permanecen en el detalle solicitado con reintento contextual; no usan `/unavailable`.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Prueba de consulta usando exclusivamente el UUID de la ruta. |
| RF-2 | Revisión de los seis datos públicos con respuesta válida. |
| RF-3 | Prueba de breadcrumb y regreso al listado. |
| RF-4 | Prueba de acción Editar hacia la ruta del mismo UUID. |
| RF-5 | Prueba de cuenta ajena con acciones de estado y eliminación. |
| RF-6 | Prueba de cuenta propia sin acciones prohibidas y con explicación. |
| RF-7 | Prueba `404` con estado no encontrado y regreso al listado. |
| RF-8 | E2E de edición y estado comprobando detalle del mismo UUID y datos actualizados. |

## Casos límite y errores

- **UUID con formato inválido:** no se realiza una consulta útil y se presenta recurso no encontrado.
- **Cuenta eliminada entre listado y detalle:** `404` → estado no encontrado y regreso al listado.
- **Cuenta cambia mientras está abierta:** una actualización posterior reemplaza los datos visibles con la respuesta confirmada.
- **Fallo de red o `503`:** se conserva el UUID y se ofrece reintentar la carga.
- **Apellido o teléfono nulos:** se muestran como no informados.

## Fuera de alcance

- Mostrar cédula, fechas, auditoría o historial de cambios.
- Editar directamente dentro de la vista de detalle.
- Consultar el detalle por correo, cédula o ID interno.

## Criterios de finalización

- [ ] Solo superadmin accede al detalle mediante UUID público.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Se muestran únicamente los seis campos públicos definidos.
- [ ] La cuenta propia no ofrece acciones prohibidas.
- [ ] `404`, red y `503` presentan recuperación contextual.
- [ ] El detalle funciona en escritorio y móvil y enlaza edición y gestión de estado.

## Dudas abiertas

Ninguna.
