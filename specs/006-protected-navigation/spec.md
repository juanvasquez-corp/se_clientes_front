# Spec 006 — Navegación protegida por rol

**Estado:** aprobada  
**Versión:** 1.2.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

Cada rol necesita acceder directamente a su capacidad principal y ver únicamente la navegación que puede utilizar. Los guards mejoran la experiencia, aunque la autorización definitiva permanece en el backend.

## Usuarios / actores

- **Superadmin:** accede a Usuarios y Mi perfil.
- **Master:** accede solo a Mi perfil editable.
- **Visualizer:** accede solo a Mi perfil de consulta.
- **Usuario no autenticado:** accede al login.

## Historias de usuario

- **HU-1:** Como usuario autenticado, quiero aterrizar en la función principal de mi rol para evitar pasos innecesarios.
- **HU-2:** Como usuario sin permiso, quiero recibir una respuesta clara al intentar abrir una ruta restringida.
- **HU-3:** Como usuario móvil, quiero una navegación equivalente y adaptada a mi pantalla.

## Definiciones

- **Destino inicial:** `/users` para superadmin; `/profile` para master y visualizer.
- **Carga imprescindible:** restauración inicial o recuperación de seguridad que debe determinar si la identidad puede usarse antes de mostrar o volver a habilitar contenido privado.

## Requisitos funcionales

- **RF-1 — Resolución previa:** CUANDO se solicita una ruta privada, EL SISTEMA resuelve primero el estado de sesión antes de mostrar su contenido.
- **RF-2 — Destino por rol:** CUANDO finaliza un login y se valida el perfil, EL SISTEMA dirige al superadmin a `/users` y a master o visualizer a `/profile`.
- **RF-3 — Rutas públicas:** EL SISTEMA ofrece `/login`, `/forbidden` y `/unavailable` como estados públicos controlados.
- **RF-4 — Rutas privadas:** EL SISTEMA ofrece `/profile`, `/users`, `/users/new`, `/users/$userUuid` y `/users/$userUuid/edit` solo bajo sesión autenticada.
- **RF-5 — Protección administrativa:** SI master o visualizer intenta acceder a `/users` o cualquiera de sus rutas descendientes, ENTONCES EL SISTEMA lo dirige a `/forbidden`.
- **RF-6 — Sesión ausente:** SI una persona no autenticada solicita una ruta privada, ENTONCES EL SISTEMA la dirige a `/login`; después de autenticarse se aplica siempre RF-2, sin recuperar la ruta previa.
- **RF-7 — Menú superadmin:** MIENTRAS el rol sea superadmin, EL SISTEMA muestra Usuarios, Mi perfil y Cerrar sesión.
- **RF-8 — Menú no administrativo:** MIENTRAS el rol sea master o visualizer, EL SISTEMA muestra Mi perfil y Cerrar sesión, sin mostrar Usuarios.
- **RF-9 — Contexto activo:** MIENTRAS el superadmin navega por listado, creación, detalle o edición, EL SISTEMA mantiene Usuarios como módulo activo.
- **RF-10 — Navegación móvil:** CUANDO el espacio es móvil, EL SISTEMA sustituye la navegación lateral por un menú operable que conserva solo las opciones del rol.
- **RF-11 — Indisponibilidad de identidad:** CUANDO una carga imprescindible falla por red o `503`, EL SISTEMA presenta `/unavailable` con una acción de reintento; los fallos de perfil, directorio o detalle con identidad operativa permanecen en su ruta y usan reintento contextual.

## Requisitos no funcionales

- **RNF-1 — Seguridad:** La ocultación y los guards nunca se consideran sustitutos de autorización del backend.
- **RNF-2 — Redirecciones:** No se aceptan destinos externos ni valores arbitrarios como retorno posterior al login.
- **RNF-3 — Accesibilidad:** La navegación identifica la opción activa, permite teclado y gestiona foco al cambiar de página.
- **RNF-4 — Continuidad:** Las transiciones visuales, cuando existan, comunican jerarquía y respetan movimiento reducido.

## Dependencias y precedencia

- Depende de las Specs 002–005: la Spec 005 entrega el estado de sesión y esta spec decide acceso y destino.
- Prevalece para rutas, menús y destino posterior al login. No existe una ruta raíz funcional ni retorno a una ruta previa.
- La Spec 003 gobierna errores funcionales contextuales; `/unavailable` solo aplica cuando la carga imprescindible deja la identidad sin uso seguro.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | E2E de ruta privada durante restauración comprobando que el contenido no aparece antes de resolverla. |
| RF-2 | E2E de login para los tres roles y comparación de destino exacto. |
| RF-3 | Prueba directa de las tres rutas públicas normativas. |
| RF-4 | Prueba de las cinco rutas privadas con y sin sesión. |
| RF-5 | E2E de master y visualizer sobre cada ruta `/users/*` con destino `/forbidden`. |
| RF-6 | E2E de ruta privada sin sesión seguido de login, comprobando destino por rol y no retorno previo. |
| RF-7 | Revisión del menú de superadmin. |
| RF-8 | Revisión de menús master/visualizer y ausencia de Usuarios. |
| RF-9 | Prueba del indicador activo en listado, creación, detalle y edición. |
| RF-10 | Prueba móvil de apertura, teclado, opciones por rol y cierre al navegar. |
| RF-11 | Pruebas red/`503` durante restauración, recuperación de seguridad y carga funcional, comprobando `/unavailable` solo cuando la identidad no puede usarse. |

## Casos límite y errores

- **Rol desconocido:** perfil validado con rol no soportado → sesión descartada y error de contrato controlado.
- **Ruta administrativa pegada manualmente:** rol no permitido → `/forbidden`, aunque el menú ya la oculte.
- **Parámetro de retorno interno o externo:** se ignora y se usa el destino inicial del rol.
- **Menú móvil abierto al navegar:** se cierra y el foco se mueve al contenido principal.
- **Sesión termina durante navegación:** se aplica la limpieza y retorno al login de la Spec 005.

## Fuera de alcance

- Dashboard, Inicio, Configuración, auditoría o notificaciones.
- Autorizar operaciones en nombre del backend.
- Rutas de registro o recuperación de contraseña.

## Criterios de finalización

- [ ] Cada rol aterriza en su destino inicial y ve únicamente su menú permitido.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Todas las rutas administrativas rechazan master y visualizer.
- [ ] Las rutas privadas esperan la restauración de sesión.
- [ ] Las redirecciones externas o desconocidas no son aceptadas.
- [ ] Navegación de escritorio y móvil funciona por teclado y refleja el módulo activo.

## Dudas abiertas

Ninguna.
