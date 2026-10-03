#!/usr/bin/env node
/**
 * Corre los controles del repo y muestra solo lo que importa (errores y
 * resumen), para no llenar el contexto con miles de renglones.
 *
 *   node .claude/skills/erp-verificar/scripts/verificar.mjs                      → tipos + lint + pruebas
 *   node .claude/skills/erp-verificar/scripts/verificar.mjs pruebas src/modulos/maestros
 *   node .claude/skills/erp-verificar/scripts/verificar.mjs tipos lint
 *   node .claude/skills/erp-verificar/scripts/verificar.mjs todo                 → todos los pasos (como el CI, más auditoría)
 *   node .claude/skills/erp-verificar/scripts/verificar.mjs invariantes skills   → auditoría de lo cambiado + skills al día
 *
 * Pasos: tipos, lint, pruebas, build, formato, invariantes (auditor de
 * erp-mejoras sobre lo cambiado contra origin/main), skills (las skills siguen
 * describiendo el código). Cualquier otro argumento se pasa como filtro a
 * vitest (carpeta, archivo o nombre).
 * Sale con código 1 si algún paso falla.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const PASOS = ['tipos', 'lint', 'pruebas', 'build', 'formato', 'invariantes', 'skills']
const args = process.argv.slice(2)
let pasos = args.filter((a) => PASOS.includes(a) || a === 'todo')
const filtros = args.filter((a) => !PASOS.includes(a) && a !== 'todo')
if (pasos.includes('todo')) pasos = [...PASOS]
if (!pasos.length) pasos = filtros.length ? ['pruebas'] : ['tipos', 'lint', 'pruebas']

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

function correr(comando) {
  const inicio = Date.now()
  const r = spawnSync(comando, {
    cwd: raiz,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', NEXT_TELEMETRY_DISABLED: '1' },
  })
  const salida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.replace(ANSI, '').replace(/\r/g, '')
  return { ok: r.status === 0, salida, segundos: ((Date.now() - inicio) / 1000).toFixed(1), error: r.error }
}

const recortar = (lineas, max) =>
  lineas.length > max ? [...lineas.slice(0, max), `… (${lineas.length - max} renglones más)`] : lineas

const resumir = {
  tipos(salida) {
    const errores = salida.split('\n').filter((l) => /error TS\d+/.test(l))
    return errores.length ? [`${errores.length} errores de tipos:`, ...recortar(errores, 40)] : salida.trim().split('\n').slice(-15)
  },
  lint(salida) {
    const lineas = salida.split('\n')
    const utiles = lineas.filter(
      (l) => /^\S.*\.(t|j|mj)sx?$/.test(l.trim()) || /\s(error|warning)\s/.test(l) || /\d+ problems?/.test(l),
    )
    return recortar(utiles.length ? utiles : lineas.slice(-15), 60)
  },
  pruebas(salida, ok) {
    const lineas = salida.split('\n').filter((l) => l.trim() && !/^[\s.·•*x×✓-]+$/.test(l))
    const resumen = lineas.filter((l) => /^\s*(Test Files|Tests|Duration|Errors?)\s/.test(l))
    if (ok) return resumen.length ? resumen : lineas.slice(-6)
    // Vitest deja el detalle de las fallas al final, antes del resumen.
    return recortar(lineas.slice(-150), 150)
  },
  build(salida, ok) {
    return salida.trim().split('\n').slice(ok ? -8 : -60)
  },
  formato(salida) {
    const avisos = salida.split('\n').filter((l) => /^\[warn\]/.test(l))
    return avisos.length ? recortar(avisos, 40) : ['Formato OK.']
  },
  invariantes(salida) {
    // Solo las reglas con casos, y sus casos.
    const lineas = salida.split('\n').filter((l) => (/^\[/.test(l) && !/: 0 —/.test(l)) || /^\s{3}\S/.test(l) || /casos ERROR|Sin casos/.test(l))
    return recortar(lineas, 50)
  },
  skills(salida) {
    return recortar(salida.trim().split('\n'), 30)
  },
}

const COMANDOS = {
  tipos: 'npm run typecheck',
  lint: 'npm run lint',
  pruebas: `npx vitest run --reporter=dot ${filtros.map((f) => `"${f}"`).join(' ')}`.trim(),
  build: 'npm run build',
  formato: 'npx prettier --check src scripts docs',
  invariantes: 'node .claude/skills/erp-mejoras/scripts/invariantes.mjs --cambios',
  skills: 'node .claude/skills/erp-mejoras/scripts/skills-al-dia.mjs',
}

// exitCode y no exit(): con salida por pipe, exit() puede cortar lo impreso.
if (!existsSync(join(raiz, 'node_modules'))) {
  console.log('Falta node_modules: correr `npm install` (Node 24) antes de verificar.')
  process.exitCode = 1
} else {
  let fallo = false
  for (const paso of pasos) {
    const { ok, salida, segundos, error } = correr(COMANDOS[paso])
    console.log(`\n### ${paso}: ${ok ? 'OK' : 'FALLA'} (${segundos} s) — ${COMANDOS[paso]}`)
    if (error) console.log(`No se pudo correr: ${error.message}`)
    if (!ok || paso === 'pruebas' || paso === 'invariantes') console.log(resumir[paso](salida, ok).join('\n'))
    fallo ||= !ok
  }
  console.log(`\n${fallo ? 'Hay pasos con fallas.' : 'Todo OK.'}`)
  process.exitCode = fallo ? 1 : 0
}
