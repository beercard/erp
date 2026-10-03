---
name: erp-verificar
description: Cómo verificar un cambio en el ERP antes de darlo por terminado — typecheck (con next typegen), lint, pruebas Vitest enfocadas y completas, build, recorridos Playwright, formato, y probar en el navegador — corriéndolos con un script que resume la salida para no gastar contexto; más la convención de commits, PRs y documentación del repo. Usala al terminar cualquier implementación, antes de commitear o abrir un PR, cuando fallen pruebas, tipos o el CI, o cuando el usuario diga "probá", "verificá", "corré los tests", "¿pasa el CI?".
---

# Verificar antes de terminar

## El script (salida corta, código de salida real)

```bash
node .claude/skills/erp-verificar/scripts/verificar.mjs                          # tipos + lint + pruebas (todo)
node .claude/skills/erp-verificar/scripts/verificar.mjs pruebas src/modulos/maestros
node .claude/skills/erp-verificar/scripts/verificar.mjs pruebas src/db/seguridad.test.ts src/modulos/x/y.test.ts
node .claude/skills/erp-verificar/scripts/verificar.mjs tipos lint
node .claude/skills/erp-verificar/scripts/verificar.mjs todo                     # + build, formato, auditor y skills al día
node .claude/skills/erp-verificar/scripts/verificar.mjs invariantes skills       # solo auditoría (rápido, < 1 s)
```
`invariantes` corre el auditor de `erp-mejoras` sobre lo cambiado contra `origin/main` (falla si hay casos ERROR:
datos fuera de `conEmpresa`, acciones sin permiso, cliente importando servidor, capas invertidas). `skills` verifica
que las skills y los `CLAUDE.md` sigan nombrando archivos y funciones que existen.
Imprime por paso `OK/FALLA`, segundos y solo los errores (`error TS…`, renglones de eslint, el final de vitest con las
fallas, el resumen de pruebas). Corrélo con `ctx_execute` (lenguaje `shell`, `timeout` 600000 para `todo`) o con Bash:
la salida ya viene acotada. Tiempos de referencia en una PC común: tipos ~35 s, lint ~75 s, un archivo de pruebas ~5-10 s,
la suite entera varios minutos (PGlite levanta un Postgres por archivo).

## Orden recomendado
1. **Pruebas del área tocada** primero (rápido, feedback directo): `pruebas src/modulos/<area>`.
2. Si tocaste esquema/migraciones: `pruebas src/db/seguridad.test.ts` + `npm run db:migrar` sobre la base local.
3. **tipos** — `npm run typecheck` = `next typegen && tsc --noEmit`. `typegen` genera `PageProps`/`RouteContext` de
   las rutas: una ruta nueva sin typegen da "Cannot find name 'PageProps'" o rutas que no matchean.
4. **lint** — ESLint 9 flat config de Next (`eslint.config.mjs`); el CI lo exige.
5. Antes de un PR: `todo` (lo del CI — typecheck → lint → test → build — más formato y auditoría) y, si el cambio es
   grande o sensible, pedirle la revisión al subagente `revisor-erp`.
6. Si tocaste recorridos clave (facturar, cobrar, cerrar caja) o UI crítica: `npx playwright test` (levanta su propio
   servidor con base nueva en `.data/e2e` y `ARCA_SIMULADO=1`, ver `scripts/e2e-servidor.sh`; puerto 3200). Necesita
   bash y `npx playwright install chromium` la primera vez.
7. Cambios visuales: probalo en el navegador (skill `run`; `.claude/launch.json` levanta `next dev` en el puerto 3100;
   credenciales de la semilla en `.data/credenciales-dev.txt` tras `npm run db:semilla`).

## Fallas típicas y qué significan
| Síntoma | Causa probable |
|---|---|
| `seguridad.test.ts`: `expected [ 'tabla_nueva' ] to deeply equal []` | Falta `SELECT erp_aislar_por_empresa('tabla_nueva')` en la migración de seguridad. |
| `new row violates row-level security policy` en una prueba | Insert con `empresaId` de otra empresa o sin `conEmpresa`. |
| `null value in column "empresa_id"` | Escritura fuera de `conEmpresa` (no hay `app.empresa_id` fijado). |
| `permission denied for table …` | La app (`erp_app`) no tiene ese privilegio: catálogo global o columna sin GRANT (ej. `usuarios`). |
| Monto `1320.5` vs `'1320.55'` | Se usó `number` en vez de `D`/`aImporte`; comparar strings con 2 decimales. |
| Prueba que falla después de las 21 h | Fecha calculada en UTC: usar `hoyArgentina()` o pasar `hoy` fijo. |
| Workers de vitest que mueren en Windows | Memoria de PGlite: no subas `maxWorkers` (4). |
| `Cannot find name 'PageProps'` | Falta `next typegen` (usá `npm run typecheck`, no `tsc` a secas). |
| `No test files found` | Filtro mal escrito: las pruebas viven en `src/**/*.test.ts`. |
| Engine warning de Node | El repo pide Node ≥ 24 (`engines`); con 22 casi todo anda, pero el CI usa 24. |

No "arregles" una prueba cambiando lo esperado sin entender por qué cambió: en cálculos fiscales, el valor esperado
suele estar validado contra ARCA o PYMEXIS.

## Formato
Prettier: sin `;`, comillas simples, 130 columnas, trailing commas (`.prettierrc`). `npm run formato` escribe sobre
`src scripts docs`; el script lo **controla** con `verificar.mjs formato` sin tocar archivos.

## Documentación
Si cambió un comportamiento visible o una decisión: actualizá el doc del área en `docs/` (lista en `README.md`) en el
mismo cambio. Tabla nueva → `docs/02-modelo-de-datos.md`. Variable de entorno nueva → `.env.example`, `README.md`
(tabla de variables) y `deploy/env.ejemplo`.

## Commits y PRs
- Commits solo cuando el usuario lo pide. Asunto en español, descriptivo, sin punto final, contando qué cambia para
  el usuario ("Cobranza automática y tiendas que facturan solas"); a veces con prefijo `feat(area):` / `fix(area):`.
- Una migración nueva por cambio de esquema; si al mergear `main` chocan números, renumerá la tuya (ver `83b1974`).
- PR contra `main` con: qué cambia, por qué, migraciones incluidas, cómo se probó (salida resumida de `verificar.mjs todo`).
- `AGENTS.md` trae un bloque que reescribe `next dev`: commitealo tal cual si aparece modificado.

## Checklist final
- [ ] Pruebas del área + `seguridad.test.ts` si hubo esquema
- [ ] `verificar.mjs tipos lint` limpio (o `todo` antes de PR, con `invariantes` sin ERROR y `skills` OK)
- [ ] Probado en navegador si hay UI
- [ ] Docs/variables actualizadas
- [ ] Reportar al usuario qué se corrió y el resultado real (si algo falló o no se pudo correr, decirlo)
