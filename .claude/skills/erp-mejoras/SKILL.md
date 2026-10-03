---
name: erp-mejoras
description: Detectar patrones de mejora en el ERP y mantener al día el contexto que usa Claude — auditor estático de invariantes (RLS, permisos en acciones, fechas UTC, dinero en number, capas invertidas, colores sueltos, archivos largos, helpers duplicados, consultas en bucle, áreas sin pruebas), chequeo de que las skills sigan describiendo el código, criterios de arquitectura para proponer refactors y el protocolo de cierre de cada tarea (qué actualizar en skills, CLAUDE.md, docs y memoria). Usala cuando el usuario pida mejorar, optimizar, refactorizar, auditar o "detectar patrones"; al planificar un cambio grande o de arquitectura; antes de un PR; después de un refactor que mueva o renombre cosas; y al terminar una tarea en la que aprendiste algo no obvio del repo.
---

# Mejora continua (del código y del contexto)

Dos objetivos: que el código mejore con evidencia (no por gusto), y que la próxima sesión arranque sabiendo lo
que aprendió esta. Las herramientas son scripts de solo lectura con salida corta: corrélos con `ctx_execute`.

## 1. Detectar

```bash
node .claude/skills/erp-mejoras/scripts/invariantes.mjs              # resumen por regla (ERROR / AVISO / MEJORA)
node .claude/skills/erp-mejoras/scripts/invariantes.mjs fechas-utc   # todos los casos de una regla
node .claude/skills/erp-mejoras/scripts/invariantes.mjs --cambios    # solo lo cambiado contra origin/main (antes de un PR)
node .claude/skills/erp-mejoras/scripts/skills-al-dia.mjs            # ¿las skills y CLAUDE.md nombran archivos/funciones que existen?
```
Reglas: `db-directo`, `accion-sin-permiso`, `cliente-importa-servidor`, `capas-invertidas` (ERROR: rompen un
invariante); `accion-publica`, `fechas-utc`, `ruta-sin-auth` (AVISO); `dinero-number`, `lib-depende-de-modulos`,
`color-suelto`, `console-log`, `archivo-largo`, `helper-duplicado`, `sin-pruebas`, `consulta-en-bucle` (MEJORA).
Son heurísticas: **leé cada caso antes de actuar** (el script dice cuándo un patrón es seguro). Si encontrás un falso
positivo recurrente, afiná la regla en `invariantes.mjs` en vez de ignorarlo cada vez.

Otras señales útiles (vía `ctx_execute`):
- Hotspots: `git log --format= --name-only -- src | sort | uniq -c | sort -rn | head -15` — lo que más cambia y además
  es largo o sin pruebas es donde un refactor rinde más.
- Mapa de un área antes de proponer nada: `node .claude/skills/erp-contexto/scripts/mapa.mjs <area>`.
- Línea base de hallazgos (para comparar y no redescubrir): [references/linea-base.md](references/linea-base.md).

## 2. Priorizar y proponer
Ordená por **impacto × riesgo / esfuerzo**, en este orden de categorías:
1. **Corrección y seguridad** (datos de otra empresa, permisos, fechas fiscales, dinero mal redondeado). Siempre primero.
2. **Rendimiento con evidencia** (consulta en bucle sobre listas que crecen, cron que recorre todas las empresas).
3. **Mantenibilidad** (archivos > 700 líneas que además son hotspots, helpers duplicados, capas acopladas).
4. **Consistencia de UI/UX** (tokens, textos, estados vacíos).
5. **Experiencia de agentes** (skills, scripts, CLAUDE.md): barata y multiplica todo lo demás.

Cómo proponer: problema concreto (archivo:línea), por qué importa en este dominio, cambio mínimo, cómo se prueba,
riesgo. Una propuesta por tema; no mezclar refactor con cambio de comportamiento en el mismo commit/PR.

## 3. Criterios de arquitectura (para evaluar cualquier cambio)
- **Capas**: `app → modulos → (db, lib)`. `src/modulos` nunca importa de `src/app`; `src/db` nunca de `modulos`.
  `src/lib` importando dominio es acople a evitar (hay 3 casos conocidos en `lib/auth/*`).
- **La base es la frontera de seguridad** (RLS forzado). Ninguna optimización justifica salir de `conEmpresa`.
- **Hechos inmutables + saldos derivados**: preferí agregar movimientos a mutar estados; anular en vez de borrar.
- **Efectos externos fuera de la transacción**, con estado intermedio verificable (patrón de `emitirComprobante`).
- **Cálculo puro separado de la E/S**: lo puro se prueba con unitarias y se reusa en el navegador.
- **Una fuente de verdad por catálogo**: planes en `lib/planes.ts`, permisos en `lib/permisos.ts`, menú en
  `components/shell/menu.ts`, códigos fiscales en la base. No duplicar listas en pantallas.
- **Decisiones nuevas** (cambian una de las anteriores o agregan una): documentarlas como punto nuevo en
  "Decisiones" de `docs/01-arquitectura.md`, con el porqué y lo que se descartó.
- Dividir un archivo largo: por responsabilidad del dominio (ej. `servicio.ts` → órdenes / visitas / cierre), con
  re-exports temporales para no romper importaciones, y en un PR sin cambios de comportamiento.

## 4. Cerrar cada tarea (para que la próxima sesión sepa más)
Al terminar, antes de reportar:
1. **¿Aprendiste algo no obvio del repo?** (una trampa, una regla implícita, un orden de pasos) → sumalo en 1-3 líneas
   a la skill del área o al `CLAUDE.md` de la carpeta. Corto, con el porqué y apuntando al código (no copiarlo).
2. **¿Una skill te guió mal o está vieja?** → corregila en el mismo cambio. `skills-al-dia.mjs` tiene que dar OK.
3. **¿Cambió el comportamiento?** → doc de `docs/` del área (y `docs/01` si es una decisión).
4. **¿El usuario expresó una preferencia o corrigió tu forma de trabajar?** → memoria (`feedback`), no el repo.
5. **¿Repetiste un análisis a mano que se podría automatizar?** → script en la skill que corresponda (salida corta).
6. **¿Encontraste un patrón problemático en otros lugares?** → regla nueva en `invariantes.mjs` + actualizar la línea base.

Mantener las skills livianas: < 200 líneas, sin duplicar entre ellas, con punteros a archivos reales. Una skill que
crece sin control cuesta contexto en cada uso.

## Checklist
- [ ] Hallazgos confirmados leyendo el código (no solo la salida del script)
- [ ] Propuestas priorizadas y separadas por tema; comportamiento y refactor en PRs distintos
- [ ] `invariantes.mjs --cambios` sin ERROR y `skills-al-dia.mjs` OK antes del PR
- [ ] Lo aprendido quedó en la skill/CLAUDE.md/doc/memoria que corresponde; línea base actualizada si cambió
