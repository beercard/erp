---
name: erp-contexto
description: Mapa del repositorio del ERP (qué área vive en qué esquema, módulo, ruta y doc) y recetas de context-mode para explorarlo gastando poco contexto, con scripts que listan funciones exportadas, tablas y extraen una función puntual. Usala al arrancar cualquier tarea que requiera ubicar código ("¿dónde se calcula X?", "¿qué tabla guarda Y?", "¿qué funciones tiene el módulo Z?"), al investigar un bug, antes de abrir archivos largos (servicio.ts, crm.ts, comprobantes.ts, esquemas) y cada vez que vayas a correr algo con salida larga (pruebas, typecheck, git log, grep amplio).
---

# Explorar el ERP sin llenar el contexto

El repo tiene ~800 archivos, esquemas de 400-900 líneas y snapshots de migración de 20.000 líneas.
Leer de más es la forma más rápida de perder contexto útil. La idea: **preguntar con código, leer con
Read solo lo que vas a editar.**

## 1. Ubicar algo: mapa por área

| Área | Esquema (`src/db/schema/`) | Lógica (`src/modulos/`) | Pantallas (`src/app/(app)/`) | Doc |
|---|---|---|---|---|
| Maestros (clientes, proveedores, artículos, precios) | `maestros.ts` | `maestros/` | `terceros/`, `articulos/` | 02 |
| Ventas sin valor fiscal (presupuesto, pedido, remito, stock) | `comercial.ts` | `comercial/` | `presupuestos/`, `pedidos/`, `remitos/`, `stock/` | 02 |
| Facturación ARCA, cuentas corrientes, cobranzas | `facturacion.ts`, `cobranza.ts` | `facturacion/`, `arca/` | `facturas/`, `cobranzas/`, `cuentas/` | 02, 05 |
| Compras y pagos | `compras.ts` | `compras/` | `compras/`, `ordenes-compra/`, `pagos/`, `cuentas-proveedores/` | 02 |
| Tesorería (cajas, bancos, cheques, cierres) | `tesoreria.ts` | `tesoreria/` | `tesoreria/`, `cobranzas/caja/` | 02 |
| Impuestos (IVA, IIBB, retenciones, presentaciones) | `impuestos.ts`, `iibb.ts` | `impuestos/` | `impuestos/` | 05 |
| Contabilidad | `contabilidad.ts` | `contabilidad/` | `contabilidad/` | 06 |
| Contratos y parque instalado | `contratos.ts` | `contratos/` | `contratos/`, `equipos/` | 02 |
| Servicio técnico (órdenes, agenda, técnico, portal) | `servicio.ts` | `servicio/`, `portal/` | `servicio/`, `tecnico/`, `../portal/` | 04 |
| CRM | `crm.ts` | `crm/` | `crm/` | 12 |
| Tiendas online | `tiendas.ts` | `tiendas/` | `tiendas/`, `../api/tiendas/` | 08 |
| Cobros online (links de pago) | `cobros.ts` | `cobros/` | `cobros-online/`, `../pago/` | 13 |
| WhatsApp e IA | `whatsapp.ts` | `whatsapp/`, `ia/` | `whatsapp/`, `../api/whatsapp/` | 14 |
| Empresa, usuarios, roles, bloqueos | `plataforma.ts`, `bloqueos.ts` | `empresa/` | `configuracion/` | 01, 11 |
| Plataforma SaaS (suscripciones, consola, registro) | `plataforma.ts` | `plataforma/` | `../plataforma/`, `../registro/`, `(sitio)/` | 09 |
| API e integraciones | `integraciones.ts` | `integraciones/` | `../api/v1/`, `configuracion/integraciones/` | — |
| Transversal | `comunes.ts`, `auditoria.ts`, `catalogos.ts` | — | — | 01 |

Transversal en `src/lib/`: `auth/servidor.ts` (sesión, `enLaEmpresa`, `exigirPermiso`), `permisos.ts`, `planes.ts`,
`dinero.ts`, `fechas.ts`, `cuit.ts`, `auditoria.ts`, `frenos.ts`, `pdf.ts`, `xlsx.ts`, `csv.ts`, `zip.ts`, `subdominio.ts`.
Doc = `docs/NN-*.md`. Tarea programada: `src/app/api/cron/servicio/route.ts`. Menú: `src/components/shell/menu.ts`.

## 2. Scripts (salida corta; correlos con `ctx_execute` lenguaje `shell`)

```bash
node .claude/skills/erp-contexto/scripts/mapa.mjs                 # 1 renglón por archivo de src/modulos (≈22 KB)
node .claude/skills/erp-contexto/scripts/mapa.mjs facturacion     # funciones exportadas del área + JSDoc + línea
node .claude/skills/erp-contexto/scripts/tablas.mjs               # tablas por archivo de esquema (* = sin RLS)
node .claude/skills/erp-contexto/scripts/tablas.mjs recibos       # tablas/columnas que contienen "recibos"
node .claude/skills/erp-contexto/scripts/funcion.mjs src/modulos/facturacion/comprobantes.ts emitirComprobante
node .claude/skills/erp-contexto/scripts/funcion.mjs src/lib/dinero.ts   # lista lo exportado
```

`mapa.mjs` sin filtro pesa ~22 KB: pasale `intent` a `ctx_execute` o filtrá por área. Con filtro, el
número `[L123]` te deja hacer `Read` con `offset` exacto cuando sí vas a editar.

## 3. Recetas context-mode para este repo

**Buscar dónde se usa algo** — un solo `ctx_batch_execute` con varios `git grep` y las preguntas juntas:

```json
{ "commands": [
    { "label": "usos de controlarBloqueo", "command": "git grep -n \"controlarBloqueo(\" -- src" },
    { "label": "tabla imputaciones en esquema", "command": "node .claude/skills/erp-contexto/scripts/tablas.mjs imputaciones" } ],
  "queries": ["controlarBloqueo ventas recibos", "imputaciones comprobante_id importe"] }
```

**Leer una función sin abrir el archivo** — `funcion.mjs` (arriba). Para varias a la vez, encadenalas en un
`ctx_batch_execute`.

**Analizar un archivo grande** (contar, buscar patrones, extraer firmas) — `ctx_execute_file` con código que
imprima solo la respuesta. Nunca `Read` para "entender" un archivo de 800 líneas.

**Docs del repo y de Next 16** — indexados por ruta en el knowledge base del proyecto (se refrescan solos si el
archivo cambia). Etiquetas (`source`): `docs/01-arquitectura` … `docs/14-whatsapp-e-ia`, `README`, `deploy/LEEME`,
`next16/upgrading-version-16`, `next16/server-actions`, `next16/forms`, `next16/proxy`. Uso:
`ctx_search({ queries: ["cierre de período IVA presentado"], source: "docs/05" })`. Si una búsqueda no trae nada
(knowledge base purgado o doc nuevo), reindexá: `ctx_index({ path: "docs/05-impuestos-e-informes.md", source: "docs/05-impuestos-e-informes" })`.
Otro tema de Next: `ctx_index({ path: "node_modules/next/dist/docs/<ruta>.md", source: "next16/<tema>" })`.

**Pruebas, typecheck, lint, build** — usá `node .claude/skills/erp-verificar/scripts/verificar.mjs` (ver skill
`erp-verificar`), o `ctx_execute` con `intent: "failing tests"` / `"type errors"`. Nunca por Bash directo: vitest
con PGlite imprime cientos de renglones.

**Historia** — `ctx_execute` con `git log --oneline -30 -- <ruta>` o `git log -S "<texto>" --oneline`;
`git show <hash> --stat` antes que el diff entero.

## 4. Qué no abrir nunca

- `drizzle/meta/*_snapshot.json` (≈22.000 líneas cada uno) y `drizzle/meta/_journal.json` salvo para ver el último tag.
- `package-lock.json`, `.next/`, `node_modules/` (salvo `node_modules/next/dist/docs/` puntual), `.data/` (base PGlite).
- `scripts/persat-relevar.ts` e `importacion/*` salvo que la tarea sea de migración de datos.

## 5. Antes de editar

`Read` del archivo a editar (o del rango con `offset`/`limit`) es correcto y necesario. El resto, por context-mode.
Después de ubicar el área, cargá la skill específica: `erp-esquema-migraciones`, `erp-logica-dominio`,
`erp-pantallas`, `erp-fiscal-arca`, `erp-circuitos`, `erp-integraciones`, `erp-seguridad`, `erp-verificar`,
`erp-mejoras` (auditor y deuda conocida: mirá su `references/linea-base.md` antes de "descubrir" un problema).
