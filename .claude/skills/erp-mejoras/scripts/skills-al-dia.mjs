#!/usr/bin/env node
/**
 * ¿Las skills y los CLAUDE.md siguen describiendo el código real? Busca en
 * ellos rutas de archivos y nombres de funciones entre `comillas invertidas`
 * y avisa los que ya no existen en el repo (se renombraron, se movieron o se
 * borraron). Correlo después de un refactor y antes de cada PR grande.
 *
 *   node .claude/skills/erp-mejoras/scripts/skills-al-dia.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const rel = (p) => relative(raiz, p).replace(/\\/g, '/')

function archivos(dir, filtro, salida = []) {
  if (!existsSync(dir)) return salida
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'meta', '.data', 'test-results', 'playwright-report'].includes(e.name)) archivos(p, filtro, salida)
    } else if (filtro(e.name, p)) salida.push(p)
  }
  return salida
}

// Documentos para agentes: skills (y sus referencias) y los CLAUDE.md del repo.
const docs = [
  ...archivos(join(raiz, '.claude', 'skills'), (n) => n.endsWith('.md')),
  ...archivos(join(raiz, '.claude', 'agents'), (n) => n.endsWith('.md')),
  ...archivos(raiz, (n, p) => n === 'CLAUDE.md' && !rel(p).startsWith('node_modules')),
].filter((p, i, a) => a.indexOf(p) === i)

// Todo el código (src, scripts, configs de la raíz y scripts de las skills), en un solo texto.
const configs = readdirSync(raiz)
  .filter((n) => /\.config\.(ts|mjs)$/.test(n))
  .map((n) => join(raiz, n))
const fuentes = archivos(join(raiz, 'src'), (n) => /\.(ts|tsx|css)$/.test(n))
  .concat(archivos(join(raiz, 'scripts'), (n) => /\.(ts|mjs)$/.test(n)))
  .concat(archivos(join(raiz, '.claude'), (n) => n.endsWith('.mjs')))
  .concat(configs)
const codigo = fuentes.map((p) => readFileSync(p, 'utf8')).join('\n')
// Rutas relativas de todo el repo versionable, para resolver rutas cortas ("cuentas.ts", "_lib/api.ts").
const todas = archivos(raiz, () => true).map(rel)
const existeSufijo = (r) => todas.some((p) => p === r || p.endsWith(`/${r}`))
// APIs de librerías que las skills nombran a propósito (no son identificadores del repo).
const EXTERNOS = new Set(['doublePrecision', 'revalidateTag', 'updateTag', 'catchError', 'useFormStatus', 'useOptimistic', 'cacheLife', 'cacheTag'])

/** Lugares donde puede vivir una ruta corta escrita en una skill. */
const BASES = ['', 'src/', 'src/modulos/', 'src/lib/', 'src/db/', 'src/db/schema/', 'src/app/', 'src/app/(app)/', 'drizzle/', 'docs/', '.claude/skills/']
// Mencionados a propósito como inexistentes, como ejemplo o como entregables de .claude/trabajo/ (ignorada por git).
const IGNORAR = new Set([
  'loading.tsx',
  'error.tsx',
  'middleware.ts',
  'vales.ts',
  'tablas.ts',
  'plan.md',
  'fiscal.md',
  'revision.md',
  'mejoras.md',
  'mapa.md',
])

let problemas = 0
for (const doc of docs) {
  const t = readFileSync(doc, 'utf8')
  const dirDoc = dirname(doc)
  const faltan = new Set()
  for (const [, token] of t.matchAll(/`([^`\n]+)`/g)) {
    const limpio = token.replace(/#\w+$/, '').replace(/\(.*$/, '').trim()
    // Rutas de archivo.
    if (/^[\w@.()[\]\-/]+\.(ts|tsx|mjs|sql|md|json|sh|yml)$/.test(limpio) && !limpio.includes('<') && !IGNORAR.has(limpio)) {
      if (/NNNN|\*|\.\.\.|\.claude\/trabajo\//.test(limpio)) continue
      const existe = existsSync(join(dirDoc, limpio)) || BASES.some((b) => existsSync(join(raiz, b + limpio)))
      // Ruta corta (p. ej. "cuentas.ts" dicho dentro de la sección de un área): buscala como sufijo.
      if (!existe && !existeSufijo(limpio)) faltan.add(limpio)
      continue
    }
    // Identificadores camelCase que parecen funciones/constantes del código (enLaEmpresa, controlarBloqueo…).
    if (/^[a-z][a-z0-9]+[A-Z][A-Za-z0-9]+$/.test(limpio) && limpio.length > 5 && !EXTERNOS.has(limpio)) {
      if (!new RegExp(`\\b${limpio}\\b`).test(codigo)) faltan.add(limpio)
    }
  }
  if (faltan.size) {
    problemas += faltan.size
    console.log(`${rel(doc)}: ${[...faltan].join(', ')}`)
  }
}
console.log(problemas ? `\n${problemas} referencias que no encontré en el código: actualizá esas skills o confirmá que son ejemplos.` : `Skills al día: ${docs.length} documentos revisados, todas las referencias existen.`)
// exitCode y no exit(): con salida por pipe, exit() puede cortar lo impreso.
process.exitCode = problemas ? 1 : 0
