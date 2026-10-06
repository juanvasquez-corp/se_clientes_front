# Spec 002 — Fundamentos visuales, responsive y accesibles

> Especificación transversal de la experiencia visual. Los componentes, estilos y organización técnica pertenecen al plan.

**Estado:** implementada
**Versión:** 1.1.0  
**Fecha:** 2026-10-02  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

Las pantallas deben compartir una identidad Aliar coherente, estados comprensibles y una experiencia accesible en escritorio y móvil. Esta spec establece la base observable que las funcionalidades posteriores reutilizarán, evitando variaciones visuales y patrones incompatibles.

## Usuarios / actores

- **Usuarios internos:** necesitan reconocer acciones, estados y jerarquías de forma consistente.
- **Usuarios de teclado o tecnologías de asistencia:** necesitan operar y comprender toda interacción.
- **Equipo de producto:** necesita que los mockups y la guía aprobada se apliquen de forma uniforme.

## Historias de usuario

- **HU-1:** Como usuario interno, quiero una interfaz consistente para reconocer rápidamente cómo navegar y actuar.
- **HU-2:** Como usuario móvil, quiero conservar las mismas capacidades sin contenido comprimido o controles inaccesibles.
- **HU-3:** Como usuario de teclado, quiero identificar el foco y recibir feedback de cambios y errores.

## Definiciones

- **Estado global:** presentación reutilizable de carga, indisponibilidad, acceso denegado o fallo inesperado.
- **Acción destructiva:** operación irreversible para el usuario, representada exclusivamente con semántica de peligro.

## Requisitos funcionales

- **RF-1 — Identidad de marca:** EL SISTEMA presenta logo, colores, tipografía, espaciado, radios y sombras conforme a los recursos y mockups aprobados.
- **RF-2 — Jerarquía consistente:** CUANDO se muestra una página, EL SISTEMA ordena ubicación, título, explicación, acción principal, contenido e información secundaria según corresponda.
- **RF-3 — Adaptación responsive:** CUANDO el ancho disponible cambia entre móvil, tableta y escritorio, EL SISTEMA reorganiza navegación, formularios y listados sin eliminar capacidades permitidas.
- **RF-4 — Controles accesibles:** EL SISTEMA proporciona nombre accesible, etiqueta persistente, foco visible y operación por teclado para cada control interactivo.
- **RF-5 — Feedback asíncrono:** MIENTRAS una operación está en curso, EL SISTEMA muestra estado pendiente, evita el doble envío y comunica el resultado de forma perceptible.
- **RF-6 — Estados reutilizables:** CUANDO una vista carga, queda vacía, falla o no está disponible, EL SISTEMA muestra una presentación específica y una recuperación manual cuando sea posible.
- **RF-7 — Confirmaciones:** CUANDO una acción requiere confirmación, EL SISTEMA mantiene el foco dentro del diálogo, permite cancelar y devuelve el foco al origen al cerrarlo.
- **RF-8 — Iconografía:** EL SISTEMA usa únicamente la iconografía corporativa aprobada y acompaña los iconos accionables con un nombre accesible.
- **RF-9 — Movimiento responsable:** SI una persona solicita movimiento reducido, ENTONCES EL SISTEMA elimina o reduce las animaciones no esenciales.

## Requisitos no funcionales

- **RNF-1 — Contraste:** Texto, controles, foco y estados cumplen como mínimo WCAG 2.1 AA.
- **RNF-2 — Área táctil:** Los controles táctiles disponen de un área operable mínima de 44 × 44 píxeles.
- **RNF-3 — Coherencia:** Una misma acción y estado conservan etiqueta, color y jerarquía visual en toda la aplicación.
- **RNF-4 — Seguridad de contenido:** Los datos externos se muestran como texto; no se interpreta HTML no confiable.
- **RNF-5 — Tema:** La experiencia usa el diseño claro corporativo aprobado; no se incorpora un modo oscuro no solicitado.

## Dependencias y precedencia

- Depende de la base reproducible de la Spec 001.
- Sus reglas visuales y de accesibilidad se aplican a las Specs 004–012. Las specs funcionales definen qué comportamiento mostrar, pero no pueden debilitar estos requisitos transversales.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Comparación visual de vistas de referencia con mockups, guía y tokens aprobados. |
| RF-2 | Revisión de la secuencia visible en una página de cada módulo. |
| RF-3 | Prueba responsive en móvil, tableta y escritorio sin pérdida de acciones permitidas. |
| RF-4 | Prueba por teclado y revisión de nombres, etiquetas y foco de todos los controles comunes. |
| RF-5 | Prueba de doble activación y anuncios durante una operación pendiente y al finalizar. |
| RF-6 | Prueba visual de carga, vacío, error e indisponibilidad con su recuperación aplicable. |
| RF-7 | Prueba de foco al abrir, operar, cancelar y cerrar un diálogo. |
| RF-8 | Inspección de iconos usados y nombres accesibles de acciones iconográficas. |
| RF-9 | Prueba con movimiento reducido verificando ausencia de animaciones no esenciales. |

## Casos límite y errores

- **Texto largo:** nombres, correos o mensajes extensos → se ajustan o truncan sin ocultar su contenido accesible.
- **Zoom y reflujo:** ampliación de hasta 200 % → el contenido sigue operable sin superposición crítica.
- **Error durante un diálogo:** la confirmación falla → el diálogo conserva contexto y anuncia el error sin cerrarse automáticamente.
- **Datos opcionales ausentes:** apellido o teléfono nulos → se presenta una ausencia comprensible, nunca la cadena técnica `null`.
- **Animación no disponible:** la plataforma no soporta una transición → la navegación funciona sin pérdida de información.

## Fuera de alcance

- Definir comportamientos de negocio de autenticación, perfiles o usuarios.
- Incorporar librerías de iconos, temas alternativos o recursos visuales no aprobados.
- Añadir dashboard, métricas, notificaciones o buscador global.

## Criterios de finalización

- [ ] Los patrones comunes cubren estado normal, foco, deshabilitado, carga y error.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Las vistas de referencia funcionan con teclado y no presentan fallos automatizados críticos de accesibilidad.
- [ ] La experiencia se compara con los mockups en escritorio y móvil.
- [ ] Colores, iconos y espaciados proceden de la identidad aprobada.
- [ ] El movimiento reducido y el reflujo responsive están verificados.

## Dudas abiertas

Ninguna.
