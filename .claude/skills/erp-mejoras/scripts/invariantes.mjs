#!/usr/bin/env node
/**
 * Auditoría estática de los invariantes del ERP y de patrones de mejora.
 * Solo lee archivos: no corre la app ni la base. Salida corta, pensada para
 * ctx_execute (context-mode).
 *
 *   node .claude/skills/erp-mejoras/scripts/invariantes.mjs            → resumen por regla (cantidad + primeros casos)
 *   node .claude/skills/erp-mejoras/scripts/invariantes.mjs --todo     → todos los casos
 *   node .claude/skills/erp-mejoras/scripts/invariantes.mjs fechas-utc → una sola regla, con todos sus casos
 *   node .claude/skills/erp-mejoras/scripts/invariantes.mjs --cambios  → solo archivos modificados respecto de origin/main
 *
 * Severidad: ERROR = rompe un invariante (revisar ya); AVISO = probable problema;
 * MEJORA = oportunidad (deuda técnica, consistencia). Las heurísticas pueden dar
 * falsos positivos: confirmá leyendo el caso antes de cambiar código.
 * Sale con código 1 si hay algún ERROR.
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const args = process.argv.slice(2)
const todo = args.includes('--todo')
const soloCambios = args.includes('--cambios')
const reglaPedida = args.find((a) => !a.startsWith('--'))

const rel = (p) => relative(raiz, p).replace(/\\/g, '/')
function archivos(dir, filtro) {
  let salida = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'meta'].includes(e.name)) salida = salida.concat(archivos(p, filtro))
    } else if (filtro(e.name)) salida.push(p)
  }
  return salida
}

let cambiados = null
if (soloCambios) {
  try {
    const base = execSync('git merge-base HEAD origin/main', { cwd: raiz, encoding: 'utf8' }).trim()
    const lista = execSync(`git diff --name-only ${base} && git ls-files --others --exclude-standard`, { cwd: raiz, encoding: 'utf8' })
    cambiados = new Set(lista.split('\n').map((l) => l.trim()).filter(Boolean))
  } catch {
    console.log('No pude calcular los cambios contra origin/main; reviso todo.')
  }
}

const fuentes = archivos(join(raiz, 'src'), (n) => /\.(ts|tsx)$/.test(n)).filter((p) => !cambiados || cambiados.has(rel(p)))
const texto = new Map(fuentes.map((p) => [p, readFileSync(p, 'utf8')]))
const esPrueba = (p) => /\.test\.ts$/.test(p)

/** Casos por regla: { regla, severidad, que, casos: ["archivo:línea — detalle"] } */
const reglas = []
function regla(id, severidad, que, casos) {
  reglas.push({ id, severidad, que, casos })
}
function buscar(re, { en = () => true, excluir = () => false, segura = () => false } = {}) {
  const casos = []
  for (const [p, t] of texto) {
    if (!en(p) || excluir(p)) continue
    const lineas = t.split('\n')
    lineas.forEach((l, i) => {
      // `segura` recibe los 8 renglones anteriores: hay patrones que se arman en un renglón y se formatean en otro.
      if (re.test(l) && !/^\s*(\*|\/\/)/.test(l) && !segura(l, lineas.slice(Math.max(0, i - 8), i)))
        casos.push(`${rel(p)}:${i + 1} — ${l.trim().slice(0, 110)}`)
    })
  }
  return casos
}

// 1. Acceso a la base saltando conEmpresa/comoPlataforma (RLS).
regla(
  'db-directo',
  'ERROR',
  'db() fuera de src/db: salta conEmpresa/comoPlataforma y por lo tanto el RLS por empresa.',
  // instrumentation-node.ts migra al arrancar, como dueño de las tablas: es legítimo.
  buscar(/\bdb\(\)/, { excluir: (p) => rel(p).startsWith('src/db/') || rel(p) === 'src/instrumentation-node.ts' || esPrueba(p) }),
)

// 2. Acciones del servidor sin puerta de autorización.
{
  // Puertas: enLaEmpresa y sus envoltorios (enContratos…), exigir*/requerir* (exigirAdmin, requerirPortal…), conEmpresa.
  const PUERTAS = /\ben[A-Z]\w*\(|\bexigir[A-Z]\w*\(|\brequerir[A-Z]\w*\(|sesionActual\(|conEmpresa\(|comoPlataforma\(/
  // Zonas sin sesión por diseño: se protegen con token, firma o freno de intentos (a veces dentro del módulo).
  const PUBLICA = /^src\/app\/(\(sitio\)|ingresar|registro|invitacion|encuesta|seguimiento|pago|comprobante|cierre|deuda|portal)\//
  const privadas = []
  const publicas = []
  for (const [p, t] of texto) {
    if (!/^['"]use server['"]/m.test(t)) continue
    const partes = t.split(/\n(?=export async function )/).slice(1)
    for (const parte of partes) {
      const nombre = parte.match(/^export async function (\w+)/)?.[1]
      const cuerpo = parte.split(/\n(?=(?:export )?(?:async )?function |const \w+ = )/)[0]
      if (!nombre || PUERTAS.test(cuerpo)) continue
      // ¿Delega en otra función local del archivo que sí tiene puerta?
      const llamadas = [...cuerpo.matchAll(/\b(\w+)\(/g)].map((m) => m[1])
      const delega = llamadas.some((n) => n !== nombre && new RegExp(`(?:function|const) ${n}\\b[\\s\\S]{0,1500}?(${PUERTAS.source})`).test(t))
      if (delega) continue
      if (PUBLICA.test(rel(p))) {
        // ipDe(): la IP se pasa al módulo para limitar intentos (como registrarConsulta).
        const protegida = /superado\(|ipDe\(|token|clave|firma/i.test(cuerpo)
        if (!protegida) publicas.push(`${rel(p)} — ${nombre}(): pública; confirmar token/freno (puede estar en el módulo) o que no haga nada sensible`)
      } else privadas.push(`${rel(p)} — ${nombre}() no pasa por enLaEmpresa/exigir*/requerir*/conEmpresa`)
    }
  }
  regla('accion-sin-permiso', 'ERROR', "Acción del servidor de una zona con sesión sin control de permiso (cada acción es un endpoint POST público).", privadas)
  regla('accion-publica', 'AVISO', 'Acción en zona sin sesión sin token, firma ni freno visibles en su cuerpo.', publicas)
}

// 3. "Hoy" calculado en UTC.
regla(
  'fechas-utc',
  'AVISO',
  'Fecha de negocio sacada de toISOString()/UTC: después de las 21 h da mañana. Usar hoyArgentina()/fechaCorta().',
  buscar(/^(?!.*(T12:00:00Z|Date\.UTC\()).*(toISOString\(\)\.slice\(0, ?10\)|toISOString\(\)\.split\(['"]T['"]\))/, {
    // Aritmética sobre `${fecha}T12:00:00Z` (como sumarDias) o fechas armadas con Date.UTC es segura, en el mismo
    // renglón o en los 8 anteriores (la Date se arma y después se formatea). persatApi.ts: solo una etiqueta de avance.
    excluir: (p) => rel(p) === 'src/lib/fechas.ts' || rel(p) === 'src/modulos/importacion/persatApi.ts' || esPrueba(p),
    segura: (_l, previas) => previas.some((x) => /T12:00:00Z|Date\.UTC\(/.test(x)),
  }),
)

// 4. Dinero con number.
regla(
  'dinero-number',
  'MEJORA',
  'Importe convertido a number en lógica (src/modulos, src/lib): si se suma o multiplica sin redondear, pierde centavos; usar D/monto/aImporte. Inocuo en comparaciones (=== 0, tolerancias) y en contabilidad, que trabaja en centavos enteros (Math.round(x * 100)) a propósito.',
  buscar(/(parseFloat|Number)\([^)]*\b(importe|total|saldo|neto|precio|monto|iva|subtotal|debe|haber)\w*\b[^)]*\)/i, {
    en: (p) => /^src\/(modulos|lib)\//.test(rel(p)),
    excluir: (p) => esPrueba(p) || /\/lib\/dinero\.ts$/.test(p),
  }),
)

// 5. Componentes cliente que importan cosas de servidor.
{
  const casos = []
  for (const [p, t] of texto) {
    if (!/^['"]use client['"]/m.test(t)) continue
    for (const m of t.matchAll(/from ['"]([^'"]+)['"]/g)) {
      if (/(^|\/)db(\/|$)|lib\/auth\/servidor|server-only|node:|drizzle-orm/.test(m[1])) casos.push(`${rel(p)} — importa ${m[1]}`)
    }
  }
  regla('cliente-importa-servidor', 'ERROR', "Archivo 'use client' que importa base, sesión o módulos de Node.", casos)
}

// 5b. Dirección de dependencias entre capas: app → modulos → (db, lib). Nunca al revés.
{
  const errores = []
  const avisos = []
  for (const [p, t] of texto) {
    const r = rel(p)
    // Las pruebas de integración de la API v1 importan sus rutas a propósito.
    if (esPrueba(p)) continue
    for (const m of t.matchAll(/from ['"]([^'"]+)['"]/g)) {
      const destino = m[1]
      if (r.startsWith('src/modulos/') && /(^@\/app\/|\/app\/)/.test(destino)) errores.push(`${r} — importa ${destino}`)
      if (r.startsWith('src/db/') && /modulos|\/app\//.test(destino)) errores.push(`${r} — importa ${destino}`)
      if (r.startsWith('src/lib/') && /modulos\//.test(destino) && !esPrueba(p)) avisos.push(`${r} — importa ${destino}`)
    }
  }
  regla('capas-invertidas', 'ERROR', 'src/modulos o src/db importando de src/app (o db de modulos): la lógica no puede depender de las pantallas.', errores)
  regla('lib-depende-de-modulos', 'MEJORA', 'src/lib (transversal) importando un módulo de dominio: acopla capas. Hoy hay casos conocidos (auth/servidor → plataforma/codigos); no sumar nuevos sin motivo.', avisos)
}

// 6. Rutas de API sin autenticación visible.
{
  const AUTH = /enLaEmpresa|conApi|conEmpresa|comoPlataforma|requerir|sesion|CRON_SECRET|timingSafeEqual|firma|Firma|clave|token|verificar|secret/i
  const casos = []
  for (const [p, t] of texto) {
    if (!/\/route\.ts$/.test(p)) continue
    if (!AUTH.test(t)) casos.push(`${rel(p)} — sin enLaEmpresa/conApi/firma/clave visibles`)
  }
  regla('ruta-sin-auth', 'AVISO', 'Route handler sin señal de autenticación (revisar si es público a propósito: salud, robots, etc.).', casos)
}

// 7. Colores fuera de los tokens (rompen el tema oscuro).
regla(
  'color-suelto',
  'MEJORA',
  'Clase de color de la paleta de Tailwind o hex en className: usar tokens (bg-superficie, text-texto-2, bg-ok-suave…).',
  buscar(
    /className=.*\b(bg|text|border|ring|fill|stroke)-(red|blue|green|gray|slate|zinc|neutral|stone|amber|yellow|emerald|sky|indigo|violet|purple|pink|rose|orange|lime|teal|cyan|fuchsia)-\d{2,3}\b|className=.*#[0-9a-fA-F]{3,6}\b/,
    { en: (p) => p.endsWith('.tsx') },
  ),
)

// 8. console.log olvidados en código de la app.
regla('console-log', 'MEJORA', 'console.log en código de la app (el monitoreo usa registrarError).', buscar(/console\.log\(/, { excluir: esPrueba }))

// 9. Archivos muy largos (candidatos a dividir).
{
  const casos = []
  for (const [p, t] of texto) {
    const n = t.split('\n').length
    if (n > 700 && !esPrueba(p)) casos.push(`${rel(p)} — ${n} líneas`)
  }
  casos.sort((a, b) => Number(b.match(/(\d+) líneas/)[1]) - Number(a.match(/(\d+) líneas/)[1]))
  regla('archivo-largo', 'MEJORA', 'Archivo de más de 700 líneas: costoso de leer para humanos y agentes; evaluar dividir por responsabilidad.', casos)
}

// 10. Helpers duplicados.
{
  const casos = []
  const defs = new Map()
  for (const [p, t] of texto) {
    for (const m of t.matchAll(/^(?:export )?const (deLaEmpresa|texto|uuid|decimal|UUID|primerError)\s*=/gm)) {
      defs.set(m[1], [...(defs.get(m[1]) ?? []), rel(p)])
    }
  }
  for (const [n, lista] of defs) if (lista.length > 2) casos.push(`${n} definido ${lista.length} veces: ${lista.slice(0, 4).join(', ')}${lista.length > 4 ? '…' : ''}`)
  regla('helper-duplicado', 'MEJORA', 'Mismo helper copiado en varios archivos: candidato a un módulo común.', casos)
}

// 11. Módulos de dominio sin ninguna prueba en su área.
{
  const casos = []
  const base = join(raiz, 'src', 'modulos')
  for (const area of readdirSync(base)) {
    const dir = join(base, area)
    if (!statSync(dir).isDirectory()) continue
    // Con --cambios, solo las áreas que se tocaron.
    if (cambiados && ![...cambiados].some((c) => c.startsWith(`src/modulos/${area}/`))) continue
    const ts = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    const pruebas = ts.filter((f) => f.endsWith('.test.ts')).map((f) => f.replace('.test.ts', ''))
    const sinPrueba = ts.filter((f) => !f.endsWith('.test.ts') && !pruebas.includes(f.replace('.ts', '')))
    if (!pruebas.length) casos.push(`src/modulos/${area} — ningún archivo de prueba (${ts.length} archivos)`)
    else if (sinPrueba.length > 3) casos.push(`src/modulos/${area} — ${sinPrueba.length} archivos sin prueba propia: ${sinPrueba.slice(0, 5).join(', ')}`)
  }
  regla('sin-pruebas', 'MEJORA', 'Área de dominio sin pruebas (o con varias piezas sin prueba propia). Todo cálculo de dinero o fiscal debe tenerla.', casos)
}

// 12. Consultas dentro de bucles (N+1).
{
  const casos = []
  for (const [p, t] of texto) {
    if (!rel(p).startsWith('src/modulos/') || esPrueba(p)) continue
    const lineas = t.split('\n')
    lineas.forEach((l, i) => {
      if (!/^\s*for \(const .+ of .+\) \{\s*$/.test(l)) return
      const sangria = l.match(/^\s*/)[0].length
      for (let j = i + 1; j < Math.min(i + 12, lineas.length); j++) {
        const lj = lineas[j]
        if (lj.trim() && lj.match(/^\s*/)[0].length <= sangria) break
        if (/await tx\s*\.(select|insert|update|delete)\(/.test(lj) || /await tx\.select/.test(lj)) {
          casos.push(`${rel(p)}:${j + 1} — consulta dentro de un for (L${i + 1})`)
          break
        }
      }
    })
  }
  regla('consulta-en-bucle', 'MEJORA', 'await tx.select/insert/update dentro de un for: N consultas; ver si conviene inArray o un insert en lote.', casos)
}

// ---------- salida
const ORDEN = { ERROR: 0, AVISO: 1, MEJORA: 2 }
const elegidas = (reglaPedida ? reglas.filter((r) => r.id === reglaPedida) : reglas).sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad])
if (reglaPedida && !elegidas.length) {
  console.log(`No existe la regla "${reglaPedida}". Reglas: ${reglas.map((r) => r.id).join(', ')}`)
} else {
  console.log(`Auditoría de ${texto.size} archivos${cambiados ? ' (solo cambios)' : ''}.\n`)
  for (const r of elegidas) {
    const max = todo || reglaPedida ? Infinity : 5
    console.log(`[${r.severidad}] ${r.id}: ${r.casos.length} — ${r.que}`)
    for (const c of r.casos.slice(0, max)) console.log(`   ${c}`)
    if (r.casos.length > max) console.log(`   … ${r.casos.length - max} más (node …/invariantes.mjs ${r.id})`)
  }
  const errores = elegidas.filter((r) => r.severidad === 'ERROR').reduce((s, r) => s + r.casos.length, 0)
  console.log(`\n${errores ? `${errores} casos ERROR para revisar.` : 'Sin casos ERROR.'}`)
  // exitCode y no exit(): con salida por pipe, exit() puede cortar lo impreso.
  process.exitCode = errores ? 1 : 0
}
