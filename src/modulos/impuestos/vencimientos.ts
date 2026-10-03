import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { configuracionImpuestos, empresas, obligaciones, presentaciones, vencimientos } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { hoyArgentina } from '../../lib/fechas'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'

/**
 * Calendario de vencimientos impositivos con avisos por email. ARCA publica
 * cada año el calendario por terminación de CUIT: acá se arranca con días
 * aproximados según la terminación y cada vencimiento se puede corregir con
 * la fecha exacta. Las obligaciones de IVA y SICORE se dan por cumplidas
 * solas cuando el período se marca presentado.
 */

const SISTEMA = '00000000-0000-0000-0000-000000000000'

/**
 * Días aproximados (del mes siguiente al período) por terminación del CUIT,
 * para arrancar. Se corrigen en cada vencimiento con el calendario oficial.
 */
export function diasSugeridos(cuit: string) {
  const t = Number(cuit.replace(/\D/g, '').slice(-1) || 0)
  return {
    iva: [18, 18, 19, 19, 20, 20, 21, 21, 22, 22][t],
    sicore: [13, 13, 14, 14, 15, 15, 16, 16, 17, 17][t],
    iibb: [15, 15, 15, 16, 16, 16, 17, 17, 18, 18][t],
  }
}

/** Fecha del vencimiento de un período: el día del mes siguiente (o el último), corrido al lunes si es fin de semana. */
export function fechaVencimiento(periodo: string, dia: number) {
  const [a, m] = periodo.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate()
  const d = new Date(Date.UTC(a, m, Math.min(dia, ultimo)))
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const mover = (periodo: string, n: number) => {
  const [a, m] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ---------------------------------------------------------------- Configuración

export async function configuracion(tx: Transaccion) {
  const [c] = await tx.select().from(configuracionImpuestos).limit(1)
  return (
    c ?? { emailContador: null as string | null, emailAvisos: null as string | null, avisarDias: 3, paqueteAlPresentar: true }
  )
}

const EsquemaConfig = z.object({
  emailContador: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email({ error: 'El email del contador no es válido.' }).nullable()),
  emailAvisos: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email({ error: 'El email para los avisos no es válido.' }).nullable()),
  avisarDias: z.coerce.number().int().min(0, { error: 'Los días van de 0 a 15.' }).max(15, { error: 'Los días van de 0 a 15.' }),
  paqueteAlPresentar: z.boolean(),
})

export async function guardarConfiguracion(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaConfig.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  await tx
    .insert(configuracionImpuestos)
    .values(p.data)
    .onConflictDoUpdate({ target: configuracionImpuestos.empresaId, set: p.data })
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'configuracion_impuestos', despues: p.data })
  return { ok: true as const }
}

// ---------------------------------------------------------------- Obligaciones

/**
 * Recordatorio mensual de Mis Comprobantes: ARCA no tiene un servicio web
 * para bajar los comprobantes recibidos, así que se avisa antes del IVA que
 * hay que descargarlos y cruzarlos (Compras → Importar → Mis Comprobantes).
 */
export const MIS_COMPROBANTES = 'Mis Comprobantes de ARCA: bajar y cruzar las compras del mes'

/** Crea las obligaciones de siempre (IVA, SICORE, IIBB y el cruce de Mis Comprobantes) con los días según el CUIT. */
export async function obligacionesDeLaEmpresa(tx: Transaccion, empresaId: string) {
  let lista = await tx.select().from(obligaciones).orderBy(asc(obligaciones.dia), asc(obligaciones.nombre))
  // Las empresas que ya tenían calendario también reciben el recordatorio (se puede desactivar).
  if (lista.length && !lista.some((o) => o.nombre === MIS_COMPROBANTES)) {
    const iva = lista.find((o) => o.impuesto === 'iva_digital')?.dia ?? 18
    await tx
      .insert(obligaciones)
      .values({ impuesto: 'otro', nombre: MIS_COMPROBANTES, dia: Math.max(5, iva - 7) })
      .onConflictDoNothing()
    lista = await tx.select().from(obligaciones).orderBy(asc(obligaciones.dia), asc(obligaciones.nombre))
  }
  if (!lista.length) {
    const [e] = await tx.select({ cuit: empresas.cuit }).from(empresas).where(eq(empresas.id, empresaId))
    const d = diasSugeridos(e?.cuit ?? '')
    await tx
      .insert(obligaciones)
      .values([
        { impuesto: 'iva_digital', nombre: 'IVA (F.2002 y Libro IVA Digital)', dia: d.iva },
        { impuesto: 'sicore', nombre: 'SICORE: retenciones de Ganancias', dia: d.sicore },
        { impuesto: 'iibb', nombre: 'Ingresos Brutos', dia: d.iibb },
        { impuesto: 'otro', nombre: MIS_COMPROBANTES, dia: Math.max(5, d.iva - 7) },
      ])
      .onConflictDoNothing()
    lista = await tx.select().from(obligaciones).orderBy(asc(obligaciones.dia), asc(obligaciones.nombre))
  }
  return lista
}

const EsquemaObligacion = z.object({
  nombre: z.string().trim().min(3, { error: 'Escribí el nombre.' }).max(80),
  impuesto: z.enum(['iva_digital', 'sicore', 'iibb', 'otro']).default('otro'),
  dia: z.coerce.number().int().min(1, { error: 'El día va de 1 a 31.' }).max(31, { error: 'El día va de 1 a 31.' }),
  activa: z.boolean().default(true),
})

export async function guardarObligacion(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaObligacion.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  const [mismo] = await tx.select({ id: obligaciones.id }).from(obligaciones).where(eq(obligaciones.nombre, p.data.nombre))
  if (mismo && mismo.id !== id) return { ok: false as const, error: 'Ya hay una obligación con ese nombre.' }
  if (id) {
    await tx.update(obligaciones).set(p.data).where(eq(obligaciones.id, id))
    // Las fechas no corregidas a mano de los vencimientos pendientes siguen el nuevo día.
    const pendientes = await tx
      .select()
      .from(vencimientos)
      .where(and(eq(vencimientos.obligacionId, id), eq(vencimientos.ajustada, false), isNull(vencimientos.cumplida)))
    for (const v of pendientes)
      await tx
        .update(vencimientos)
        .set({ fecha: fechaVencimiento(v.periodo, p.data.dia) })
        .where(eq(vencimientos.id, v.id))
  } else await tx.insert(obligaciones).values(p.data)
  await auditar(tx, { usuarioId, accion: id ? 'modificacion' : 'alta', entidad: 'obligacion', entidadId: id, despues: p.data })
  return { ok: true as const }
}

// ---------------------------------------------------------------- Vencimientos

/** Crea los vencimientos que falten desde el período anterior hasta dos meses adelante. */
export async function generarVencimientos(tx: Transaccion, empresaId: string, hoy = hoyArgentina()) {
  const lista = (await obligacionesDeLaEmpresa(tx, empresaId)).filter((o) => o.activa)
  const actual = hoy.slice(0, 7)
  const periodos = [-2, -1, 0, 1].map((n) => mover(actual, n))
  const valores = lista.flatMap((o) =>
    periodos.map((periodo) => ({ obligacionId: o.id, periodo, fecha: fechaVencimiento(periodo, o.dia) })),
  )
  if (valores.length) await tx.insert(vencimientos).values(valores).onConflictDoNothing()
}

/** Para IVA y SICORE: cumplido si el período está presentado. */
async function presentados(tx: Transaccion, periodos: string[]) {
  if (!periodos.length) return new Set<string>()
  const filas = await tx
    .select({ impuesto: presentaciones.impuesto, periodo: presentaciones.periodo })
    .from(presentaciones)
    .where(and(eq(presentaciones.estado, 'presentada'), inArray(presentaciones.periodo, periodos)))
  return new Set(filas.map((f) => `${f.impuesto}|${f.periodo}`))
}

export type EstadoVencimiento = 'cumplido' | 'vencido' | 'proximo' | 'pendiente'

export async function calendario(tx: Transaccion, desde: string, hasta: string, hoy = hoyArgentina(), avisarDias = 3) {
  const filas = await tx
    .select({ v: vencimientos, o: obligaciones })
    .from(vencimientos)
    .innerJoin(obligaciones, eq(obligaciones.id, vencimientos.obligacionId))
    .where(and(gte(vencimientos.fecha, desde), lte(vencimientos.fecha, hasta), eq(obligaciones.activa, true)))
    .orderBy(asc(vencimientos.fecha), asc(obligaciones.nombre))
  const hechos = await presentados(tx, [...new Set(filas.map((f) => f.v.periodo))])
  const limite = new Date(`${hoy}T12:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + avisarDias)
  const proximo = limite.toISOString().slice(0, 10)
  return filas.map(({ v, o }) => {
    const cumplido = !!v.cumplida || hechos.has(`${o.impuesto}|${v.periodo}`)
    const estado: EstadoVencimiento = cumplido
      ? 'cumplido'
      : v.fecha < hoy
        ? 'vencido'
        : v.fecha <= proximo
          ? 'proximo'
          : 'pendiente'
    return {
      id: v.id,
      obligacionId: o.id,
      nombre: o.nombre,
      impuesto: o.impuesto,
      periodo: v.periodo,
      fecha: v.fecha,
      ajustada: v.ajustada,
      cumplidaAMano: !!v.cumplida,
      automatica: o.impuesto === 'iva_digital' || o.impuesto === 'sicore',
      estado,
    }
  })
}

export async function ajustarFecha(tx: Transaccion, usuarioId: string, id: string, fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false as const, error: 'Fecha inválida.' }
  const [v] = await tx
    .update(vencimientos)
    .set({ fecha, ajustada: true, avisado: null, avisadoVencido: null })
    .where(eq(vencimientos.id, id))
    .returning()
  if (!v) return { ok: false as const, error: 'No existe.' }
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'vencimiento', entidadId: id, despues: { fecha } })
  return { ok: true as const }
}

/** Marca cumplida (o no) una obligación manual (IIBB, otras). */
export async function marcarCumplida(tx: Transaccion, usuarioId: string, id: string, cumplida: boolean) {
  const [v] = await tx
    .update(vencimientos)
    .set({ cumplida: cumplida ? new Date() : null })
    .where(eq(vencimientos.id, id))
    .returning()
  if (!v) return { ok: false as const, error: 'No existe.' }
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'vencimiento', entidadId: id, despues: { cumplida } })
  return { ok: true as const }
}

// ---------------------------------------------------------------- Avisos

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .replace(',', '')
const periodoCorto = (p: string) => p.split('-').reverse().join('/')

/**
 * Lo que corre la tarea programada: crea los vencimientos que falten y manda
 * un aviso unos días antes de cada uno que no esté cumplido, y otro si se
 * pasó la fecha. Cada aviso sale una sola vez.
 */
export async function avisarVencimientos(tx: Transaccion, empresaId: string, hoy = hoyArgentina()) {
  await generarVencimientos(tx, empresaId, hoy)
  const cfg = await configuracion(tx)
  const para = emailValido(cfg.emailAvisos) ? cfg.emailAvisos : emailValido(cfg.emailContador) ? cfg.emailContador : null
  if (!para) return { avisos: 0 }
  const desde = new Date(`${hoy}T12:00:00Z`)
  desde.setUTCDate(desde.getUTCDate() - 40)
  const hasta = new Date(`${hoy}T12:00:00Z`)
  hasta.setUTCDate(hasta.getUTCDate() + cfg.avisarDias)
  const lista = await calendario(tx, desde.toISOString().slice(0, 10), hasta.toISOString().slice(0, 10), hoy, cfg.avisarDias)
  const [e] = await tx.select({ razonSocial: empresas.razonSocial }).from(empresas).where(eq(empresas.id, empresaId))
  let avisos = 0
  for (const v of lista) {
    if (v.estado !== 'proximo' && v.estado !== 'vencido') continue
    const [fila] = await tx.select().from(vencimientos).where(eq(vencimientos.id, v.id))
    const vencido = v.estado === 'vencido'
    if (vencido ? fila.avisadoVencido : fila.avisado) continue
    const asunto = vencido
      ? `Vencido: ${v.nombre} de ${periodoCorto(v.periodo)}`
      : `Vence el ${v.fecha.split('-').reverse().join('/')}: ${v.nombre} de ${periodoCorto(v.periodo)}`
    const texto =
      `${e?.razonSocial ?? ''}\n\n` +
      (vencido
        ? `${v.nombre} del período ${periodoCorto(v.periodo)} venció el ${fechaLarga(v.fecha)} y no figura presentada en el sistema.`
        : `${v.nombre} del período ${periodoCorto(v.periodo)} vence el ${fechaLarga(v.fecha)} y todavía no figura presentada.`) +
      `\n\n${v.automatica ? 'Se da por presentada cuando se marca en Impuestos con el número de transacción.' : 'Cuando esté presentada, marcala como cumplida en Impuestos › Vencimientos.'}` +
      `\n\n(La fecha sale del calendario cargado en el sistema: confirmala con el calendario oficial.)`
    await encolarCorreo(tx, { para, asunto, texto, entidad: 'vencimiento', entidadId: v.id, usuarioId: SISTEMA })
    await tx
      .update(vencimientos)
      .set(vencido ? { avisadoVencido: new Date() } : { avisado: new Date() })
      .where(eq(vencimientos.id, v.id))
    avisos++
  }
  return { avisos }
}
