#!/usr/bin/env node
/**
 * Muestra una sola función (o constante, clase o tipo) exportada de un
 * archivo, con su JSDoc, sin traer el archivo entero al contexto.
 *
 *   node .claude/skills/erp-contexto/scripts/funcion.mjs src/modulos/facturacion/comprobantes.ts emitirComprobante
 *   node .claude/skills/erp-contexto/scripts/funcion.mjs src/modulos/facturacion/comprobantes.ts   → lista lo exportado
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const [archivo, nombre] = process.argv.slice(2)

if (!archivo) {
  console.log('Uso: funcion.mjs <archivo> [nombre]')
  process.exit(0)
}

try {
  const lineas = readFileSync(isAbsolute(archivo) ? archivo : resolve(raiz, archivo), 'utf8').split('\n')
  const exportados = lineas
    .map((l, i) => [l.match(/^export (?:default )?(?:async )?(?:function|const|class|type|interface) (\w+)/)?.[1], i])
    .filter(([n]) => n)
  if (!nombre) {
    console.log(exportados.map(([n, i]) => `${n} [L${i + 1}]`).join('\n'))
    process.exit(0)
  }
  const encontrado = exportados.find(([n]) => n === nombre)
  if (!encontrado) {
    console.log(`No hay un export "${nombre}". Exporta: ${exportados.map(([n]) => n).join(', ')}`)
    process.exit(0)
  }
  const i = encontrado[1]
  // Sube por el JSDoc pegado.
  let desde = i
  if (desde > 0 && /\*\/\s*$/.test(lineas[desde - 1])) {
    desde--
    while (desde > 0 && !/\/\*\*/.test(lineas[desde])) desde--
  }
  // Baja hasta cerrar llaves/paréntesis (o hasta el próximo renglón sin sangría).
  let profundidad = 0
  let abrio = false
  let hasta = i
  for (; hasta < lineas.length; hasta++) {
    const l = lineas[hasta].replace(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`|\/\/.*$/g, '')
    for (const c of l) {
      if ('{(['.includes(c)) {
        profundidad++
        abrio = true
      } else if ('})]'.includes(c)) profundidad--
    }
    if (abrio && profundidad <= 0) break
    if (!abrio && hasta > i && /^\S/.test(lineas[hasta + 1] ?? '')) break
  }
  console.log(`// ${archivo}:${desde + 1}-${hasta + 1}`)
  console.log(lineas.slice(desde, hasta + 1).join('\n'))
} catch (e) {
  console.error(`funcion.mjs: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
