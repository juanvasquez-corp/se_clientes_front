# Spec 005 — Ciclo de vida y coordinación de sesión

**Estado:** implementada
**Versión:** 1.3.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

La sesión usa credenciales breves en memoria y una cookie inaccesible al frontend. La aplicación debe restaurar, renovar y cerrar la sesión sin persistir secretos, evitando renovaciones concurrentes y manteniendo un comportamiento seguro entre pestañas.

## Usuarios / actores

- **Usuario autenticado:** necesita mantener o cerrar su sesión de forma predecible.
- **Usuario que recarga:** necesita recuperar una sesión aún válida.
- **Pestañas del mismo navegador:** necesitan coordinar cambios sin compartir tokens.

## Historias de usuario

- **HU-1:** Como usuario autenticado, quiero recargar la aplicación sin iniciar sesión nuevamente mientras mi sesión siga vigente.
- **HU-2:** Como usuario con varias pestañas, quiero que login, renovación y logout no corrompan mi sesión.
- **HU-3:** Como usuario que cierra sesión, quiero confirmar la acción y reintentar si el servicio no está disponible.

## Definiciones

- **Sesión muerta:** restauración o renovación rechazada con `401`; no puede recuperarse localmente.
- **Coordinación limitada:** funcionamiento permitido cuando el navegador carece de alguna capacidad requerida para serializar pestañas, acompañado de una advertencia visible.
- **Verificación de seguridad bloqueada:** estado local intermedio en `/forbidden` que conserva identidad y caché en memoria, pero no las muestra ni permite usar contenido privado; access y CSRF quedan fuera de uso y la sesión del servidor no se declara terminada.

## Requisitos funcionales

- **RF-1 — Estado inicial:** MIENTRAS se determina si existe una sesión recuperable, EL SISTEMA muestra restauración de sesión y no carga contenido privado.
- **RF-2 — Restauración ordenada:** CUANDO inicia o recarga la aplicación, EL SISTEMA obtiene protección CSRF, renueva la sesión y consulta el perfil actual en ese orden.
- **RF-3 — Restauración exitosa:** CUANDO la secuencia finaliza correctamente, EL SISTEMA establece la identidad validada y habilita la navegación protegida.
- **RF-4 — Sesión no recuperable:** SI cualquier paso de restauración responde `401`, ENTONCES EL SISTEMA limpia sesión y datos remotos en memoria y dirige al login.
- **RF-5 — Restauración indisponible:** SI la restauración inicial falla por red o `503`, ENTONCES EL SISTEMA conserva el estado indeterminado, oculta contenido privado y presenta `/unavailable` con reintento manual.
- **RF-6 — Renovación única:** CUANDO solicitudes de una pestaña requieren renovar simultáneamente, EL SISTEMA comparte un único intento de renovación.
- **RF-7 — Reintento tras renovación:** CUANDO una lectura protegida recibe su primer `401` y la renovación concluye correctamente, EL SISTEMA reintenta solo esa lectura una vez con la sesión renovada; nunca repite automáticamente una mutación.
- **RF-8 — Renovación ambigua:** SI la renovación falla por timeout, red o `5xx`, ENTONCES EL SISTEMA no la reintenta automáticamente y ofrece recuperación manual.
- **RF-9 — Coordinación entre pestañas:** CUANDO están disponibles las capacidades requeridas, EL SISTEMA serializa login, renovación y logout entre pestañas y comunica solo señales de sesión.
- **RF-10 — Compatibilidad limitada:** SI falta la coordinación multipestaña requerida, ENTONCES EL SISTEMA permite continuar y advierte que varias pestañas pueden cerrar o invalidar la sesión.
- **RF-11 — Cambio de cuenta:** CUANDO otra pestaña inicia una cuenta distinta o cierra sesión, EL SISTEMA descarta identidad y datos remotos anteriores; ante cuenta distinta restaura la nueva identidad y navega a su destino por rol, y ante logout dirige al login.
- **RF-12 — Confirmación de logout:** CUANDO el usuario solicita cerrar sesión, EL SISTEMA pide confirmación antes de contactar al backend.
- **RF-13 — Logout exitoso:** CUANDO el backend confirma el logout, EL SISTEMA limpia sesión y datos remotos, comunica la señal a otras pestañas y dirige al login.
- **RF-14 — Logout indisponible:** SI el logout falla por red o `503`, ENTONCES EL SISTEMA conserva la sesión actual y ofrece reintentar.
- **RF-15 — Refresh no recuperable:** SI el refresh iniciado por un `401` responde `401`, ENTONCES EL SISTEMA no repite la lectura, limpia credenciales y datos remotos en memoria y dirige al login.
- **RF-16 — `403` indistinguible en refresh/logout:** SI refresh o logout responde `403`, ENTONCES EL SISTEMA no compara el mensaje ni repite la operación, entra en verificación de seguridad bloqueada y muestra en `/forbidden` un mensaje genérico de que no pudo verificar la protección de la sesión, junto con la acción Restablecer protección; únicamente al activar esa acción obtiene un CSRF nuevo y, si lo obtiene, permanece en `/forbidden`, comunica que la protección fue restablecida y ofrece reintentar manualmente la operación original.
- **RF-17 — Login igual en otra pestaña:** CUANDO otra pestaña inicia sesión con la misma cuenta e invalida la sesión anterior, EL SISTEMA descarta access y CSRF locales, limpia la caché remota, oculta temporalmente contenido privado y ejecuta restauración; SI recupera el mismo UUID y la ruta sigue autorizada, ENTONCES conserva la ruta privada actual y recarga sus datos; SI la ruta dejó de estar autorizada, ENTONCES navega al destino inicial del rol.
- **RF-18 — Solicitudes de restauración:** CUANDO restaura sesión, EL SISTEMA solicita CSRF con cookie e intención de navegador, solicita refresh con cookie, CSRF e intención de navegador, y consulta el perfil con el bearer recién obtenido.
- **RF-19 — Solicitud de logout:** CUANDO envía logout, EL SISTEMA incluye cookie, CSRF e intención de navegador; solo una respuesta exitosa ejecuta la limpieza final de identidad y caché y declara la sesión cerrada, mientras un `403` conserva ambas en cuarentena según RF-16.
- **RF-20 — Fallo al recuperar CSRF:** CUANDO la recuperación manual de CSRF iniciada tras RF-16 responde `401`, EL SISTEMA limpia identidad y caché y dirige al login; SI responde otro `403`, ENTONCES permanece en verificación de seguridad bloqueada y muestra `/forbidden` sin nuevos intentos automáticos; SI falla por red o `503`, ENTONCES conserva la identidad y caché en cuarentena, muestra `/unavailable` y ofrece reintentar manualmente la obtención de CSRF.
- **RF-21 — Restauración multipestaña fallida por paso:** SI cualquier paso de RF-17 responde `401`, ENTONCES EL SISTEMA trata la sesión como no recuperable y dirige al login; SI la obtención de CSRF o la consulta de perfil responde `403`, ENTONCES muestra `/forbidden` como acceso denegado sin iniciar recuperación CSRF; SI refresh responde `403`, ENTONCES aplica RF-16; SI cualquiera de los tres pasos falla por red o `503`, ENTONCES muestra `/unavailable` con reintento manual y sin repetir automáticamente la secuencia.
- **RF-22 — `401` durante mutación:** SI POST, PUT, PATCH o DELETE responde `401`, ENTONCES EL SISTEMA no repite la mutación, ejecuta como máximo una renovación; si renueva correctamente conserva el contexto y exige que el usuario confirme un nuevo envío, y si no renueva aplica RF-15, RF-16 o RF-8 según la respuesta.

## Requisitos no funcionales

- **RNF-1 — Memoria solamente:** Access token y CSRF existen solo en memoria; la cookie de refresh nunca es leída por código del frontend.
- **RNF-2 — Canales seguros:** La coordinación entre pestañas nunca transmite tokens, cookies, credenciales ni perfiles completos.
- **RNF-3 — Límite de sesión:** Las renovaciones no presentan la sesión como válida más allá del máximo absoluto establecido por el backend.
- **RNF-4 — Accesibilidad:** Restauración, advertencia de compatibilidad, expiración y errores de logout se anuncian de forma accesible.

## Dependencias y precedencia

- Depende de las Specs 001–004. Especializa la regla de la Spec 003 exclusivamente para el primer `401` de una lectura protegida.
- Prevalece sobre la Spec 003 para refresh, CSRF, logout y coordinación; la Spec 006 decide navegación una vez que esta spec entrega una identidad validada.
- `/unavailable` se reserva a restauración o recuperación de seguridad mientras la identidad no puede usarse; fallos funcionales con identidad operativa permanecen en contexto.
- Los `403` de refresh/logout se tratan de forma uniforme porque el contrato no permite distinguir CSRF, origen o intención de navegador; la regla falla de forma cerrada y nunca reenvía una operación protegida.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | E2E de inicio/recarga verificando pantalla de restauración y ausencia de contenido privado. |
| RF-2 | Inspección del orden CSRF → refresh → perfil. |
| RF-3 | E2E de restauración válida que habilita una ruta privada. |
| RF-4 | Pruebas `401` en cada paso con credenciales/caché vacías y destino login. |
| RF-5 | Pruebas red/`503` iniciales con `/unavailable`, contenido oculto y reintento. |
| RF-6 | Prueba de solicitudes simultáneas en una pestaña con un único refresh. |
| RF-7 | Conteo de una repetición de lectura y ninguna repetición de mutación. |
| RF-8 | Pruebas timeout/red/`5xx` de refresh sin segundo intento automático. |
| RF-9 | E2E multipestaña que serializa login, refresh y logout y revisa mensajes sin tokens. |
| RF-10 | Prueba sin capacidades de coordinación con advertencia y uso de una pestaña operativo. |
| RF-11 | E2E de cuenta distinta con identidad y caché anteriores eliminadas y navegación por nuevo rol. |
| RF-12 | Prueba por teclado de confirmar y cancelar logout. |
| RF-13 | E2E de logout exitoso con limpieza local, señal entre pestañas y login. |
| RF-14 | Pruebas red/`503` de logout con sesión conservada y acción Reintentar. |
| RF-15 | Prueba lectura `401` → refresh `401` con cero repetición y retorno al login. |
| RF-16 | Pruebas `403` en refresh/logout con mensaje variable: `/forbidden`, mensaje genérico, identidad/caché conservadas pero ocultas, tokens fuera de uso, cero reenvíos y recuperación solo al activar Restablecer protección. |
| RF-17 | E2E de login de la misma cuenta en otra pestaña con limpieza y restauración; conserva ruta autorizada o usa destino inicial si el rol ya no la permite. |
| RF-18 | Inspección de cookie/encabezados/bearer en cada paso de restauración. |
| RF-19 | Inspección de logout: éxito limpia definitivamente; `403` conserva identidad/caché en cuarentena sin declarar cierre. |
| RF-20 | Pruebas de recuperación CSRF con `401`, `403`, red y `503`, comprobando login o identidad/caché en cuarentena dentro de `/forbidden` o `/unavailable`, sin bucles. |
| RF-21 | E2E de cada paso multipestaña con `401`, `403`, red y `503`: solo el `403` de refresh activa RF-16; CSRF/perfil muestran acceso denegado. |
| RF-22 | Pruebas de POST, PUT, PATCH y DELETE con `401`: ninguna repetición, una renovación máxima y confirmación manual tras éxito. |

## Casos límite y errores

- **Dos renovaciones simultáneas:** una sola llega al backend; las solicitudes esperan el mismo resultado.
- **Dos pestañas renuevan a la vez:** la coordinación disponible serializa los intentos.
- **Lectura `401` seguida de refresh `401`:** la lectura no se repite y la sesión termina localmente.
- **Refresh o logout `403`:** `/forbidden` muestra el bloqueo de seguridad; identidad/caché quedan en memoria pero ocultas, tokens fuera de uso y una acción manual puede iniciar recuperación de CSRF.
- **Recuperación CSRF fallida:** `401` termina localmente; otro `403` muestra acceso denegado; red o `503` muestra indisponibilidad; nunca hay bucle automático.
- **Login de la misma cuenta en otra pestaña:** la pestaña invalidada limpia secretos y caché, restaura y mantiene su ruta solo si el UUID y la autorización siguen vigentes; un `403` en CSRF/perfil no se trata como fallo CSRF.
- **Navegador sin coordinación:** se muestra advertencia y el flujo de una sola pestaña sigue operativo.
- **Logout ya completado en otra pestaña:** la sesión local se limpia sin tratarlo como error fatal.
- **Sesión expira durante una mutación:** no se reenvía automáticamente; una renovación exitosa exige nueva confirmación y una renovación fallida aplica el resultado de sesión correspondiente.
- **Mutación `401` con renovación exitosa:** la operación original sigue sin repetirse y requiere nueva confirmación del usuario.
- **Perfil cambia de identidad:** se limpia toda información asociada a la cuenta anterior.

## Fuera de alcance

- Persistir tokens o estado autenticado.
- Mantener borradores de formularios al expirar la sesión.
- Modificar las reglas de rotación, duración o revocación del backend.

## Referencias de seguridad

- **[OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html):** un token ausente o inválido debe causar rechazo; una solicitud con efecto no se acepta ni se repite sin una verificación CSRF válida.
- **[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html):** las credenciales de sesión se tratan como no confiables, no se almacenan en storage y una sesión expirada o inválida exige autenticación nueva.
- **[OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html):** `401` representa ausencia de autenticación válida y `403` una solicitud autenticada no permitida.
- **[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html):** una denegación debe salir de forma segura y el acceso se niega por defecto; de aquí se deriva ocultar contenido y no continuar con credenciales no verificadas.
- **[OWASP Business Logic Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html):** recomienda claves de idempotencia para evitar duplicados en reintentos de acciones con efectos. Como este backend no publica tal garantía, el proyecto y el usuario deciden no repetir mutaciones automáticamente y exigir nueva confirmación.

OWASP no prescribe rutas de interfaz. `/login`, `/forbidden` y `/unavailable` proceden del mapa normativo del proyecto y representan respectivamente sesión no recuperable, acceso denegado e identidad temporalmente no verificable.

## Criterios de finalización

- [ ] Login, refresh, recarga y logout funcionan contra el backend real.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] `401`, red y `503` durante restauración se distinguen correctamente.
- [ ] Una pestaña comparte un único refresh y dos pestañas coordinan las operaciones críticas.
- [ ] La ausencia de coordinación genera advertencia sin bloquear el uso.
- [ ] Un logout fallido conserva la sesión y permite reintentar.
- [ ] No se persisten ni transmiten secretos entre pestañas.

## Dudas abiertas

Ninguna.
