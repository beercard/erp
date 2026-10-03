#!/usr/bin/env node
/**
 * Tablas de la base (src/db/schema) sin abrir los esquemas, que son largos
 * (servicio.ts pasa las 800 líneas).
 *
 *   node .claude/skills/erp-contexto/scripts/tablas.mjs              → archivo: tablas
 *   node .claude/skills/erp-contexto/scripts/tablas.mjs recibos      → tablas cuyo nombre o columnas contienen "recibos", con columnas
 *
 * [E] = usa empresaId() (RLS forzado por empresa). Sin [E] = global o de plataforma.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const dir = join(raiz, 'src', 'db', 'schema')
const filtro = (process.argv[2] ?? '').toLowerCase()
/** Constructores de columna (drizzle-orm/pg-core y los de comunes.ts). */
const COLUMNA =
  /\b(text|uuid|timestamp|importe|boolean|date|integer|smallint|jsonb|numeric|precio|cantidad|cotizacion|bigint|bigserial|serial|inet|bytea|varchar|char|real|doublePrecision|time|interval)\(\s*'([a-z0-9_]+)'/g

/** Columnas de un trozo de esquema: las explícitas y las que agregan los helpers de comunes.ts. */
function columnasDe(trozo, helpers) {
  const cols = []
  if (/\bid\(\)/.test(trozo)) cols.push('id')
  let empresa = /empresaId\(\)/.test(trozo)
  if (empresa) cols.push('empresa_id')
  // Helpers locales del archivo, como `...cabeceraComercial()`.
  for (const [, nombre] of trozo.matchAll(/\.\.\.(\w+)\(\)/g)) {
    const h = helpers.get(nombre)
    if (h) {
      cols.push(...h.cols)
      empresa ||= h.empresa
    }
  }
  cols.push(...[...trozo.matchAll(COLUMNA)].map(([, , col]) => col))
  if (/marcasDeTiempo\(\)/.test(trozo)) cols.push('creado', 'actualizado')
  return { cols: [...new Set(cols)], empresa }
}

try {
  for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts').sort()) {
    const texto = readFileSync(join(dir, archivo), 'utf8')
    const trozos = texto.split(/\n(?=(?:export )?const )/)
    const helpers = new Map()
    for (const t of trozos) {
      const h = t.match(/^const (\w+) = \(\) => \(\{/)
      if (h) helpers.set(h[1], columnasDe(t, helpers))
    }
    // Cada tabla va de su pgTable al siguiente "const".
    const tablas = trozos
      .filter((b) => /^export const \w+ = pgTable\(/.test(b))
      .map((b) => {
        const nombre = b.match(/pgTable\(\s*'([^']+)'/)?.[1] ?? '?'
        const variable = b.match(/^export const (\w+)/)?.[1] ?? '?'
        // Solo el primer argumento (las columnas), no los índices ni las FK.
        const cuerpo = b.split(/\n\s*\(t\)\s*=>/)[0]
        const { cols, empresa } = columnasDe(cuerpo, helpers)
        return { nombre, variable, columnas: cols, empresa }
      })
    if (!filtro) {
      console.log(`${archivo}: ${tablas.map((t) => `${t.nombre}${t.empresa ? '' : '*'}`).join(', ')}`)
      continue
    }
    for (const t of tablas) {
      if (!(t.nombre.includes(filtro) || t.variable.toLowerCase().includes(filtro) || t.columnas.some((c) => c.includes(filtro)))) continue
      console.log(`${archivo} › ${t.nombre} (${t.variable})${t.empresa ? ' [E]' : ''}: ${t.columnas.join(', ')}`)
    }
  }
  if (!filtro)
    console.log(
      '\n* = sin empresaId() → sin RLS: catálogo global o tabla de plataforma. Si igual tiene una columna empresa_id ' +
        '(roles, membresias, claves_cobro…), cada consulta filtra por empresa a mano (ver PLATAFORMA en src/db/seguridad.test.ts).',
    )
} catch (e) {
  console.error(`tablas.mjs: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
