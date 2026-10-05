# Plan de implementación — Spec 002: Fundamentos visuales, responsive y accesibles

**Estado de la spec:** aprobada  
**Fecha:** 2026-10-05  
**Referencias:** `spec.md`, Spec 001, guía de diseño, tokens y mockups Aliar

## Resumen técnico

Construir una capa UI compartida sobre Tailwind v4 y los tokens Aliar. Los componentes serán semánticos, compuestos y sin lógica de dominio. CSS gestionará responsive, foco, contraste, `prefers-reduced-motion` y View Transitions proporcionadas únicamente por la API estable exportada por la release fijada de React.

## Archivos previstos

| Ruta | Responsabilidad | RF/RNF |
|---|---|---|
| `src/styles/app.css` | `@theme`, reset, tipografía, breakpoints, foco y movimiento reducido | RF-1, RF-3, RF-9 |
| `src/shared/ui/icon.tsx` | Sprite `<use>`, decorativo o acción con nombre accesible | RF-8 |
| `src/shared/ui/button.tsx`, `form-field.tsx` | Variantes explícitas, labels, errores, pendiente | RF-4, RF-5 |
| `src/shared/ui/card.tsx`, `badge.tsx`, `alert.tsx` | Superficies y semántica de rol/estado | RF-1, RF-2 |
| `src/shared/ui/modal.tsx` | Diálogo compuesto, trap/restauración de foco | RF-7 |
| `src/shared/ui/async-state.tsx`, `skeleton.tsx` | Carga, vacío, error, unavailable y retry | RF-5, RF-6 |
| `src/shared/ui/toast-provider.tsx` | Feedback temporal con `aria-live` | RF-5 |
| `src/shared/utils/presentation.ts` | Iniciales y valores anulables | RF-2, RF-6 |
| `src/shared/ui/*.test.tsx`, `src/styles/app.test.ts` | Comportamiento, axe y tokens | RF-1–RF-9 |

## Arquitectura e interfaces

- `Button` usa subtipos `Primary`, `Secondary`, `Destructive`, `Icon`; no una colección de booleanos.
- `Modal.Root/Trigger/Content/Actions` concentra foco sin acoplarse a eliminación/logout.
- `AsyncState` expone variantes `Loading`, `Empty`, `Error`, `Unavailable` con slot de acción.
- `Icon` solo admite IDs existentes del sprite; los iconos decorativos son `aria-hidden`.

## Funciones puras

| Función | Entrada | Salida | RF |
|---|---|---|---|
| `getInitials` | nombre, apellido | 1–2 letras seguras | RF-2 |
| `formatNullable` | `string | null` | texto o “No informado” | RF-6 |
| `rolePresentation` | rol | etiqueta/variante semántica | RF-1 |
| `statusPresentation` | booleano | Activo/Inactivo + variante | RF-1, RF-4 |

No hay reglas dependientes de fecha; no se usa `hoy`.

## Flujo técnico

```text
tokens fuente → @theme semántico → primitivas UI
interacción → estado pendiente/error → aria-live
modal abre → mueve/encierra foco → cancelar/cerrar → restaura foco
viewport cambia → CSS reorganiza sin desmontar capacidades
```

## Decisiones técnicas

| Elección | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| Componentes propios pequeños | mockup específico, sin dependencia nueva | kit UI externo | RF-1–RF-8 |
| CSS responsive, no JS | evita divergencias y re-render | medir viewport en hooks | RF-3 |
| Modal nativo semántico controlado | foco y teclado verificables | `div` con ARIA manual | RF-7 |
| Tokens vía `@theme` | fuente única Aliar | hex crudos | RF-1 |
| Animación opt-in | La API estable de React no desactiva ViewTransition por sí misma; CSS cubre reduced motion | API experimental o transiciones globales | RF-9 |

## Pruebas y verificación

- `npm run test`: Testing Library + user-event + axe para teclado, foco, labels, live regions, variantes y modal.
- CSS/tokens: prueba estática sin hex en componentes y media query de reduced motion.
- Manual Chrome DevTools: 360/768/1440 px, zoom 200 %, touch targets y comparación de mockups.
- Puerta: `npm run typecheck && npm run lint && npm run test && npm run build`.

## Trazabilidad

| RF | Diseño | Prueba |
|---|---|---|
| RF-1, RF-2 | estilos, Card/Badge/presentation | visual + unitarias |
| RF-3 | CSS responsive | viewport/zoom |
| RF-4 | Button/FormField/Icon | teclado + axe |
| RF-5 | Button/Toast/Alert | pendiente/doble activación |
| RF-6 | AsyncState/Skeleton | variantes y retry |
| RF-7 | Modal | foco completo |
| RF-8 | Icon | whitelist + nombre |
| RF-9 | reduced-motion CSS | media query/manual |

## Secuencia, dependencias y riesgos

Depende de Spec 001. Orden: tokens → utilidades → controles → estados → modal/toast → verificación responsive. Riesgo principal: intentar copiar literalmente filtros/estado de mockups que contradicen specs; las primitivas no incorporarán dominio.

## Pendientes de aclaración

Ninguno.
