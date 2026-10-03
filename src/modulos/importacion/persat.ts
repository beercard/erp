import { and, eq } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import {
  archivosServicio,
  equipos,
  etiquetasServicio,
  ordenesServicio,
  ordenesServicioEtiquetas,
  ordenesServicioTecnicos,
  tecnicos,
  terceros,
  vinculosExternos,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { hoyArgentina } from '../../lib/fechas'
import { siguienteNumero } from '../comercial/numeracion'
import type { Campo, Columna, TipoCampo, Valores } from '../servicio/formularios'
import { guardarTipo, plantillaVigente } from '../servicio/tiposOrden'
import type { DatosPersat, EquipoPersat, EsquemaOtPersat, WidgetPersat } from './persatApi'

/**
 * Migración de una cuenta de Persat al ERP (clientes, equipos, técnicos,
 * etiquetas, el tipo de orden con sus formularios y el historial de
 * órdenes). Reglas sacadas de la cuenta real:
 *
 * - Los clientes de Persat no tienen CUIT. Su `uid_client` es el código del
 *   cliente en el sistema anterior (el mismo que trajo la importación de
 *   PYMEXIS), así que se emparejan por código, confirmando que el nombre se
 *   parezca; si no, por nombre exacto (sin acentos, puntuación ni "S.A.").
 *   Los que no se emparejan se informan (o se crean, si se pide).
 * - Los equipos traen "Serie - Modelo" en un solo texto: la serie es la
 *   primera palabra (salvo que empiece con la marca). Se emparejan por serie
 *   con los del parque instalado; los que no existen se crean.
 * - El tipo de orden se arma en el ERP con los mismos campos (cada campo
 *   conserva el identificador de Persat, así las respuestas de cada orden
 *   se pasan tal cual).
 * - El contador de las órdenes viejas queda en la orden, pero no se carga
 *   como lectura: las lecturas facturan contratos.
 * - Es idempotente: cada registro de Persat queda vinculado al del ERP
 *   (`vinculos_externos`); correrla de nuevo actualiza estados y respuestas.
 */

const SISTEMA = 'persat'

export type Opciones = {
  /** Crear los clientes que no se emparejan (con documento 99, para completar). */
  crearClientes?: boolean
  /** Baja las fotos (las URL de Persat duran poco: hay que bajarlas al migrar). */
  bajarFoto?: ((url: string) => Promise<Buffer | null>) | null
  ahora?: Date
}

export type Informe = {
  clientes: { porVinculo: number; porCodigo: number; porNombre: number; creados: number; sinPareja: number }
  equipos: { porVinculo: number; porSerie: number; creados: number; sinCliente: number }
  tecnicos: { vinculados: number; creados: number }
  etiquetas: { vinculadas: number; creadas: number }
  tipoOrden: { creado: boolean; nuevaVersion: boolean }
  ordenes: { nuevas: number; actualizadas: number; sinCliente: number; fotos: number }
  /** Clientes de Persat que no se pudieron emparejar (para resolver a mano). */
  clientesSinPareja: { uid: string; nombre: string; motivo: string }[]
  avisos: string[]
}

// ---------------------------------------------------------------- Emparejamiento

const FORMAS =
  /\b(S\.?\s?A\.?\s?S?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?I\.?\s?C\.?|SOCIEDAD ANONIMA|SOCIEDAD DE RESPONSABILIDAD LIMITADA|SH|S\.?\s?H\.?)\s*$/

/** Para comparar nombres: mayúsculas, sin acentos, puntuación ni la forma societaria. */
export function normalizarNombre(s: string) {
  let n = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Las siglas sueltas al final ("S A", "S R L") quedan separadas por espacios.
  n = n.replace(/\b(S A S|S A|S R L|S A I C|S H)$/, '').trim()
  return n.replace(FORMAS, '').trim()
}

/** Código comparable: los numéricos sin ceros a la izquierda; el resto en mayúsculas sin espacios. */
export function normalizarCodigo(s: string) {
  const t = s.trim()
  if (/^\d+$/.test(t)) return String(Number(t))
  return t.toUpperCase().replace(/\s+/g, '')
}

/** Dos nombres se parecen si comparten una palabra significativa (4 letras o más). */
export function seParecen(a: string, b: string) {
  const pa = new Set(
    normalizarNombre(a)
      .split(' ')
      .filter((p) => p.length >= 4),
  )
  return normalizarNombre(b)
    .split(' ')
    .some((p) => p.length >= 4 && pa.has(p))
}

const MARCAS = [
  'RICOH',
  'KONICA',
  'MINOLTA',
  'HP',
  'SAMSUNG',
  'BROTHER',
  'LEXMARK',
  'XEROX',
  'CANON',
  'KYOCERA',
  'SHARP',
  'EPSON',
  'OKI',
  'TOSHIBA',
  'PANTUM',
]

/** "L1234567890         RICOH AFICIO MP4002" → serie y modelo. */
export function separarSerieModelo(texto: string): { serie: string; modelo: string | null } | null {
  const t = texto.replace(/\s+/g, ' ').trim().toUpperCase()
  if (!t) return null
  const partes = t.split(' ')
  // Si empieza con la marca, la serie es la última palabra con números.
  if (MARCAS.includes(partes[0])) {
    const i = partes.findLastIndex((p) => /\d/.test(p) && p.length >= 5)
    if (i > 0) return { serie: partes[i], modelo: [...partes.slice(0, i), ...partes.slice(i + 1)].join(' ') || null }
  }
  return { serie: partes[0], modelo: partes.slice(1).join(' ') || null }
}

// ---------------------------------------------------------------- Tipo de orden

const ID_CAMPO = /^[a-z][a-z0-9_]{0,39}$/
/** Identificador del campo en el ERP a partir del de Persat (que puede tener mayúsculas). */
export const idCampo = (idPersat: string) => {
  const id = `p_${idPersat.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`.slice(0, 40)
  return ID_CAMPO.test(id) ? id : `p_${Buffer.from(idPersat).toString('hex').slice(0, 38)}`
}

const opcionesDe = (w: WidgetPersat): string[] =>
  ((w.description?.options as unknown[]) ?? [])
    .map((o) => (typeof o === 'string' ? o : (o as { option_name?: string })?.option_name))
    .filter((o): o is string => !!o && !!o.trim())
    .map((o) => o.trim())

/** Un campo de Persat como campo del ERP (null si no tiene equivalente). */
export function campoDesdeWidget(w: WidgetPersat, usados: Set<TipoCampo>): Campo | null {
  const base = { id: idCampo(w.id), etiqueta: (w.title || 'Sin título').slice(0, 200) }
  switch (w.widget_type) {
    case 'NEW_SECTION':
      return { ...base, tipo: 'seccion' }
    case 'TEXT_FIELD':
      return { ...base, tipo: 'texto' }
    case 'TEXT_PARAGRAPH':
      return { ...base, tipo: 'parrafo' }
    case 'LINK_FIELD':
      return { ...base, tipo: 'link' }
    case 'NUMBER_FIELD':
      // El primer número que es un contador o medidor carga la lectura del equipo en las órdenes nuevas.
      if (/medidor|contador/i.test(w.title) && !usados.has('contador')) {
        usados.add('contador')
        return { ...base, tipo: 'contador' }
      }
      return { ...base, tipo: 'numero' }
    case 'DATE_FIELD':
      return { ...base, tipo: 'fecha' }
    case 'TIME_FIELD':
      return { ...base, tipo: 'hora' }
    case 'DROPDOWN_SELECTION':
    case 'SIMPLE_SELECTION':
    case 'LABEL_FIELD':
      return { ...base, tipo: 'seleccion', opciones: opcionesDe(w) }
    case 'MULTIPLE_SELECTION':
      return { ...base, tipo: 'multiple', opciones: opcionesDe(w) }
    case 'IMAGE_FIELD':
    case 'MULTIPLE_IMAGES_FIELD':
      return { ...base, tipo: 'fotos', maximo: 10 }
    case 'SIGNATURE_FIELD':
    case 'SIGNATURES_FIELD_V2':
      if (usados.has('firma')) return null
      usados.add('firma')
      return { ...base, tipo: 'firma' }
    case 'CLIENT_OBJECT_DROPDOWN':
      if (usados.has('equipo')) return null
      usados.add('equipo')
      return { ...base, tipo: 'equipo' }
    case 'POWER_TABLE_FIELD': {
      const cols = ((w.description?.cols as { name: string; type: string; options?: string[] }[]) ?? []).map((c, i): Columna => ({
        id: `c${i + 1}`,
        etiqueta: c.name,
        tipo: c.type === 'NUMBER' ? 'numero' : c.type === 'DROPDOWN' && c.options?.length ? 'seleccion' : 'texto',
        ...(c.type === 'DROPDOWN' && c.options?.length ? { opciones: c.options } : {}),
      }))
      return cols.length ? { ...base, tipo: 'tabla', columnas: cols, minFilas: 1 } : null
    }
    default:
      return null
  }
}

export function plantillaDesdeEsquema(e: EsquemaOtPersat) {
  const usados = new Set<TipoCampo>()
  const omitidos: string[] = []
  const pasar = (ws: WidgetPersat[]) =>
    ws.flatMap((w) => {
      const c = campoDesdeWidget(w, usados)
      if (!c) omitidos.push(`${w.title} (${w.widget_type})`)
      return c ? [c] : []
    })
  return {
    instrucciones: pasar(e.instructions_description?.widgets ?? []),
    devolucion: pasar(e.results_description?.widgets ?? []),
    omitidos,
  }
}

// ---------------------------------------------------------------- Valores de una orden

const aHora = (m: unknown) => {
  const n = Number(m)
  if (!Number.isInteger(n) || n < 0 || n >= 1440) return null
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

/** Fecha y hora de Buenos Aires de un instante ISO. */
const fechaArgentina = (iso: string) => hoyArgentina(new Date(iso))

/** Momento a partir de una fecha (AAAA-MM-DD) y minutos del día en Buenos Aires. */
const momento = (fecha: string, minutos: number) => new Date(`${fecha}T00:00:00-03:00`).getTime() + minutos * 60_000

type Contexto = {
  campos: Map<string, Campo>
  equipoDe: (texto: string) => string | null
  /** Fotos a bajar cuando la orden ya existe (los archivos son de la orden). */
  fotos: (campoId: string, urls: string[]) => void
}

/** Respuestas de Persat → valores del ERP (los que no tienen campo se devuelven aparte). */
export async function valoresDesde(fv: Record<string, unknown> | undefined, ctx: Contexto) {
  const valores: Valores = {}
  const sueltos: string[] = []
  for (const [k, v] of Object.entries(fv ?? {})) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue
    const c = ctx.campos.get(idCampo(k))
    if (!c) {
      sueltos.push(typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v))
      continue
    }
    switch (c.tipo) {
      case 'texto':
      case 'parrafo':
      case 'link':
      case 'seleccion':
        if (typeof v === 'string' || typeof v === 'number') valores[c.id] = String(v).trim()
        break
      case 'numero':
        if (Number.isFinite(Number(v))) valores[c.id] = Number(v)
        break
      case 'contador': {
        const n = Number(String(v).replace(/\D/g, ''))
        if (Number.isInteger(n) && String(v).trim()) valores[c.id] = { contador: n, creditos: 0 }
        break
      }
      case 'fecha':
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) valores[c.id] = v.slice(0, 10)
        break
      case 'hora': {
        const h = typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : aHora(v)
        if (h) valores[c.id] = h
        break
      }
      case 'multiple':
        if (Array.isArray(v)) valores[c.id] = v.filter((x): x is string => typeof x === 'string')
        break
      case 'tabla':
        if (Array.isArray(v))
          valores[c.id] = v
            .filter(Array.isArray)
            .map((fila) => (fila as unknown[]).map((x) => (x === null || x === undefined ? '' : String(x))))
            .filter((fila) => fila.some((x) => x.trim() && x.trim() !== '0'))
        break
      case 'equipo': {
        const texto = typeof v === 'object' && v ? String((v as Record<string, unknown>)['1'] ?? '') : String(v)
        const id = ctx.equipoDe(texto)
        if (id) valores[c.id] = id
        break
      }
      case 'fotos': {
        const urls = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x))
        if (urls.length) ctx.fotos(c.id, urls.slice(0, c.maximo ?? 10))
        break
      }
      case 'firma':
        // La firma vieja de Persat no se puede bajar por la API ("THERE_IS_IMAGE"): queda constancia en el texto.
        break
    }
  }
  return { valores, sueltos }
}

// ---------------------------------------------------------------- Mapeos fijos

const ESTADO: Record<string, string> = {
  PENDIENTE: 'pendiente',
  PROYECTADA: 'proyectada',
  ASIGNADA: 'asignada',
  INFORME: 'informe',
  VENCIDA: 'vencida',
  CERRADA_OK: 'cerrada_ok',
  CERRADA_CON_DESVIO: 'cerrada_desvio',
  CERRADA_NO_CUMPLIDA: 'cerrada_no_cumplida',
  CANCELADA: 'cancelada',
}

const COLOR: Record<string, string> = {
  RED: '#dc2626',
  ORANGE: '#ea580c',
  YELLOW: '#ca8a04',
  GREEN: '#16a34a',
  LIGHT_BLUE: '#0ea5e9',
  BLUE: '#2563eb',
  VIOLET: '#7c3aed',
  PINK: '#db2777',
  GREY: '#6b7280',
  GRAY: '#6b7280',
}
/** Los colores de Persat vienen con matices ("GREEN_3", "BLUE_2"). */
export const colorDe = (c: string) => COLOR[c.toUpperCase().replace(/_\d+$/, '')] ?? '#6b7280'

/** Clase de la orden según el tipo de tarea elegido en Persat. */
export function claseDeTarea(tarea: string | null): 'correctivo' | 'preventivo' | 'instalacion' | 'retiro' | 'insumos' {
  const t = (tarea ?? '').toUpperCase()
  if (/MANTENIMIENTO|PREVENTIV|TOMA DE CONTADOR|LECTURA/.test(t)) return 'preventivo'
  if (/INSUMO|TONER|TÓNER/.test(t)) return 'insumos'
  if (/INSTALACI|ENTREGA DE EQUIPO/.test(t)) return 'instalacion'
  if (/RETIRO/.test(t)) return 'retiro'
  return 'correctivo'
}

// ---------------------------------------------------------------- Importación

async function vinculos(tx: Transaccion, entidad: string) {
  const filas = await tx
    .select({ externoId: vinculosExternos.externoId, erpId: vinculosExternos.erpId })
    .from(vinculosExternos)
    .where(and(eq(vinculosExternos.sistema, SISTEMA), eq(vinculosExternos.entidad, entidad)))
  return new Map(filas.map((f) => [f.externoId, f.erpId]))
}

async function vincular(tx: Transaccion, entidad: string, externoId: string, erpId: string) {
  await tx
    .insert(vinculosExternos)
    .values({ sistema: SISTEMA, entidad, externoId, erpId })
    .onConflictDoUpdate({
      target: [vinculosExternos.empresaId, vinculosExternos.sistema, vinculosExternos.entidad, vinculosExternos.externoId],
      set: { erpId, actualizado: new Date() },
    })
}

/** Vincula a mano un cliente de Persat con uno del ERP (lo que el informe dejó sin pareja). */
export async function vincularCliente(tx: Transaccion, uidPersat: string, terceroId: string) {
  const [t] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.id, terceroId))
  if (!t) return { ok: false as const, error: 'Ese cliente no existe en el ERP.' }
  await vincular(tx, 'cliente', uidPersat, terceroId)
  return { ok: true as const }
}

const campoPropio = (c: DatosPersat['clientes'][number], nombre: RegExp) => {
  for (const v of Object.values(c.custom_fields ?? {})) {
    const f = v as { name?: string; value?: unknown }
    if (f?.name && nombre.test(f.name) && typeof f.value === 'string' && f.value.trim()) return f.value.trim()
  }
  return null
}

export async function importarPersat(tx: Transaccion, usuarioId: string, d: DatosPersat, o: Opciones = {}): Promise<Informe> {
  const r: Informe = {
    clientes: { porVinculo: 0, porCodigo: 0, porNombre: 0, creados: 0, sinPareja: 0 },
    equipos: { porVinculo: 0, porSerie: 0, creados: 0, sinCliente: 0 },
    tecnicos: { vinculados: 0, creados: 0 },
    etiquetas: { vinculadas: 0, creadas: 0 },
    tipoOrden: { creado: false, nuevaVersion: false },
    ordenes: { nuevas: 0, actualizadas: 0, sinCliente: 0, fotos: 0 },
    clientesSinPareja: [],
    avisos: [],
  }
  const aviso = (t: string) => {
    if (r.avisos.length < 200) r.avisos.push(t)
  }

  // ------------------------------------------------ Clientes
  const vClientes = await vinculos(tx, 'cliente')
  const lista = await tx
    .select({ id: terceros.id, codigo: terceros.codigo, razonSocial: terceros.razonSocial })
    .from(terceros)
    .where(eq(terceros.esCliente, true))
  const porCodigo = new Map(lista.map((t) => [normalizarCodigo(t.codigo), t]))
  const porNombre = new Map<string, (typeof lista)[number][]>()
  for (const t of lista)
    porNombre.set(normalizarNombre(t.razonSocial), [...(porNombre.get(normalizarNombre(t.razonSocial)) ?? []), t])
  const clienteDe = new Map<string, string>()
  for (const c of d.clientes) {
    const uid = c.uid_client.trim()
    const ya = vClientes.get(uid)
    if (ya) {
      clienteDe.set(uid, ya)
      r.clientes.porVinculo++
      continue
    }
    // "1234 SUCURSAL BROWN": una sucursal del cliente 1234.
    const prefijo = /^(\d+)\s+\S/.exec(uid)?.[1]
    const porCod = porCodigo.get(normalizarCodigo(uid)) ?? (prefijo ? porCodigo.get(normalizarCodigo(prefijo)) : undefined)
    if (porCod && seParecen(porCod.razonSocial, c.company_name)) {
      clienteDe.set(uid, porCod.id)
      await vincular(tx, 'cliente', uid, porCod.id)
      r.clientes.porCodigo++
      continue
    }
    const iguales = porNombre.get(normalizarNombre(c.company_name)) ?? []
    if (iguales.length === 1) {
      clienteDe.set(uid, iguales[0].id)
      await vincular(tx, 'cliente', uid, iguales[0].id)
      r.clientes.porNombre++
      continue
    }
    if (o.crearClientes) {
      const domicilio = [c.street, c.street_nbr].filter(Boolean).join(' ') || null
      const [nuevo] = await tx
        .insert(terceros)
        .values({
          codigo: `PS-${uid}`.slice(0, 20),
          razonSocial: c.company_name.trim().slice(0, 200),
          tipoDocumento: 99,
          condicionIva: 5,
          domicilio,
          localidad: campoPropio(c, /localidad/i) ?? c.city ?? null,
          email: campoPropio(c, /mail/i),
          telefono: campoPropio(c, /tel/i),
          notas: [
            c.company_description,
            campoPropio(c, /anotac/i),
            'Creado al migrar desde Persat: completar CUIT y condición de IVA.',
          ]
            .filter(Boolean)
            .join('\n'),
        })
        .onConflictDoNothing()
        .returning({ id: terceros.id })
      if (nuevo) {
        clienteDe.set(uid, nuevo.id)
        await vincular(tx, 'cliente', uid, nuevo.id)
        r.clientes.creados++
        continue
      }
    }
    r.clientes.sinPareja++
    r.clientesSinPareja.push({
      uid,
      nombre: c.company_name,
      motivo: porCod
        ? `el código coincide con "${porCod.razonSocial}" pero el nombre no se parece`
        : iguales.length > 1
          ? `hay ${iguales.length} clientes con ese nombre en el ERP`
          : 'no hay un cliente con ese código ni ese nombre',
    })
  }

  // ------------------------------------------------ Equipos
  const vEquipos = await vinculos(tx, 'equipo')
  const objeto = d.objetos[0]
  const campoObjeto = (re: RegExp) => objeto?.fields.find((f) => re.test(f.name))?.id
  const fSerie = String(campoObjeto(/serie/i) ?? 1)
  const fModelo = campoObjeto(/^modelo/i)
  const fUbicacion = campoObjeto(/ubica/i)
  const delErp = await tx.select({ id: equipos.id, serie: equipos.serie, terceroId: equipos.terceroId }).from(equipos)
  const porSerie = new Map(delErp.map((e) => [e.serie.trim().toUpperCase(), e]))
  const equipoDeTexto = new Map<string, string>()
  const creadosAhora = new Set<string>()
  const claveEquipo = (e: EquipoPersat) =>
    `${e.uid_client.trim()}|${String(e.fields[fSerie] ?? '')
      .trim()
      .toUpperCase()}`
  // Un equipo que pasó de un cliente a otro aparece en los dos: manda el último.
  const recientes = [...d.equipos].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''))
  for (const e of recientes) {
    const texto = String(e.fields[fSerie] ?? '').trim()
    const sm = separarSerieModelo(texto)
    if (!sm) continue
    const clave = claveEquipo(e)
    const ya = vEquipos.get(clave)
    if (ya) {
      equipoDeTexto.set(texto.toUpperCase(), ya)
      r.equipos.porVinculo++
      continue
    }
    const existente = porSerie.get(sm.serie)
    const terceroId = clienteDe.get(e.uid_client.trim()) ?? null
    if (existente) {
      equipoDeTexto.set(texto.toUpperCase(), existente.id)
      await vincular(tx, 'equipo', clave, existente.id)
      r.equipos.porSerie++
      if (terceroId && existente.terceroId && existente.terceroId !== terceroId)
        aviso(
          creadosAhora.has(existente.id)
            ? `Equipo ${sm.serie}: está en más de un cliente en Persat (quedó el último que lo tuvo).`
            : `Equipo ${sm.serie}: en Persat está en otro cliente que en el ERP (quedó el del ERP).`,
        )
      continue
    }
    if (!terceroId) {
      r.equipos.sinCliente++
      continue
    }
    const modelo = fModelo ? String(e.fields[String(fModelo)] ?? '').trim() || sm.modelo : sm.modelo
    const [nuevo] = await tx
      .insert(equipos)
      .values({
        serie: sm.serie,
        terceroId,
        comercializacion: 'servicio_tecnico',
        sector: fUbicacion ? String(e.fields[String(fUbicacion)] ?? '').trim() || null : null,
        observaciones: modelo ? `Modelo según Persat: ${modelo}` : null,
        codigoOrigen: `persat:${clave}`.slice(0, 200),
      })
      .onConflictDoNothing()
      .returning({ id: equipos.id })
    if (nuevo) {
      equipoDeTexto.set(texto.toUpperCase(), nuevo.id)
      porSerie.set(sm.serie, { id: nuevo.id, serie: sm.serie, terceroId })
      creadosAhora.add(nuevo.id)
      await vincular(tx, 'equipo', clave, nuevo.id)
      r.equipos.creados++
    }
  }
  const equipoDe = (texto: string) => {
    const t = texto.trim().toUpperCase()
    if (equipoDeTexto.has(t)) return equipoDeTexto.get(t)!
    const sm = separarSerieModelo(t)
    return sm ? (porSerie.get(sm.serie)?.id ?? null) : null
  }

  // ------------------------------------------------ Técnicos
  const vTecnicos = await vinculos(tx, 'tecnico')
  const delErpTec = await tx.select({ id: tecnicos.id, nombre: tecnicos.nombre }).from(tecnicos)
  const tecnicoDe = new Map<string, string>()
  for (const t of d.tecnicos) {
    const ext = String(t.user_id)
    const nombre = (t.real_name || t.name).trim()
    let id = vTecnicos.get(ext) ?? delErpTec.find((x) => normalizarNombre(x.nombre) === normalizarNombre(nombre))?.id
    if (id) r.tecnicos.vinculados++
    else {
      const [nuevo] = await tx
        .insert(tecnicos)
        .values({ codigo: `PS${ext}`.slice(0, 20), nombre, activo: !t.deleted })
        .onConflictDoNothing()
        .returning({ id: tecnicos.id })
      id = nuevo?.id
      if (id) r.tecnicos.creados++
    }
    if (id) {
      tecnicoDe.set(ext, id)
      await vincular(tx, 'tecnico', ext, id)
    }
  }

  // ------------------------------------------------ Etiquetas
  const delErpEt = await tx.select().from(etiquetasServicio)
  const etiquetaDe = new Map<number, string>()
  for (const e of d.etiquetas) {
    const nombre = e.name.trim().slice(0, 40)
    let id = delErpEt.find((x) => normalizarNombre(x.nombre) === normalizarNombre(nombre))?.id
    if (id) r.etiquetas.vinculadas++
    else {
      ;[{ id }] = await tx
        .insert(etiquetasServicio)
        .values({ nombre, color: colorDe(e.color) })
        .returning({ id: etiquetasServicio.id })
      r.etiquetas.creadas++
    }
    etiquetaDe.set(e.id, id)
    await vincular(tx, 'etiqueta', String(e.id), id)
  }
  const etiquetaUrgente = d.etiquetas.find((e) => /URGENTE/i.test(e.name))?.id
  const etiquetaContrato = d.etiquetas.find((e) => /CONTRATO/i.test(e.name))?.id

  // ------------------------------------------------ Tipo de orden (la versión publicada)
  const publicada =
    [...d.esquemasOt].filter((e) => e.production).sort((a, b) => b.version - a.version)[0] ??
    [...d.esquemasOt].sort((a, b) => b.version - a.version)[0]
  if (!publicada) {
    aviso('La cuenta de Persat no tiene tipos de orden.')
    return r
  }
  const p = plantillaDesdeEsquema(publicada)
  for (const x of p.omitidos) aviso(`Campo sin equivalente en el ERP: ${x}.`)
  const vTipo = await vinculos(tx, 'tipo_orden')
  const tipoId = vTipo.get(String(publicada.wo_group))
  const datosTipo = {
    codigo: 'PERSAT',
    nombre: publicada.name.trim().slice(0, 80),
    clase: 'correctivo',
    duracion: Math.min(1440, Math.max(5, publicada.default_service_time ?? 60)),
    plazoHoras: 48,
    instrucciones: p.instrucciones,
    devolucion: p.devolucion,
  }
  const antes = tipoId ? await plantillaVigente(tx, tipoId) : null
  const t = await guardarTipo(tx, usuarioId, datosTipo, tipoId)
  if (!t.ok) throw new Error(`No se pudo crear el tipo de orden: ${t.error}`)
  await vincular(tx, 'tipo_orden', String(publicada.wo_group), t.id)
  const plantilla = await plantillaVigente(tx, t.id)
  r.tipoOrden = { creado: !tipoId, nuevaVersion: !!tipoId && antes?.id !== plantilla?.id }
  const campos = new Map([...(plantilla?.instrucciones ?? []), ...(plantilla?.devolucion ?? [])].map((c) => [c.id, c]))
  // Los títulos de los campos de todas las versiones (para el texto de lo que no tiene campo).
  const tituloDe = new Map(
    d.esquemasOt
      .flatMap((e) => [...e.instructions_description.widgets, ...e.results_description.widgets])
      .map((w) => [w.id, w.title]),
  )
  const campoPorTitulo = (re: RegExp, donde: Campo[] = plantilla?.devolucion ?? []) => donde.find((c) => re.test(c.etiqueta))

  // ------------------------------------------------ Órdenes
  const vOrdenes = await vinculos(tx, 'orden')
  for (const x of d.ordenes) {
    const ext = String(x._id)
    const terceroId = clienteDe.get(x.client.uid_client.trim())
    if (!terceroId) {
      r.ordenes.sinCliente++
      continue
    }
    const pendientes: { campoId: string; urls: string[] }[] = []
    const existente = vOrdenes.get(ext)
    const ctx: Contexto = { campos, equipoDe, fotos: (campoId, urls) => pendientes.push({ campoId, urls }) }
    const ins = await valoresDesde(x.wo_data.instructions?.formvalues, ctx)
    const res = await valoresDesde(x.wo_data.results?.formvalues, ctx)
    const conTitulo = (fv: Record<string, unknown> | undefined) =>
      Object.entries(fv ?? {})
        .filter(([k, v]) => !campos.has(idCampo(k)) && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => `${tituloDe.get(k) ?? k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)

    const texto = (c: Campo | undefined, v: Valores) => (c && typeof v[c.id] === 'string' ? (v[c.id] as string) : null)
    const tarea = texto(campoPorTitulo(/tipo de tarea/i, plantilla?.instrucciones), ins.valores)
    const detalle = texto(campoPorTitulo(/detalle/i, plantilla?.instrucciones), ins.valores)
    const trabajos = (plantilla?.devolucion ?? [])
      .filter((c) => /trabajo|detalle de visita/i.test(c.etiqueta))
      .map((c) => res.valores[c.id])
      .flatMap((v) => (Array.isArray(v) ? [v.join(', ')] : typeof v === 'string' ? [v] : []))
      .filter(Boolean)
    const tareasPendientes = (plantilla?.devolucion ?? [])
      .filter((c) => /pendiente/i.test(c.etiqueta))
      .map((c) => res.valores[c.id])
      .flatMap((v) => (Array.isArray(v) ? [v.join(', ')] : typeof v === 'string' ? [v] : []))
      .filter(Boolean)
    const resultadoTecnico = texto(campoPorTitulo(/^estado$/i), res.valores)
    const cContador = (plantilla?.devolucion ?? []).find((c) => c.tipo === 'contador')
    const contador = cContador ? ((res.valores[cContador.id] as { contador?: number } | undefined)?.contador ?? null) : null
    const cEquipo = [...campos.values()].find((c) => c.tipo === 'equipo')
    const equipoId = cEquipo ? (((ins.valores[cEquipo.id] ?? res.valores[cEquipo.id]) as string | undefined) ?? null) : null
    const cFirma = (plantilla?.devolucion ?? []).find((c) => c.tipo === 'firma')
    const firmo = Object.entries(x.wo_data.results?.formvalues ?? {}).some(([k, v]) => cFirma && idCampo(k) === cFirma.id && v)

    const estado = ESTADO[x.state] ?? 'pendiente'
    const cerrada = estado.startsWith('cerrada')
    const asignada = x.assignation_info?.date ? fechaArgentina(x.assignation_info.date) : null
    const inicio = x.assignation_info?.starts_min ?? null
    const fecha = fechaArgentina(x.created)
    const llegadaMin = (() => {
      const c = campoPorTitulo(/llegada/i)
      const h = c ? (res.valores[c.id] as string | undefined) : undefined
      return h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : null
    })()
    const informada = x.wo_data.results?.last_updated ? new Date(x.wo_data.results.last_updated) : null
    const [responsable, ...acompanantes] = (x.assignation_info?.responsibles ?? [])
      .map((u) => tecnicoDe.get(String(u.user_id)))
      .filter((id): id is string => !!id)
    const etiquetas = (x.labels_ids ?? []).map((id) => etiquetaDe.get(id)).filter((id): id is string => !!id)
    const nota = [
      x.wo_data.results?.closing_info?.cause?.trim(),
      tareasPendientes.length ? `Pendiente: ${tareasPendientes.join('. ')}` : null,
      firmo ? 'El cliente firmó en Persat.' : null,
    ]
      .filter(Boolean)
      .join('\n')
    const fila = {
      fecha: fecha < (asignada ?? fecha) ? fecha : (asignada ?? fecha),
      terceroId,
      equipoId: equipoId && /^[0-9a-f-]{36}$/i.test(equipoId) ? equipoId : null,
      tipo: claseDeTarea(tarea),
      tipoOrdenId: t.id,
      plantillaId: plantilla?.id ?? null,
      instrucciones: ins.valores,
      resultados: x.wo_data.results?.formvalues ? res.valores : null,
      prioridad: etiquetaUrgente !== undefined && x.labels_ids?.includes(etiquetaUrgente) ? 'urgente' : 'normal',
      cobertura: etiquetaContrato !== undefined && x.labels_ids?.includes(etiquetaContrato) ? 'contrato' : 'cargo',
      falla: (detalle || tarea || x.wo_data.results?.closing_info?.cause || 'Orden migrada de Persat').slice(0, 2000),
      tecnicoId: responsable ?? null,
      programada: asignada,
      hora: inicio !== null ? aHora(inicio) : null,
      duracion: Math.min(1440, Math.max(5, x.wo_data.service_time ?? 60)),
      estado,
      solucion: trabajos.join('\n') || null,
      fechaResolucion: cerrada ? (informada ? fechaArgentina(informada.toISOString()) : (asignada ?? fecha)) : null,
      contador,
      llegada: asignada && llegadaMin !== null ? new Date(momento(asignada, llegadaMin)) : null,
      informada:
        informada && ['informe', ...Object.values(ESTADO).filter((e) => e.startsWith('cerrada'))].includes(estado)
          ? informada
          : null,
      cierreTecnico: resultadoTecnico
        ? /parcial/i.test(resultadoTecnico)
          ? 'desvio'
          : /pendiente|no /i.test(resultadoTecnico)
            ? 'no_cumplida'
            : 'ok'
        : null,
      notaCierre: nota || null,
      cerrada: cerrada ? (informada ?? new Date(`${asignada ?? fecha}T12:00:00-03:00`)) : null,
      motivoCancelacion: estado === 'cancelada' ? 'Cancelada en Persat' : null,
      origen: 'persat',
      observaciones:
        [
          `Persat N° ${ext}`,
          ...conTitulo(x.wo_data.instructions?.formvalues),
          ...conTitulo(x.wo_data.results?.formvalues),
          ...ins.sueltos.slice(0, 0),
        ]
          .join('\n')
          .slice(0, 4000) || null,
    } as const
    let ordenId = existente
    if (ordenId) {
      // Ya migrada: se actualiza lo que pudo cambiar en Persat (estado y respuestas), sin tocar las fotos ya bajadas.
      const [actual] = await tx
        .select({ resultados: ordenesServicio.resultados })
        .from(ordenesServicio)
        .where(eq(ordenesServicio.id, ordenId))
      if (!actual) {
        ordenId = undefined
      } else {
        const previas = (actual.resultados ?? {}) as Valores
        const resultados = fila.resultados
          ? Object.fromEntries(
              Object.entries({ ...fila.resultados, ...previas }).map(([k, v]) => [
                k,
                campos.get(k)?.tipo === 'fotos' ? (previas[k] ?? v) : (fila.resultados![k] ?? v),
              ]),
            )
          : actual.resultados
        await tx
          .update(ordenesServicio)
          .set({ ...fila, resultados })
          .where(eq(ordenesServicio.id, ordenId))
        r.ordenes.actualizadas++
      }
    }
    if (!ordenId) {
      const numero = await siguienteNumero(tx, 'orden_servicio')
      const [nueva] = await tx
        .insert(ordenesServicio)
        .values({ ...fila, numero, usuarioId })
        .returning({ id: ordenesServicio.id })
      ordenId = nueva.id
      await vincular(tx, 'orden', ext, ordenId)
      r.ordenes.nuevas++
      // Las fotos, solo al crearla (las URL de Persat duran poco y no se vuelven a bajar).
      if (o.bajarFoto && pendientes.length) {
        const conFotos: Valores = { ...(fila.resultados ?? {}) }
        for (const { campoId, urls } of pendientes) {
          const ids: string[] = []
          for (const url of urls) {
            const datos = await o.bajarFoto(url).catch(() => null)
            if (!datos?.length) continue
            const [a] = await tx
              .insert(archivosServicio)
              .values({
                ordenId,
                clase: 'foto',
                tipoMime: datos[0] === 0x89 ? 'image/png' : 'image/jpeg',
                tamano: datos.length,
                datos,
                usuarioId,
              })
              .returning({ id: archivosServicio.id })
            ids.push(a.id)
            r.ordenes.fotos++
          }
          if (ids.length) conFotos[campoId] = ids
        }
        await tx.update(ordenesServicio).set({ resultados: conFotos }).where(eq(ordenesServicio.id, ordenId))
      }
    }
    await tx.delete(ordenesServicioEtiquetas).where(eq(ordenesServicioEtiquetas.ordenId, ordenId))
    if (etiquetas.length)
      await tx
        .insert(ordenesServicioEtiquetas)
        .values([...new Set(etiquetas)].map((etiquetaId) => ({ ordenId: ordenId!, etiquetaId })))
    await tx.delete(ordenesServicioTecnicos).where(eq(ordenesServicioTecnicos.ordenId, ordenId))
    const extra = [...new Set(acompanantes)].filter((a) => a !== responsable)
    if (extra.length)
      await tx.insert(ordenesServicioTecnicos).values(extra.map((tecnicoId) => ({ ordenId: ordenId!, tecnicoId })))
  }

  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'importacion_persat',
    despues: { clientes: r.clientes, equipos: r.equipos, ordenes: r.ordenes },
  })
  return r
}
