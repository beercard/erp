#!/usr/bin/env node
/**
 * Mapa de la lógica de negocio (src/modulos) sin abrir archivos.
 *
 *   node .claude/skills/erp-contexto/scripts/mapa.mjs            → un renglón por archivo: líneas y para qué sirve
 *   node .claude/skills/erp-contexto/scripts/mapa.mjs facturacion → funciones exportadas del área, con su JSDoc
 *   node .claude/skills/erp-contexto/scripts/mapa.mjs cuentas     → idem, filtrando por parte de la ruta
 *
 * Pensado para correrse con ctx_execute (context-mode): la salida es corta.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const base = join(raiz, 'src', 'modulos')
const filtro = (process.argv[2] ?? '').toLowerCase()

function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return archivos(p)
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : []
  })
}

const limpiar = (bloque, largo) =>
  bloque
    .replace(/^\/\*\*|\*\/$/g, '')
    .replace(/\n\s*\*\s?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, largo)

/** JSDoc pegado arriba del renglón i (o ''). */
function docArriba(lineas, i) {
  let j = i - 1
  if (j < 0 || !/\*\/\s*$/.test(lineas[j])) return ''
  while (j >= 0 && !/\/\*\*/.test(lineas[j])) j--
  return limpiar(lineas.slice(j, i).join('\n'), 140)
}

try {
  const todos = archivos(base).sort()
  const elegidos = filtro ? todos.filter((p) => relative(base, p).replace(/\\/g, '/').toLowerCase().includes(filtro)) : todos
  if (!elegidos.length) {
    console.log(`Nada en src/modulos coincide con "${filtro}". Áreas: ${[...new Set(todos.map((p) => relative(base, p).split(/[\\/]/)[0]))].join(', ')}`)
    process.exit(0)
  }
  for (const p of elegidos) {
    const texto = readFileSync(p, 'utf8')
    const lineas = texto.split('\n')
    const ruta = relative(base, p).replace(/\\/g, '/')
    const cabecera = texto.match(/\/\*\*[\s\S]*?\*\//)
    if (!filtro) {
      console.log(`${ruta} (${lineas.length}) ${cabecera ? limpiar(cabecera[0], 150) : ''}`)
      continue
    }
    console.log(`\n## src/modulos/${ruta} (${lineas.length} líneas)`)
    if (cabecera) console.log(limpiar(cabecera[0], 300))
    lineas.forEach((l, i) => {
      const m =
        l.match(/^export (?:async )?function (\w+)\s*(?:<[^>]*>)?\(([^)]*)\)?/) ??
        l.match(/^export const (\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)?/) ??
        l.match(/^export (?:class|type|const) (\w+)()/)
      if (!m) return
      const doc = docArriba(lineas, i)
      const firma = m[2] ? `(${m[2].replace(/\s+/g, ' ').slice(0, 90)})` : ''
      console.log(`- ${m[1]}${firma}${doc ? ` — ${doc}` : ''}  [L${i + 1}]`)
    })
  }
} catch (e) {
  console.error(`mapa.mjs: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
