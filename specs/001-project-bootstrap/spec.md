# Spec 001 — Inicialización del proyecto y control de versiones

> Especificación del punto de partida reproducible del frontend. Describe qué capacidades debe ofrecer la base del proyecto; las tecnologías, dependencias, comandos concretos y archivos pertenecen al plan.

**Estado:** aprobada  
**Versión:** 1.3.0  
**Fecha:** 2026-10-05  
**Proyecto:** Gestión de usuarios — Frontend

## Contexto y objetivo

El frontend necesita una base reproducible y validable para evolucionar mediante SDD, sin exponer configuración sensible ni incorporar al control de versiones recursos locales. Durante el bootstrap se comprobó que una prerelease canary de React no satisface las peer dependencies estables del stack aprobado; por decisión explícita del usuario, la base debe usar React estable sin overrides ocultos.

## Usuarios / actores

- **Equipo de desarrollo:** necesita instalar, ejecutar, comprobar y construir el frontend de forma consistente.
- **Equipo de calidad:** necesita flujos verificables para pruebas automáticas y de navegador.
- **Responsable del repositorio:** necesita iniciar el seguimiento sin incluir configuración local ni recursos expresamente excluidos.

## Historias de usuario

- **HU-1:** Como integrante del equipo, quiero preparar el proyecto desde una copia limpia para comenzar a desarrollar sobre una base reproducible.
- **HU-2:** Como responsable de calidad, quiero ejecutar comprobaciones uniformes para detectar regresiones desde el inicio.
- **HU-3:** Como responsable del repositorio, quiero separar configuración pública de configuración local para evitar publicar información no destinada al control de versiones.

## Definiciones

- **Configuración pública:** valores consumibles por el navegador que no contienen secretos.
- **Recursos excluidos:** `.opencode`, `docs/desing/guia_diseno_front.md`, `docs/primeros_pasos/`, `docs/constitution.md`, `AGENTS.md` y `MEMORY.md`.
- **React estable:** release publicada en el canal estable, sin identificador de prerelease; `react` y `react-dom` usan la misma versión fijada y compatible con las peer dependencies declaradas del stack.
- **View Transition estable:** API `<ViewTransition>` publicada como estable por React. El anuncio oficial de React 19.3 la declara estable; la versión exacta se resolverá en el plan y deberá comprobarse contra los paquetes instalados.

## Requisitos funcionales

- **RF-1 — Baseline normativo compatible:** CUANDO una persona prepara el proyecto desde una copia limpia, EL SISTEMA instala de forma determinista el baseline completo aprobado: React estable, compilación, tipado estricto, estilos, estado remoto y de sesión, formularios, rutas, HTTP, validación runtime, generación de contratos, calidad estática y pruebas unitarias, de componentes, red, navegador y accesibilidad.
- **RF-2 — Ejecución local:** CUANDO finaliza la preparación, EL SISTEMA inicia la aplicación y responde en `http://localhost:5173` sin errores de arranque.
- **RF-3 — Flujos del proyecto:** EL SISTEMA ofrece flujos independientes para desarrollo, vista previa, comprobación de tipos, análisis estático, pruebas, pruebas de navegador, generación de contratos y construcción distribuible.
- **RF-4 — Configuración local segura:** CUANDO se necesita configuración local, EL SISTEMA la obtiene de `.env`, mantiene ese archivo sin rastrear y rechaza al iniciar los valores públicos ausentes o inválidos.
- **RF-5 — Plantilla pública:** EL SISTEMA proporciona `.env.example` como plantilla versionable que enumera únicamente la configuración pública necesaria y no contiene credenciales ni secretos reales.
- **RF-6 — Recursos visuales iniciales:** CUANDO inicia la aplicación base, EL SISTEMA puede servir el logo, el isotipo, el favicon, los fondos de login, las ondas, el sprite de iconos y los tokens de marca aprobados sin modificar su contenido fuente.
- **RF-7 — Inicialización del seguimiento:** CUANDO se inicializa el control de versiones en la fase de implementación, EL SISTEMA DE TRABAJO mantiene fuera del seguimiento la configuración local sensible y cada recurso excluido enumerado en esta spec.
- **RF-8 — Resultado de exclusión:** MIENTRAS existan los recursos excluidos, EL SISTEMA DE TRABAJO mantiene cada uno fuera del índice y ninguno aparece en `.gitignore`; el mecanismo local concreto pertenece al plan técnico.
- **RF-9 — Construcción verificable:** CUANDO se solicita una construcción de producción, EL SISTEMA genera un artefacto estático que puede servirse mediante la vista previa; SI una comprobación falla, ENTONCES el proceso termina con estado fallido e identifica la comprobación responsable.
- **RF-10 — Pareado estable sin bypass:** CUANDO se resuelven las dependencias, EL SISTEMA usa `react` y `react-dom` estables, pareados y fijados en una versión que satisface las peer dependencies declaradas, sin `force`, `legacy-peer-deps`, overrides ni aliases hacia canales canary o experimental.
- **RF-11 — View Transition sin APIs experimentales:** CUANDO la release estable seleccionada expone `<ViewTransition>` como API pública estable, EL SISTEMA puede habilitar esa capacidad; SI no la expone de forma estable o compatible, ENTONCES EL SISTEMA la pospone y mantiene la navegación funcional sin importar APIs canary o experimentales.

## Requisitos no funcionales

- **RNF-1 — Tipado:** La base cumple el modo estricto exigido por la constitución y no admite escapes de tipado injustificados.
- **RNF-2 — Seguridad:** Ninguna variable pública, salida de consola o artefacto versionable contiene secretos, tokens, cookies o credenciales.
- **RNF-3 — Reproducibilidad:** Dos preparaciones realizadas desde la misma revisión resuelven las mismas versiones de dependencias.
- **RNF-4 — Calidad:** Las comprobaciones obligatorias de tipos, análisis estático, pruebas y construcción pueden ejecutarse sin intervención manual.
- **RNF-5 — Idioma:** Código e identificadores futuros usarán inglés descriptivo; documentación y textos de interfaz usarán español latino.
- **RNF-6 — Compatibilidad de dependencias:** La instalación estándar de npm resuelve el árbol declarado sin advertencias de peer dependency causadas por React ni mecanismos de bypass.

## Verificación por requisito

| Requisito | Comprobación identificable |
|---|---|
| RF-1 | Preparar una copia limpia, contrastar el baseline completo aprobado y verificar instalación reproducible mediante lockfile. |
| RF-2 | Iniciar desarrollo y comprobar una respuesta sin error en `http://localhost:5173`. |
| RF-3 | Ejecutar individualmente desarrollo, vista previa, tipos, análisis estático, pruebas, E2E, contratos y construcción. |
| RF-4 | Probar `.env` válido, ausente y malformado; comprobar que no está rastreado y que los diagnósticos no revelan secretos. |
| RF-5 | Revisar `.env.example`, confirmar que está versionado y que solo contiene nombres y ejemplos públicos sin credenciales reales. |
| RF-6 | Solicitar cada categoría de asset y comparar que su contenido fuente no fue alterado. |
| RF-7 | Inspeccionar el índice tras inicializar el repositorio y confirmar que configuración local y los seis recursos están ausentes. |
| RF-8 | Comprobar individualmente los seis recursos: ausentes del índice y de `.gitignore`, sin prescribir desde la spec el mecanismo local. |
| RF-9 | Construir, servir el artefacto y provocar una comprobación fallida para verificar salida no exitosa e identificación del fallo. |
| RF-10 | Inspeccionar manifiesto/lockfile y ejecutar instalación npm estándar: React/DOM estables, misma versión, peers satisfechos y ausencia de bypass. |
| RF-11 | Comprobar la documentación oficial y el export real de la release estable; probar navegación con la capacidad estable o, si no existe, sin import experimental. |

## Casos límite y errores

- **Configuración pública ausente:** inicio solicitado sin un valor obligatorio → se detiene con un diagnóstico que no revela datos sensibles.
- **Configuración pública inválida:** origen o URL con formato no aceptado → se rechaza antes de realizar solicitudes.
- **Copia limpia sin configuración local:** la preparación sigue siendo posible usando la plantilla como referencia, pero la ejecución explica qué valor debe configurarse.
- **Recurso excluido seleccionado por accidente:** intento de incorporarlo al seguimiento → permanece excluido por la configuración local autorizada.
- **Dependencia o comprobación fallida:** el flujo termina con estado fallido y no presenta el proyecto como listo.
- **Canary ya instalada durante T2:** se migra a la release estable compatible y se actualiza el lockfile en la planificación posterior; no se conserva simultáneamente ninguna prerelease.
- **Peer dependency incompatible:** npm no puede resolver el árbol estándar → se detiene la instalación; no se habilitan `force`, `legacy-peer-deps` ni overrides.
- **Release estable sin `<ViewTransition>` compatible:** la navegación permanece funcional y la capacidad se pospone; no se sustituye por una API experimental.

## Fuera de alcance

- Implementar autenticación, perfiles o administración de usuarios.
- Definir la arquitectura técnica detallada o la ubicación concreta de módulos.
- Ejecutar la inicialización del repositorio durante la fase de especificación.
- Modificar el backend o su configuración local.
- Elegir en esta spec el número exacto de la release estable o actualizar todavía planes/tareas y specs dependientes.

## Criterios de finalización

- [ ] Una copia limpia puede prepararse, ejecutarse y construirse mediante los flujos definidos.
- [ ] Cada RF tiene una comprobación ejecutada y registrada conforme a la tabla de trazabilidad.
- [ ] Las comprobaciones de tipos, análisis estático y pruebas están disponibles y finalizan correctamente sobre la base inicial.
- [ ] La configuración local permanece sin rastrear y existe una plantilla pública sin secretos.
- [ ] Los recursos excluidos no aparecen en el seguimiento ni en reglas públicas de exclusión.
- [ ] La identidad visual base está disponible para las specs posteriores.
- [ ] React y React DOM están pareados en una release estable compatible y npm resuelve las peer dependencies sin bypass.
- [ ] `<ViewTransition>` se usa únicamente si el paquete estable seleccionado lo publica como API estable; en caso contrario, la navegación verificada no depende de ella.

## Dudas abiertas

Ninguna. La Constitución 0.2.0 y `AGENTS.md` ya establecen React/React DOM estables, pareados y fijados, y limitan View Transitions a la API estable exportada por la release seleccionada.
