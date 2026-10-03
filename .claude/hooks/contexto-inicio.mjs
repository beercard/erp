#!/usr/bin/env node
/**
 * Hook SessionStart: le da a Claude, al empezar cada sesión, el estado del repo
 * que no está en ningún archivo (rama, cambios sin commitear, última migración,
 * Node instalado vs el que pide el repo). Dos renglones: cuesta casi nada de
 * contexto. Nunca falla: ante cualquier error no imprime nada.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim()
  } catch {
    return ''
  }
}

try {
  const partes = []
  const rama = git('rev-parse --abbrev-ref HEAD')
  if (rama) {
    const cambios = git('status --porcelain').split('\n').filter(Boolean).length
    const [atras, adelante] = (git('rev-list --left-right --count origin/main...HEAD') || '0 0').split(/\s+/).map(Number)
    partes.push(`rama ${rama}${rama !== 'main' ? ` (+${adelante || 0}/−${atras || 0} vs origin/main)` : ''} · ${cambios} archivos con cambios`)
  }
  const migraciones = readdirSync(join(raiz, 'drizzle')).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
  if (migraciones.length) partes.push(`última migración ${migraciones.at(-1).replace('.sql', '')}`)
  const pide = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).engines?.node ?? ''
  const mayorPedido = Number(pide.match(/\d+/)?.[0] ?? 0)
  const mayorLocal = Number(process.versions.node.split('.')[0])
  partes.push(`Node ${process.versions.node}${mayorLocal < mayorPedido ? ` (el repo pide ${pide})` : ''}`)
  if (!existsSync(join(raiz, 'node_modules'))) partes.push('sin node_modules: correr npm install')

  console.log(`[ERP] ${partes.join(' · ')}`)
  console.log(
    '[ERP] Antes de trabajar cargá la skill erp-* del área (tabla en CLAUDE.md). Antes de un PR: ' +
      '`node .claude/skills/erp-verificar/scripts/verificar.mjs todo`. Tareas grandes: equipo de subagentes *-erp (skill erp-equipo).',
  )
} catch {
  // Un hook de contexto nunca debe trabar la sesión.
}
