---
name: erp-equipo
description: Cómo orquestar el equipo de subagentes del ERP (explorador-erp, arquitecto-erp, fiscal-erp, probador-erp, implementador-erp, revisor-erp, optimizador-erp, documentador-erp) — qué hace cada uno, en qué orden encadenarlos para una funcionalidad, un bug, una optimización o un PR, qué se puede correr en paralelo, cómo se pasan los entregables por .claude/trabajo/ y cómo leer su bloque de Entrega. Usala cuando el usuario pida usar subagentes o "el equipo", cuando una tarea sea grande o cruce varias capas, cuando haya varias piezas independientes para hacer en paralelo, o antes de delegar trabajo a un subagente del repo.
---

# El equipo de subagentes

Los subagentes **no se llaman entre sí**: la sesión principal es la que orquesta. Lo que los hace trabajar en equipo
es (1) roles que no se pisan, (2) entregables en archivos compartidos y (3) un bloque **Entrega** al final de cada
respuesta que dice a quién le sirve y qué sigue. Delegar cuesta (cada agente arranca sin contexto): hacelo cuando el
trabajo es grande, paralelizable o se beneficia de una mirada independiente, no para tareas de un par de pasos.

## Roles
| Agente | Hace | Escribe | Modelo |
|---|---|---|---|
| `explorador-erp` | Ubica código: rutas, líneas, flujo de llamadas | solo `.claude/trabajo/` | haiku (rápido) |
| `arquitecto-erp` | Diseña: datos, dominio, pantallas, permisos, pruebas, plan por pasos | `plan.md` | heredado |
| `fiscal-erp` | Valida impuestos, comprobantes, saldos, asientos; da valores esperados | `fiscal.md` | heredado |
| `probador-erp` | Escribe pruebas; reproduce bugs con una prueba roja | solo `*.test.ts` | heredado |
| `implementador-erp` | Construye una pieza del plan y la verifica | código | heredado |
| `revisor-erp` | Revisa el diff contra invariantes, seguridad y plan | `revision.md` | heredado |
| `optimizador-erp` | Detecta mejoras con evidencia; backlog priorizado | `mejoras.md` | heredado |
| `documentador-erp` | Actualiza docs, skills, CLAUDE.md y línea base | solo documentación | heredado |

## Carpeta de trabajo
`.claude/trabajo/<tema>/` (ignorada por git). Elegí un `<tema>` corto en kebab-case (ej. `vales-caja`) y pasalo en
cada pedido. Ahí quedan `mapa.md`, `plan.md`, `fiscal.md`, `revision.md`, `mejoras.md`: el siguiente agente los lee
directo, sin que tengas que copiar el contenido en el prompt (ahorra contexto y evita perder detalle).

## Flujos
**Funcionalidad que cruza capas**
1. `explorador-erp` (mapa) → 2. `arquitecto-erp` (plan con piezas) → 3. `fiscal-erp` si el plan marca puntos fiscales
→ 4. `probador-erp` (casos primero, con los valores de fiscal) → 5. `implementador-erp` por pieza (en paralelo si son
independientes, cada uno con `isolation: "worktree"`) → 6. `revisor-erp` → 7. correcciones (implementador) →
8. `documentador-erp` → 9. sesión principal: `verificar.mjs todo`, commit y PR si el usuario lo pidió.

**Bug**
`explorador-erp` (dónde) → `probador-erp` (prueba roja que lo reproduce) → `implementador-erp` (arreglo hasta verde)
→ `revisor-erp` si toca seguridad/dinero → `documentador-erp` si cambió una regla.

**Optimización / refactor**
`optimizador-erp` (backlog con evidencia) → el usuario elige → `arquitecto-erp` para los ítems M/L →
`probador-erp` (red de seguridad antes de tocar) → `implementador-erp` (refactor sin cambiar comportamiento) →
`revisor-erp` → `documentador-erp` (actualiza la línea base).

**Revisión de un PR o rama**
`revisor-erp` y, en paralelo, `fiscal-erp` si el diff toca `facturacion/`, `impuestos/`, `compras/`, `contabilidad/`
o `tesoreria/`; después unificá los informes para el usuario.

## Paralelo vs secuencial
- **En paralelo** (varias llamadas Agent en el mismo mensaje): exploraciones de áreas distintas; implementación de piezas
  sin archivos en común (cada una en su worktree); revisor + fiscal sobre el mismo diff.
- **Secuencial**: lo que consume el entregable de otro (plan → implementación → revisión); dos piezas que tocan el mismo
  archivo (esquema, `menu.ts`, `permisos.ts`, `proxy.ts`): o las hace un solo implementador, o una después de la otra.
- Migraciones: una sola pieza por vez crea migraciones (los números `NNNN` chocan si dos worktrees generan a la vez).

## Cómo pedirle algo a un subagente
Prompt corto y autosuficiente: objetivo, `<tema>`, qué archivos de `.claude/trabajo/<tema>/` leer, alcance (qué NO
tocar), y qué esperás de vuelta. Ejemplo:

> Tema `vales-caja`. Implementá la pieza 2 de `.claude/trabajo/vales-caja/plan.md` (dominio + pruebas de `rendirVale`).
> No toques pantallas ni migraciones (las hace la pieza 1). Devolvé la entrega estándar con el resultado de
> `verificar.mjs pruebas src/modulos/tesoreria`.

## Leer las entregas
Cada agente termina con `## Entrega` (estado + insumo para quién). Seguí esa indicación salvo que el usuario diga otra
cosa. Si el estado es "necesita decisión", preguntale al usuario antes de seguir. No le pases a un agente lo que otro
no pudo verificar como si estuviera verificado: reportá al usuario los resultados reales.
