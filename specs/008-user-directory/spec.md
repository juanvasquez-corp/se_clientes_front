# Spec 008 — Listado, búsqueda y paginación de usuarios

**Estado:** aprobada  
**Versión:** 1.1.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

El superadmin necesita localizar y consultar cuentas desde un directorio paginado. La búsqueda disponible es exclusivamente por correo exacto; la interfaz no debe simular filtros ni búsquedas que la API no publica.

## Usuarios / actores

- **Superadmin:** lista cuentas, busca por correo y abre su detalle.
- **Master y visualizer:** no acceden al directorio.

## Historias de usuario

- **HU-1:** Como superadmin, quiero revisar las cuentas por páginas para administrarlas.
- **HU-2:** Como superadmin, quiero buscar una cuenta por correo exacto para llegar rápidamente a su detalle.
- **HU-3:** Como usuario móvil, quiero consultar el mismo directorio en tarjetas legibles.

## Definiciones

- **Búsqueda exacta:** consulta de un correo completo válido, normalizado sin distinguir mayúsculas.

## Requisitos funcionales

- **RF-1 — Carga paginada:** CUANDO un superadmin abre `/users`, EL SISTEMA solicita y muestra una página de cuentas con total de registros, página actual, total de páginas y tamaño de página.
- **RF-2 — Datos del listado:** EL SISTEMA muestra nombre, apellido, correo, rol y estado de cada cuenta, junto con acceso al detalle y acciones permitidas.
- **RF-3 — Navegación de páginas:** CUANDO el superadmin selecciona una página válida, EL SISTEMA carga esa página y mantiene visible el estado de paginación.
- **RF-4 — Búsqueda válida:** CUANDO se envía un correo completo con formato válido, EL SISTEMA realiza la búsqueda exacta y sustituye el contenido del listado por el resultado encontrado.
- **RF-5 — Búsqueda inválida:** SI el correo está vacío o tiene formato inválido al intentar buscar, ENTONCES EL SISTEMA no envía la búsqueda y muestra la validación correspondiente.
- **RF-6 — Limpiar búsqueda:** CUANDO se limpia una búsqueda activa, EL SISTEMA restaura el directorio paginado.
- **RF-7 — Sin resultado:** SI la búsqueda responde `404`, ENTONCES EL SISTEMA muestra que no existe una cuenta para ese correo sin tratarlo como fallo de página.
- **RF-8 — Listado vacío:** SI una página válida no contiene cuentas, ENTONCES EL SISTEMA muestra un estado vacío con la acción de crear usuario.
- **RF-9 — Carga localizada:** MIENTRAS carga o cambia una página, EL SISTEMA muestra un esqueleto localizado sin bloquear toda la aplicación.
- **RF-10 — Vista móvil:** CUANDO el ancho es móvil, EL SISTEMA representa cada cuenta como tarjeta con nombre, correo, rol, estado y acceso al detalle.
- **RF-11 — Acciones propias:** SI una fila corresponde al superadmin autenticado, ENTONCES EL SISTEMA no muestra acciones para eliminarse o cambiar su propio estado.
- **RF-12 — Crear usuario:** CUANDO el directorio está disponible para un superadmin, EL SISTEMA muestra una acción principal visible que navega a `/users/new`; la misma acción permanece disponible en el estado vacío.

## Requisitos no funcionales

- **RNF-1 — Privacidad:** El listado y la búsqueda nunca muestran ni solicitan cédula, ID interno, contraseña, hash o fechas.
- **RNF-2 — Accesibilidad:** Tabla, paginación, buscador y tarjetas poseen nombres y orden de foco comprensibles.
- **RNF-3 — Cancelación:** Una página o búsqueda reemplazada cancela la lectura anterior y descarta resultados tardíos.
- **RNF-4 — Rendimiento:** No se carga intencionalmente más de 50 cuentas por página.

## Dependencias y precedencia

- Depende de las Specs 002, 003, 005 y 006.
- Esta spec especializa el `404` de búsqueda como “sin resultado”; un `404` de detalle sigue la Spec 003/010 y un `401` sigue la recuperación única de la Spec 005.
- Red o `503` permanecen en `/users` con página o búsqueda conservada y reintento contextual; no usan `/unavailable`.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Prueba de respuesta paginada con total, página actual, páginas y tamaño visibles. |
| RF-2 | Revisión de columnas/tarjeta y acciones permitidas con datos públicos. |
| RF-3 | Prueba de navegación entre primera, intermedia y última página. |
| RF-4 | Prueba de correo exacto normalizado y sustitución del listado por un resultado. |
| RF-5 | Pruebas de búsqueda vacía e inválida sin solicitud. |
| RF-6 | Prueba de limpiar búsqueda y restaurar directorio paginado. |
| RF-7 | Prueba `404` del endpoint de búsqueda como estado sin resultado y sin navegación de error. |
| RF-8 | Prueba de página vacía con mensaje y acción Crear usuario. |
| RF-9 | Prueba de carga localizada sin bloqueo global. |
| RF-10 | Comparación de tabla de escritorio y tarjetas móviles con la misma información prioritaria. |
| RF-11 | Prueba de fila propia sin estado/eliminación y fila ajena con acciones aplicables. |
| RF-12 | Prueba de acción Crear usuario en directorio con datos y vacío, ambas hacia `/users/new`. |

## Casos límite y errores

- **Página fuera de rango tras una eliminación:** se carga la última página válida disponible.
- **Búsqueda y cambio de página simultáneos:** prevalece la interacción más reciente y se descarta la respuesta anterior.
- **Apellido nulo:** se presenta como no informado sin romper orden ni accesibilidad.
- **Directorio `403`:** se presenta acceso denegado y no se intenta renovar sesión.
- **Red o `503`:** se conserva el contexto de página o búsqueda y se ofrece reintento manual.

## Fuera de alcance

- Búsqueda parcial, por cédula o por nombre.
- Filtros por rol o estado, ordenamiento y selección masiva.
- Auditoría, exportación o descarga del directorio.

## Criterios de finalización

- [ ] El superadmin lista, pagina, busca un correo exacto y limpia la búsqueda.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Master y visualizer no acceden al directorio.
- [ ] Los estados carga, vacío, sin resultado, error y éxito son distinguibles.
- [ ] Escritorio usa tabla y móvil usa tarjetas sin perder información prioritaria.
- [ ] No existen filtros no soportados ni exposición de datos confidenciales.

## Dudas abiertas

Ninguna.
