# Plan de implementación — Spec NNN: <Nombre de la funcionalidad>

> Plantilla técnica para implementar una especificación aprobada. Lee `spec.md` y las reglas del proyecto (por ejemplo, `AGENTS.md` y `docs/constitution.md`) antes de completar este plan. No agregues comportamiento que no esté definido en la spec; si falta una decisión funcional, regístrala allí para aclararla.

**Estado de la spec:** <aprobada / otro>  
**Fecha:** <AAAA-MM-DD>  
**Referencias:** `spec.md`, <reglas o documentos del proyecto>

## Resumen técnico

<Describe brevemente cómo se organizará la implementación para satisfacer la spec. Mantén el alcance alineado con ella.>

## Archivos por crear o modificar

| Archivo o directorio | Acción | Responsabilidad y cambio | RF/RNF cubiertos |
|---|---|---|---|
| `<ruta>` | Crear / modificar | <Responsabilidad concreta> | <RF-1, RNF-1> |

## Componentes y responsabilidades

<Explica los componentes o módulos implicados y los límites entre ellos. Mantén lógica de negocio, persistencia e interfaz separados cuando corresponda y de acuerdo con las convenciones del proyecto.>

| Componente | Responsabilidad | Entradas / salidas | RF/RNF cubiertos |
|---|---|---|---|
| `<componente>` | <Responsabilidad> | <Entradas → salidas> | <RF-x> |

## Funciones y lógica de dominio

Describe las operaciones importantes con entradas, resultado y requisitos relacionados. Prefiere funciones pequeñas y comprobables. Si la lógica depende de la fecha actual, pasa “hoy” como parámetro explícito cuando sea compatible con el diseño del proyecto.

| Función u operación | Entradas | Resultado / efecto | RF cubiertos |
|---|---|---|---|
| `<nombre>` | `<parámetros>` | `<resultado esperado>` | <RF-x> |

## Flujo o algoritmo

<Incluye pseudocódigo solo cuando ayude a explicar la lógica. Cubre el flujo normal y los casos límite de `spec.md` y enlaza cada paso con los RF pertinentes.>

```text
INICIO
  recibir <entrada>
  validar <condiciones>
  SI <condición de error>
    devolver o mostrar <respuesta definida en la spec>
  SI NO
    ejecutar <regla de negocio>
    devolver o mostrar <resultado definido en la spec>
FIN
```

## Interfaz y experiencia de uso

<Indica cómo se presenta la funcionalidad: estados visibles, acciones del usuario, mensajes, accesibilidad y adaptación a dispositivos, si aplica. No inventes textos ni estados que cambien el comportamiento especificado.>

| Estado o interacción | Presentación / respuesta | RF/RNF cubiertos |
|---|---|---|
| <Estado normal, vacío, carga o error> | <Qué ve o puede hacer el usuario> | <RF-x, RNF-x> |

## Decisiones técnicas

Registra solo decisiones necesarias para esta implementación y justifica la elegida frente a una alternativa razonable.

| Decisión | Elección y motivo | Alternativa considerada y motivo para descartarla | RF/RNF relacionados |
|---|---|---|---|
| <Tema> | <Elección y justificación> | <Alternativa y razón> | <RF-x> |

## Datos, validación y errores

- **Datos que se leen o escriben:** <modelo, origen, destino y reglas relevantes>.
- **Validaciones:** <validaciones de entrada y reglas de negocio>.
- **Errores y recuperación:** <cómo se gestionan los errores descritos en la spec>.
- **Compatibilidad y migración:** <solo si se modifican datos o contratos existentes>.

## Estrategia de pruebas y verificación

Adapta los comandos y herramientas al proyecto. Cada requisito debe quedar vinculado a una prueba o a una verificación manual concreta. El material del curso usa `node --test` como ejemplo para un proyecto JavaScript sin dependencias adicionales; no lo asumas si el proyecto utiliza otro stack.

| Prueba o verificación | Tipo | Requisito(s) | Resultado esperado |
|---|---|---|---|
| <caso concreto> | Unitaria / integración / interfaz / manual | <RF-x, RNF-x> | <resultado verificable> |

- **Comando(s):** `<comando de pruebas del proyecto>`.
- **Verificación manual:** <flujo, entorno o dispositivo que se revisará, si aplica>.
- **Puerta de calidad:** <condiciones que deben cumplirse antes de considerar terminada la implementación>.

## Trazabilidad de requisitos

| Requisito | Diseño o componente | Prueba / verificación |
|---|---|---|
| RF-1 | <archivo o componente> | <prueba o comprobación> |
| RNF-1 | <archivo o componente> | <prueba o comprobación> |

## Secuencia de implementación

<Resume el orden técnico sugerido. Si el proyecto usa `tasks.md`, descompón este plan en tareas pequeñas, ordenadas por dependencias, con una comprobación verificable para cada una.>

1. <Preparar o validar la base necesaria>.
2. <Implementar y comprobar la lógica>.
3. <Integrar la interfaz o los servicios implicados>.
4. <Ejecutar la verificación completa y revisar la trazabilidad>.

## Riesgos y dependencias

- **Dependencia:** <servicio, dato, permiso o equipo necesario; elimina la sección si no hay>.
- **Riesgo:** <posible problema y forma de detectarlo o reducirlo>.

## Pendientes de aclaración

- [NECESITA ACLARACIÓN] <Decisión bloqueante que también debe reflejarse en `spec.md`>.

> Antes de implementar, confirma que la spec está aprobada, no tiene dudas bloqueantes y que el plan cubre todos sus RF y RNF. El documento fuente recomienda mantener también un archivo `tasks.md` para dividir el trabajo, implementar una tarea a la vez y validar requisito por requisito.
