# Spec NNN — <Nombre de la funcionalidad>

> Plantilla de especificación para desarrollo guiado por especificaciones (SDD). Describe **qué** debe hacer la funcionalidad y **por qué**; las decisiones de arquitectura, tecnologías y archivos pertenecen a `plan.md`.

**Estado:** borrador | aprobada | implementada  
**Versión:** <número>  
**Fecha:** <AAAA-MM-DD>  
**Proyecto:** <nombre del proyecto>

## Contexto y objetivo

<En un párrafo, describe el problema o necesidad, a quién afecta y el resultado que se busca.>

## Usuarios / actores

- **<Rol o actor>:** <necesidad, objetivo o interacción con la funcionalidad>.

## Historias de usuario

- **HU-1:** Como <rol>, quiero <acción o capacidad> para <beneficio>.
- **HU-2:** Como <rol>, quiero <acción o capacidad> para <beneficio>.

## Definiciones

<Incluye solo términos del dominio que podrían interpretarse de varias maneras. Si no hacen falta, elimina esta sección.>

- **<Término>:** <significado acordado>.

## Requisitos funcionales

Escribe un comportamiento verificable por requisito. Usa la forma EARS que corresponda. Evita requisitos vagos como “rápido”, “fácil” o “intuitivo” si no tienen una medida observable.

- **RF-1 — <Título breve>:** CUANDO <ocurre un evento>, EL SISTEMA <respuesta observable>.
- **RF-2 — <Título breve>:** SI <se presenta una condición o error>, ENTONCES EL SISTEMA <respuesta observable>.
- **RF-3 — <Título breve>:** MIENTRAS <se mantiene un estado>, EL SISTEMA <comportamiento esperado>.
- **RF-4 — <Título breve>:** EL SISTEMA <comportamiento permanente o regla de negocio>.

> Añade o elimina requisitos según el alcance. Cada RF debe tener un identificador estable para poder vincularlo con el plan, las tareas y las pruebas.

## Requisitos no funcionales

Incluye solo atributos relevantes y verificables para esta funcionalidad. Define una medida, condición o estándar cuando sea posible.

- **RNF-1 — <Categoría>:** <criterio verificable de rendimiento, seguridad, accesibilidad, compatibilidad, privacidad, idioma u otro atributo>.

## Casos límite y errores

- **<Caso>:** <entrada o condición inusual> → <comportamiento esperado>.
- **<Caso de error>:** <falla posible> → <respuesta esperada y recuperación, si aplica>.

Considera, según corresponda: entradas vacías o inválidas, duplicados, límites, datos ausentes o corruptos, permisos insuficientes y fallos de servicios dependientes.

## Fuera de alcance

- <Capacidad relacionada que no se implementará en esta iteración>.

## Criterios de finalización

- [ ] Todos los requisitos funcionales tienen una forma de verificación definida.
- [ ] Los criterios de aceptación de los RF se cumplen.
- [ ] <Prueba, demostración o revisión necesaria para cerrar la funcionalidad>.
- [ ] <Criterio adicional del proyecto, si aplica>.

## Dudas abiertas

- [NECESITA ACLARACIÓN] <Pregunta concreta cuya respuesta puede cambiar el comportamiento, el alcance o los criterios de aceptación>.

> Cuando no queden dudas, escribe “Ninguna” o elimina esta entrada. No marques la especificación como aprobada mientras una duda necesaria siga sin resolver.
