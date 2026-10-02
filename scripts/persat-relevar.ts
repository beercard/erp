/**
 * Relevamiento de una cuenta de Persat por su API, para comparar con el ERP
 * y preparar la migración. SOLO LEE: todos los pedidos pasan por leer(),
 * que hace GET y nada más (la clave de Persat tiene acceso total y la API
 * permite borrar clientes con todo su historial).
 *
 *   npm run persat:relevar -- [--muestra 50]   (lee PERSAT_API_KEY)
 *
 * Deja los JSON en .data/persat/ (fuera de git: tienen datos de clientes) y
 * un resumen.md con lo que usa la cuenta: tipos de OT con sus campos,
 * formularios, estados, etiquetas, campos personalizados, objetos en
 * cliente, catálogos, técnicos y cantidades.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.PERSAT_API_URL ?? 'https://api.persat.com.ar/v1'
const CLAVE = process.env.PERSAT_API_KEY
const DIR = join(process.cwd(), '.data', 'persat')
const i = process.argv.indexOf('--muestra')
const MUESTRA = i > 0 ? Math.max(1, Math.min(500, Number(process.argv[i + 1]) || 50)) : 50

if (!CLAVE) {
  console.error('Falta PERSAT_API_KEY.')
  process.exit(1)
}

type Respuesta = { ok: boolean; status: number; cuerpo: unknown }

/** Único punto de salida a la API: GET y nada más. */
async function leer(ruta: string): Promise<Respuesta> {
  const url = `${BASE}${ruta}`
  const r = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${CLAVE}`, Accept: 'application/json' } })
  const texto = await r.text()
  let cuerpo: unknown = texto
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    /* no es JSON */
  }
  // Un respiro entre pedidos para no cargar la cuenta.
  await new Promise((ok) => setTimeout(ok, 250))
  return { ok: r.ok, status: r.status, cuerpo }
}

const datos = (r: Respuesta): unknown[] => {
  const c = r.cuerpo as { data?: unknown } | unknown[]
  if (Array.isArray(c)) return c
  const d = (c as { data?: unknown })?.data
  return Array.isArray(d) ? d : d ? [d] : []
}

async function guardar(nombre: string, valor: unknown) {
  await writeFile(join(DIR, `${nombre}.json`), JSON.stringify(valor, null, 2))
}

const informe: string[] = [`# Relevamiento de Persat (${new Date().toISOString().slice(0, 10)})`, '']
const linea = (t = '') => informe.push(t)

async function bajar(nombre: string, ruta: string) {
  const r = await leer(ruta)
  await guardar(nombre, r.cuerpo)
  const n = datos(r).length
  linea(`- \`${ruta}\`: ${r.ok ? `${n} elementos` : `error ${r.status}`}`)
  if (!r.ok) console.warn(`${ruta}: ${r.status} ${JSON.stringify(r.cuerpo).slice(0, 200)}`)
  return r.ok ? datos(r) : []
}

/** Nombres y tipos de los campos de un esquema, tolerando formas distintas. */
function campos(esquema: unknown, profundidad = 0): string[] {
  if (!esquema || typeof esquema !== 'object' || profundidad > 4) return []
  const salida: string[] = []
  for (const [k, v] of Object.entries(esquema as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      for (const x of v as Record<string, unknown>[]) {
        const nombre = x.label ?? x.name ?? x.title ?? x.id
        const tipo = x.type ?? x.widget ?? x.widgetType
        if (nombre && tipo)
          salida.push(`${'  '.repeat(profundidad)}- ${String(nombre)} (${String(tipo)})${x.required ? ' *' : ''}`)
        salida.push(...campos(x, profundidad + 1))
      }
    } else if (v && typeof v === 'object' && k !== 'data') salida.push(...campos(v, profundidad))
  }
  return [...new Set(salida)]
}

await mkdir(DIR, { recursive: true })
const prueba = await leer('/clients?limit=1')
if (prueba.status === 401) {
  console.error('La API rechaza la clave (401).')
  process.exit(1)
}

linea('## Pedidos')
const tiposOt = await bajar('tipos-ot', '/work-orders-schemas')
const formularios = await bajar('formularios-esquemas', '/digital-forms-schemas')
const etiquetasOt = await bajar('etiquetas-ot', '/work-orders-labels')
const camposCliente = await bajar('clientes-campos', '/client-custom-fields')
const grupos = await bajar('clientes-grupos', '/client-groups')
const tiposCliente = await bajar('clientes-tipos', '/client-types')
const objetos = await bajar('objetos-esquemas', '/clientobj')
const catalogos = await bajar('masterdb-esquemas', '/masterdbs')
const usuarios = await bajar('usuarios', '/users')
const tecnicos = await bajar('tecnicos', '/technician-users')
const dispositivos = await bajar('dispositivos', '/devices')
const zonas = await bajar('zonas', '/zones')
const tiposEntrega = await bajar('entregas-esquemas', '/deliveries-schemas')
const clientes = await bajar('clientes-muestra', `/clients?limit=${MUESTRA}&offset=0`)

// Esquemas completos de cada versión de tipo de OT, formulario, entrega y objeto en cliente.
const idDe = (x: unknown) => {
  const o = x as Record<string, unknown>
  return o.wo_shema_id ?? o.wo_schema_id ?? o.schema_id ?? o.obj_id ?? o.mdb_id ?? o.id
}
for (const [nombre, lista, ruta] of [
  ['tipo-ot', tiposOt, '/work-orders-schemas'],
  ['formulario', formularios, '/digital-forms-schemas'],
  ['entrega', tiposEntrega, '/deliveries-schemas'],
  ['objeto', objetos, '/clientobj'],
  ['masterdb', catalogos, '/masterdbs'],
] as const)
  for (const x of lista) {
    const id = idDe(x)
    if (id !== undefined) await bajar(`${nombre}-${id}`, `${ruta}/${id}`)
  }

// Órdenes de los últimos 90 días, de a 15 días (la API no deja pedir más), y formularios.
const iso = (d: Date) => d.toISOString()
const hasta = new Date()
const ordenes: unknown[] = []
for (let fin = hasta; fin.getTime() > hasta.getTime() - 90 * 86400000;) {
  const inicio = new Date(fin.getTime() - 14 * 86400000)
  const r = await leer(`/work-orders?from=${iso(inicio)}&to=${iso(fin)}`)
  if (r.ok) ordenes.push(...datos(r))
  else console.warn(`/work-orders: ${r.status} ${JSON.stringify(r.cuerpo).slice(0, 200)}`)
  fin = new Date(inicio.getTime() - 86400000)
}
await guardar('ordenes-90-dias', ordenes)
linea(`- \`/work-orders\` (90 días, de a 15): ${ordenes.length} órdenes`)
const desde = new Date(hasta.getTime() - 90 * 86400000)
const enviados = await bajar(
  'formularios-muestra',
  `/digital-forms?from=${iso(desde)}&to=${iso(hasta)}&limit=${Math.min(100, MUESTRA)}&offset=0`,
)

// Estados de formulario: por grupo de formulario.
const gruposForm = [
  ...new Set((formularios as { form_group?: string | number }[]).map((f) => f.form_group).filter((g) => g !== undefined)),
]
const estadosFormulario: unknown[] = []
for (const g of gruposForm) {
  const r = await leer(`/digital-forms-states?form_group=${encodeURIComponent(String(g))}&without_deleted=true`)
  if (r.ok) estadosFormulario.push(...datos(r).map((e) => ({ ...(e as object), form_group: g })))
}
await guardar('formularios-estados', estadosFormulario)

linea('')
linea('## Lo que usa la cuenta')
const nombre = (x: unknown): string => {
  const o = x as Record<string, unknown>
  const v = o.name ?? o.title ?? o.label ?? o.description ?? o.id ?? '?'
  if (v && typeof v === 'object') return nombre(v)
  const version = o.version !== undefined ? ` (v${o.version}${o.production ? ', publicada' : ''})` : ''
  return `${String(v)}${version}`
}
const lista = (titulo: string, xs: unknown[]) => {
  linea('')
  linea(`### ${titulo} (${xs.length})`)
  for (const x of xs.slice(0, 100)) linea(`- ${nombre(x)}`)
}
lista('Tipos de OT', tiposOt)
for (const t of tiposOt) {
  const det = (await leer(`/work-orders-schemas/${idDe(t)}`)).cuerpo
  const cs = campos(det)
  if (cs.length) {
    linea('')
    linea(`#### Campos de "${nombre(t)}"`)
    informe.push(...cs)
  }
}
lista('Formularios', formularios)
lista('Estados de formulario', estadosFormulario)
lista('Etiquetas de OT', etiquetasOt)
lista('Campos personalizados de clientes', camposCliente)
lista('Grupos de clientes', grupos)
lista('Tipos de cliente', tiposCliente)
lista('Objetos en cliente (equipos)', objetos)
lista('Catálogos (Master DB)', catalogos)
lista('Zonas de trabajo', zonas)
lista('Tipos de entrega', tiposEntrega)
linea('')
linea(`Usuarios ${usuarios.length}, técnicos ${tecnicos.length}, dispositivos ${dispositivos.length}.`)
linea(`Muestra: ${clientes.length} clientes, ${ordenes.length} órdenes de los últimos 90 días, ${enviados.length} formularios.`)
const porEstado = new Map<string, number>()
for (const o of ordenes as { state?: string; status?: string }[]) {
  const e = String(o.state ?? o.status ?? '?')
  porEstado.set(e, (porEstado.get(e) ?? 0) + 1)
}
if (porEstado.size) linea(`Órdenes por estado: ${[...porEstado].map(([e, n]) => `${e} ${n}`).join(', ')}.`)

await writeFile(join(DIR, 'resumen.md'), informe.join('\n'))
console.log(`Listo: ${DIR}/resumen.md`)
