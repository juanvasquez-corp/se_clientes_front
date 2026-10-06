# Spec 003 — Integración segura y tratamiento de errores

> Especificación transversal del comportamiento frente a la API. Las herramientas, clientes, schemas y archivos concretos pertenecen al plan.

**Estado:** implementada
**Versión:** 1.3.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

El frontend consume datos externos que pueden ser inválidos, incompletos o fallar. Se necesita una conducta uniforme que proteja datos sensibles, evite reenvíos peligrosos y transforme las respuestas del backend en estados comprensibles para las funcionalidades posteriores.

## Usuarios / actores

- **Usuarios internos:** necesitan mensajes recuperables sin detalles técnicos o sensibles.
- **Equipo de desarrollo:** necesita contratos verificables y una clasificación estable de errores.
- **Backend:** conserva la autoridad sobre autenticación, permisos y reglas de negocio.

## Historias de usuario

- **HU-1:** Como usuario, quiero saber si debo corregir datos, volver a autenticarme o reintentar más tarde.
- **HU-2:** Como desarrollador, quiero rechazar respuestas incompatibles antes de mostrarlas para evitar estados corruptos.

## Definiciones

- **Error de contrato:** respuesta que no cumple la estructura pública esperada, aunque su código HTTP indique éxito.
- **Mutación:** operación que crea, modifica, cambia estado o elimina información.

## Requisitos funcionales

- **RF-1 — Validación externa:** CUANDO se recibe una respuesta externa, EL SISTEMA valida su estructura antes de entregarla a la interfaz.
- **RF-2 — Contrato inválido:** SI una respuesta de éxito es inválida o contiene JSON corrupto, ENTONCES EL SISTEMA la rechaza y muestra un error técnico controlado sin renderizar datos parciales.
- **RF-3 — Payload mínimo:** CUANDO se envían datos, EL SISTEMA construye explícitamente solo los campos permitidos por la operación.
- **RF-4 — Clasificación estable:** CUANDO la API responde con error, EL SISTEMA determina el tratamiento por código HTTP y estructura de `detail`, no por el texto del mensaje.
- **RF-5 — Errores de campo:** CUANDO una respuesta `422` identifica campos en `detail[].loc`, EL SISTEMA asocia cada error conocido con su control y presenta los restantes como error general.
- **RF-6 — Permiso y recurso:** CUANDO se recibe `403` o un `404` de detalle, EL SISTEMA muestra respectivamente acceso denegado o recurso inexistente sin intentar renovar la sesión; el `404` de búsqueda se rige por la Spec 008.
- **RF-7 — Conflicto:** CUANDO se recibe `409`, EL SISTEMA conserva el contexto y presenta la regla de negocio incumplida.
- **RF-8 — Indisponibilidad:** CUANDO una operación funcional falla por red o `503`, EL SISTEMA permanece en su vista y ofrece reintento contextual; la restauración o recuperación de seguridad que impide usar la identidad presenta `/unavailable`, según las Specs 005 y 006.
- **RF-9 — Frontera de reintentos:** EL SISTEMA no reintenta automáticamente mutaciones ni respuestas `403`, `404`, `409`, `413`, `415` o `422`; ante el primer `401` de una lectura protegida permite exclusivamente la recuperación única de la Spec 005 y repite esa lectura una vez solo si la renovación tuvo éxito; el `401` de una mutación se rige por RF-19.
- **RF-10 — Cancelación:** CUANDO una lectura deja de ser necesaria por navegación o reemplazo, EL SISTEMA cancela la solicitud pendiente y evita presentar su resultado tardío.
- **RF-11 — Actualización de datos:** CUANDO una mutación finaliza correctamente, EL SISTEMA actualiza o invalida los datos relacionados para no mostrar información obsoleta.
- **RF-12 — Limpieza por identidad:** CUANDO termina una sesión o cambia la cuenta autenticada, EL SISTEMA elimina todos los datos remotos conservados en memoria.
- **RF-13 — Intención de navegador:** CUANDO se llama cualquier operación de autenticación, EL SISTEMA envía `X-Requested-With: XMLHttpRequest`.
- **RF-14 — Cookies de autenticación:** CUANDO se llama login, CSRF, refresh o logout, EL SISTEMA habilita el envío y recepción de cookies sin intentar leer la cookie HttpOnly; el login envía un cuerpo JSON.
- **RF-15 — Protección CSRF:** CUANDO se llama refresh o logout, EL SISTEMA envía el token CSRF en `X-CSRF-Token` además de la cookie y la intención de navegador.
- **RF-16 — Autorización de usuarios:** CUANDO se llama una operación de usuarios, EL SISTEMA envía el access token vigente como bearer; las operaciones de creación o modificación envían JSON.
- **RF-17 — Destinos cerrados:** EL SISTEMA adjunta credenciales y bearer únicamente a los destinos propios y conocidos de autenticación y usuarios; rechaza URLs construidas desde formularios, parámetros o respuestas externas.
- **RF-18 — Solicitud inválida:** SI la API responde `400`, ENTONCES EL SISTEMA conserva el contexto y muestra un error técnico controlado con una acción segura para volver a intentar manualmente cuando corresponda.
- **RF-19 — `401` de mutación:** SI una mutación responde `401`, ENTONCES EL SISTEMA nunca la repite automáticamente, intenta una sola recuperación de sesión y, si tiene éxito, conserva el contexto y exige una nueva confirmación explícita antes de un nuevo envío; si la recuperación falla, aplica los resultados de sesión de la Spec 005.

## Requisitos no funcionales

- **RNF-1 — Confidencialidad:** Solicitudes, errores y diagnósticos no registran tokens, cookies, contraseñas, cédulas ni cuerpos sensibles.
- **RNF-2 — No persistencia:** Los datos remotos y errores de la sesión no se persisten entre recargas o cuentas.
- **RNF-3 — Integridad:** Las respuestas públicas de usuario nunca incorporan cédula, identificador interno, contraseña, hash o fechas no publicadas.
- **RNF-4 — Recuperación:** Todo error recuperable ofrece una acción explícita y evita bucles automáticos.

## Dependencias y precedencia

- Depende de la Spec 001 y aplica transversalmente a las Specs 004–012.
- La Spec 005 prevalece para `401`, refresh, CSRF y sesión; la Spec 004 para `429`; la Spec 008 para `404` de búsqueda; las Specs 007–012 conservan contexto ante fallos funcionales.
- Esta spec conserva la regla general: fuera de esas especializaciones no hay reintentos automáticos.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Pruebas de contrato válido antes de renderizar cada respuesta externa. |
| RF-2 | Pruebas con respuesta incompatible y JSON corrupto sin datos parciales en UI. |
| RF-3 | Inspección de cuerpos enviados con propiedades extra presentes en el estado de pantalla. |
| RF-4 | Pruebas con igual código y mensajes distintos que produzcan el mismo tratamiento. |
| RF-5 | Pruebas `422` con ubicaciones conocidas y desconocidas. |
| RF-6 | Pruebas separadas de `403`, `404` de detalle y `404` de búsqueda sin refresh. |
| RF-7 | Prueba `409` que mantiene la vista y comunica de forma visible la regla de negocio incumplida. |
| RF-8 | Pruebas red/`503` en restauración, recuperación de seguridad y lectura funcional, comprobando `/unavailable` solo cuando la identidad no puede usarse. |
| RF-9 | Pruebas de conteo de solicitudes: cero retry para códigos excluidos y una sola repetición de lectura tras refresh exitoso. |
| RF-10 | Prueba de navegación durante lectura y descarte de respuesta tardía. |
| RF-11 | Prueba de datos relacionados después de cada mutación exitosa. |
| RF-12 | Prueba de caché vacía tras logout y cambio de cuenta. |
| RF-13 | Inspección de todas las solicitudes de autenticación y su encabezado obligatorio. |
| RF-14 | Inspección de credenciales habilitadas en auth, login JSON y ausencia de lectura de cookie HttpOnly. |
| RF-15 | Inspección de refresh/logout con cookie, CSRF e intención de navegador. |
| RF-16 | Inspección de bearer en usuarios y tipo JSON en POST, PUT y PATCH. |
| RF-17 | Prueba con URL externa o arbitraria comprobando rechazo y ausencia de credenciales. |
| RF-18 | Prueba `400` comprobando contexto conservado, error técnico visible y ausencia de reintento automático. |
| RF-19 | Pruebas de POST, PUT, PATCH y DELETE con `401`: cero repetición automática, una recuperación máxima y nueva confirmación exigida tras recuperación exitosa. |

## Casos límite y errores

- **Éxito con JSON corrupto:** código exitoso y cuerpo ilegible → error de contrato controlado.
- **Campo desconocido en `422`:** ubicación no asociable → mensaje general, sin perder errores de campos conocidos.
- **Cuerpo demasiado grande o medio incorrecto:** `413` o `415` → error de integración sin reintento automático.
- **Respuesta tardía cancelada:** llega después de cambiar de vista → se descarta.
- **Error sin `detail` válido:** se usa tratamiento genérico por código sin comparar mensajes.
- **Solicitud inválida `400`:** se conserva el contexto, se muestra error técnico controlado y no se reintenta automáticamente.

## Fuera de alcance

- Implementar la recuperación de sesión, definida en la Spec 005.
- Modificar contratos, CORS o respuestas del backend.
- Mostrar detalles internos, trazas o mensajes técnicos crudos al usuario.

## Criterios de finalización

- [ ] Cada respuesta consumida posee verificaciones de caso válido, inválido y JSON corrupto.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Los códigos `400`, `401`, `403`, `404`, `409`, `413`, `415`, `422`, `429` y `503` tienen tratamiento definido entre esta spec y la spec funcional correspondiente.
- [ ] Las mutaciones no se reenvían automáticamente después de errores ambiguos.
- [ ] La limpieza de datos por cambio de identidad está verificada.
- [ ] No se exponen datos sensibles en UI, almacenamiento o diagnósticos.

## Dudas abiertas

Ninguna.
