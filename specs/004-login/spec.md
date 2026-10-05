# Spec 004 — Inicio de sesión

**Estado:** aprobada  
**Versión:** 1.1.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

Los usuarios internos necesitan autenticarse con correo y contraseña para acceder a las capacidades permitidas por su rol. La pantalla debe ser clara, accesible y resistente a dobles envíos y límites de intentos, sin ofrecer funciones inexistentes.

## Usuarios / actores

- **Usuario no autenticado:** superadmin, master o visualizer que necesita iniciar sesión.
- **Backend:** valida credenciales, estado de cuenta y límite de intentos.

## Historias de usuario

- **HU-1:** Como usuario interno, quiero ingresar mis credenciales para acceder a mi funcionalidad principal.
- **HU-2:** Como usuario temporalmente limitado, quiero saber cuándo podré intentar de nuevo.

## Definiciones

- **Tiempo de bloqueo:** duración indicada por `Retry-After` cuando sea legible; en su ausencia o si CORS impide leerlo, cinco minutos.

## Requisitos funcionales

- **RF-1 — Capacidades acotadas:** EL SISTEMA permite únicamente autenticarse con correo, contraseña y la acción Ingresar; puede mostrar identidad de marca, título, explicación, revelación temporal de contraseña y feedback, pero no registro, recuperación, acceso social ni otras acciones funcionales.
- **RF-2 — Validación previa:** CUANDO el correo está vacío o no tiene formato válido, o la contraseña está vacía o supera 128 caracteres, EL SISTEMA muestra errores asociados y no envía la solicitud.
- **RF-3 — Envío único:** CUANDO el usuario envía credenciales válidas, EL SISTEMA indica actividad y bloquea nuevos envíos hasta recibir una respuesta.
- **RF-4 — Sesión iniciada:** CUANDO el backend acepta las credenciales, EL SISTEMA conserva la sesión solo en memoria, obtiene el perfil actual y delega el destino inicial a la navegación por rol.
- **RF-5 — Credenciales rechazadas:** SI el backend responde `401` al login, ENTONCES EL SISTEMA conserva el correo, limpia la contraseña y muestra un error de credenciales sin revelar qué dato falló.
- **RF-6 — Límite de intentos:** SI el backend responde `429`, ENTONCES EL SISTEMA deshabilita el formulario durante el tiempo de bloqueo y comunica que los intentos están temporalmente limitados.
- **RF-7 — Rehabilitación:** CUANDO vence el tiempo de bloqueo, EL SISTEMA rehabilita el formulario sin requerir recargar la página.
- **RF-8 — Indisponibilidad:** SI el login falla por red o `503`, ENTONCES EL SISTEMA conserva el correo, limpia la contraseña y ofrece reintento manual.
- **RF-9 — Sesión existente:** CUANDO una persona autenticada abre la ruta de login, EL SISTEMA la dirige a la funcionalidad inicial correspondiente a su rol.

## Requisitos no funcionales

- **RNF-1 — Privacidad:** La contraseña no se registra, no se persiste y se oculta visualmente salvo revelación temporal solicitada por el usuario.
- **RNF-2 — Accesibilidad:** Errores, bloqueo y cambios de estado se anuncian de forma accesible; el foco llega al primer error relevante.
- **RNF-3 — Responsive:** La vista usa el fondo corporativo correspondiente a escritorio o móvil sin comprometer la legibilidad.
- **RNF-4 — Seguridad:** No existen registro público, acceso social ni enlaces de recuperación o cambio de contraseña.

## Dependencias y precedencia

- Depende de las Specs 001–003 para base, interfaz e integración.
- La Spec 005 gobierna el almacenamiento y ciclo de la sesión creada; la Spec 006 gobierna el destino por rol. Esta spec prevalece para el tratamiento del `401` de credenciales y el `429` del login.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Revisión de capacidades visibles confirmando login y ausencia de registro, recuperación y acceso social. |
| RF-2 | Pruebas de correo vacío/inválido y contraseña vacía/de 129 caracteres sin solicitud. |
| RF-3 | Prueba de doble activación con una sola solicitud y estado pendiente visible. |
| RF-4 | E2E de login válido comprobando memoria, perfil validado y entrega a navegación por rol. |
| RF-5 | Prueba `401` comprobando correo conservado, contraseña limpia y mensaje no revelador. |
| RF-6 | Pruebas `429` con todas las variantes de `Retry-After` definidas en casos límite. |
| RF-7 | Prueba con reloj controlado comprobando rehabilitación exacta sin recarga. |
| RF-8 | Pruebas de red y `503` con correo conservado y reintento manual. |
| RF-9 | Prueba de `/login` con cada rol autenticado y su destino normativo. |

## Casos límite y errores

- **`Retry-After` en segundos positivo:** se respeta exactamente la cantidad indicada.
- **`Retry-After` igual a cero:** el formulario se rehabilita inmediatamente.
- **`Retry-After` negativo, malformado, ausente o no legible por CORS:** se considera inválido y se aplica un bloqueo de cinco minutos.
- **`Retry-After` como fecha HTTP futura válida:** se bloquea hasta esa fecha según el reloj actual.
- **`Retry-After` como fecha HTTP vencida:** el formulario se rehabilita inmediatamente.
- **`Retry-After` válido desproporcionadamente largo:** se respeta sin aplicar un límite local distinto del indicado por el backend.
- **Recarga durante bloqueo:** el bloqueo no persiste; un nuevo intento queda sujeto nuevamente a la respuesta del backend.
- **Cuenta inactiva o eliminada:** el backend responde como credenciales incorrectas → se usa el mismo mensaje genérico del `401`.
- **Perfil inválido tras login:** se descarta la sesión en memoria y se presenta un error controlado.

## Fuera de alcance

- Registro público, recuperación, cambio o restablecimiento de contraseña.
- Recordar correo, contraseña o sesión en almacenamiento persistente.
- Decodificar credenciales o permisos desde el token.

## Criterios de finalización

- [ ] Login exitoso funciona para los tres roles y entrega el control a su destino correcto.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Los casos `401`, `429`, red y `503` cumplen el comportamiento definido.
- [ ] El bloqueo usa `Retry-After` cuando es legible y cinco minutos como fallback.
- [ ] La vista coincide con los mockups de escritorio y móvil y funciona por teclado.
- [ ] No aparecen capacidades fuera de alcance ni datos sensibles persistidos.

## Dudas abiertas

Ninguna.
