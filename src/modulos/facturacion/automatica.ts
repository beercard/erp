import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { comprobantes, facturasRecurrentes, lotesFacturacion, puntosVenta, terceros, type RenglonGuardado } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { validarCuit } from '../../lib/cuit'
import { enlaceDeComprobante } from '../../lib/enlaces'
import { hoyArgentina, sumarDias } from '../../lib/fechas'
import { consultarPadron } from '../arca/padron'
import { TASAS_IVA } from '../comercial/calculo'
import { EsquemaItem, primerError } from '../comercial/documentos'
import { formatearNumero } from '../comercial/formato'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { guardarTercero } from '../maestros/terceros'
import { emitirComprobante, empresaEmisora, guardarComprobante, type CrearCliente } from './comprobantes'
import { nombreComprobante } from './tipos'

/**
 * Facturación automática: lo que se factura sin que nadie arme la factura a
 * mano. Tres caminos que terminan igual (borrador → CAE → email al cliente):
 *
 * - Facturas recurrentes (abonos): la tarea periódica las arma cuando toca.
 * - Lotes: una planilla o un pedido por la API con muchas facturas, que se
 *   autorizan de a poco.
 * - Una factura suelta por la API (POST /api/v1/facturas).
 */

// ------------------------------------------------------------ Utilidades

/** "21" → 5 (el código de alícuota de ARCA). También acepta el código. */
export function alicuotaDesdeTexto(v: string | number): number | null {
  const t = String(v).trim().replace(',', '.').replace('%', '')
  const codigo = Object.entries(TASAS_IVA).find(([, p]) => Number(p) === Number(t))
  return codigo ? Number(codigo[0]) : null
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** "2026-10-03" → "octubre 2026". */
export const nombrePeriodo = (fecha: string) => `${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}`

/** Suma meses a una fecha (el día queda igual: las recurrentes van del 1 al 28). */
export function sumarMeses(fecha: string, meses: number) {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1 + meses, d)).toISOString().slice(0, 10)
}

/** Reemplaza {periodo} (y {mes}) por el período facturado. */
export const conPeriodo = (texto: string, desde: string) => texto.replace(/\{(periodo|mes)\}/gi, nombrePeriodo(desde))

/** Primer punto de venta electrónico activo (el número). */
export async function puntoVentaElectronico(tx: Transaccion) {
  const [pv] = await tx
    .select({ numero: puntosVenta.numero })
    .from(puntosVenta)
    .where(and(eq(puntosVenta.activo, true), eq(puntosVenta.tipo, 'electronico')))
    .orderBy(asc(puntosVenta.numero))
    .limit(1)
  return pv?.numero ?? null
}

// ---------------------------------------------------- Cliente por documento

export const EsquemaClienteExterno = z.object({
  documento: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 7 && v.length <= 11, { error: 'El CUIT o DNI del cliente no es válido.' }),
  razonSocial: z.string().trim().max(200).optional().nullable(),
  /** 1 responsable inscripto, 4 exento, 5 consumidor final, 6 monotributo. */
  condicionIva: z.coerce.number().int().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  domicilio: z.string().trim().max(200).optional().nullable(),
})
export type ClienteExterno = z.infer<typeof EsquemaClienteExterno>

/** Busca por padrón de ARCA la razón social y la condición de un CUIT nuevo (inyectable para las pruebas). */
export type BuscarPadron = (
  tx: Transaccion,
  cuit: string,
) => Promise<{ razonSocial: string; condicionIva: number; domicilio: string | null; localidad: string | null } | null>

/**
 * El cliente con ese CUIT o DNI; si no está, se da de alta con los datos que
 * vinieron (o los del padrón de ARCA, si es un CUIT y no vino el nombre).
 */
export async function clientePorDocumento(
  tx: Transaccion,
  usuarioId: string | null,
  entrada: z.input<typeof EsquemaClienteExterno>,
  buscarPadron?: BuscarPadron,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const p = EsquemaClienteExterno.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const c = p.data
  const [existe] = await tx
    .select({ id: terceros.id, email: terceros.email })
    .from(terceros)
    .where(and(eq(terceros.numeroDocumento, c.documento), eq(terceros.esCliente, true)))
    .limit(1)
  if (existe) {
    if (!existe.email && emailValido(c.email))
      await tx.update(terceros).set({ email: c.email!.trim() }).where(eq(terceros.id, existe.id))
    return { ok: true, id: existe.id }
  }
  const esCuit = c.documento.length === 11
  if (esCuit && !validarCuit(c.documento).valido) return { ok: false, error: `El CUIT ${c.documento} no es válido.` }
  let razonSocial = c.razonSocial?.trim() || null
  let condicionIva = c.condicionIva ?? null
  let domicilio = c.domicilio?.trim() || null
  let localidad: string | null = null
  if (esCuit && (!razonSocial || !condicionIva) && buscarPadron) {
    const p = await buscarPadron(tx, c.documento).catch(() => null)
    if (p) {
      razonSocial ??= p.razonSocial
      condicionIva ??= p.condicionIva
      domicilio ??= p.domicilio
      localidad = p.localidad
    }
  }
  if (!razonSocial) return { ok: false, error: `Falta la razón social del cliente ${c.documento}.` }
  const r = await guardarTercero(tx, usuarioId, {
    razonSocial,
    esCliente: true,
    esProveedor: false,
    tipoDocumento: esCuit ? 80 : 96,
    numeroDocumento: c.documento,
    condicionIva: condicionIva ?? (esCuit ? 1 : 5),
    email: emailValido(c.email) ? c.email!.trim() : '',
    domicilio,
    localidad,
  })
  if (!r.ok) return { ok: false, error: r.mensaje ?? Object.values(r.errores)[0] ?? 'No se pudo dar de alta el cliente.' }
  return { ok: true, id: r.id }
}

/** Busca un CUIT en el padrón de ARCA con el certificado de la empresa (para dar de alta clientes nuevos). */
export const buscarEnPadron: BuscarPadron = async (tx, cuit) => {
  const e = await empresaEmisora(tx)
  if (!e) return null
  const r = await consultarPadron(tx, e.cuit, cuit)
  return r.ok && r.datos.razonSocial
    ? {
        razonSocial: r.datos.razonSocial,
        condicionIva: r.datos.condicionIva,
        domicilio: r.datos.domicilio,
        localidad: r.datos.localidad,
      }
    : null
}

// ------------------------------------------------ Autorizar y mandar por email

/** Encola el email con el enlace a la factura (si el cliente tiene email). */
export async function mandarFactura(tx: Transaccion, empresaId: string, comprobanteId: string, usuarioId: string | null = null) {
  const [f] = await tx
    .select({
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      fecha: comprobantes.fecha,
      total: comprobantes.total,
      vencimiento: comprobantes.vencimiento,
      estado: comprobantes.estado,
      email: terceros.email,
      cliente: terceros.razonSocial,
    })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .where(eq(comprobantes.id, comprobanteId))
  if (!f || f.estado !== 'autorizado' || !f.numero) return { ok: false as const, error: 'La factura no está autorizada.' }
  if (!emailValido(f.email)) return { ok: false as const, error: 'El cliente no tiene email.' }
  const emisora = await empresaEmisora(tx)
  const e = emisora ? { nombre: emisora.nombreFantasia ?? emisora.razonSocial } : null
  const nombre = `${nombreComprobante(f.tipo)} ${formatearNumero(f.puntoVenta, f.numero)}`
  const importe = Number(f.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  await encolarCorreo(tx, {
    para: f.email!,
    asunto: `${nombre} de ${e?.nombre ?? 'tu proveedor'}`,
    texto:
      `Hola ${f.cliente}:\n\n` +
      `Te mandamos la ${nombre} del ${f.fecha.split('-').reverse().join('/')} por ${importe}` +
      (f.vencimiento ? `, que vence el ${f.vencimiento.split('-').reverse().join('/')}` : '') +
      `.\n\nLa ves, la imprimís o la guardás en PDF desde acá:\n${enlaceDeComprobante(empresaId, comprobanteId)}\n\n` +
      `Gracias.\n${e?.nombre ?? ''}`,
    entidad: 'comprobante',
    entidadId: comprobanteId,
    usuarioId,
  })
  return { ok: true as const }
}

export type Entrega = { ok: true; numero: number | null; cae: string | null; enviado: boolean } | { ok: false; error: string }

/** Autoriza el borrador en ARCA (fuera de toda transacción) y lo manda por email, según se pida. */
export async function autorizarYMandar(
  empresaId: string,
  comprobanteId: string,
  o: { autorizar: boolean; enviar: boolean; usuarioId?: string | null },
  crearCliente: CrearCliente,
  hoy = hoyArgentina(),
): Promise<Entrega> {
  if (!o.autorizar) return { ok: true, numero: null, cae: null, enviado: false }
  const e = await emitirComprobante(empresaId, o.usuarioId ?? null, comprobanteId, crearCliente, hoy)
  if (!e.ok) return { ok: false, error: e.error }
  let enviado = false
  if (o.enviar) {
    const m = await conEmpresa(empresaId, (tx) => mandarFactura(tx, empresaId, comprobanteId, o.usuarioId ?? null))
    enviado = m.ok
  }
  return { ok: true, numero: e.numero, cae: e.cae, enviado }
}

// ------------------------------------------------------ Facturas recurrentes

const EsquemaRecurrente = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  nombre: z.string().trim().min(2, { error: 'Poné un nombre (por ejemplo, "Abono mensual").' }).max(120),
  cadaMeses: z.coerce
    .number()
    .int()
    .refine((v) => [1, 2, 3, 6, 12].includes(v), { error: 'La frecuencia no es válida.' }),
  proxima: z.iso.date({ error: 'Elegí la fecha de la próxima factura.' }).refine((v) => Number(v.slice(8)) <= 28, {
    error: 'El día de facturación va del 1 al 28 (para que exista en todos los meses).',
  }),
  hasta: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .pipe(z.iso.date().nullable()),
  puntoVenta: z.coerce.number().int().min(1, { error: 'Elegí el punto de venta.' }),
  concepto: z.coerce.number().int().min(1).max(3),
  diasVencimiento: z.coerce.number().int().min(0).max(120),
  renglones: z.array(EsquemaItem).min(1, { error: 'Agregá al menos un renglón.' }).max(50),
  observaciones: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  autorizar: z.boolean(),
  enviar: z.boolean(),
})

export async function guardarRecurrente(tx: Transaccion, usuarioId: string | null, entrada: unknown, id?: string) {
  const p = EsquemaRecurrente.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  if (d.hasta && d.hasta < d.proxima) return { ok: false as const, error: 'La fecha de fin es anterior a la próxima factura.' }
  const [cliente] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.id, d.terceroId))
  if (!cliente) return { ok: false as const, error: 'Ese cliente ya no existe.' }
  const valores = { ...d, renglones: d.renglones as RenglonGuardado[] }
  if (id) {
    const [r] = await tx
      .update(facturasRecurrentes)
      .set({ ...valores, ultimoError: null, actualizado: new Date() })
      .where(eq(facturasRecurrentes.id, id))
      .returning({ id: facturasRecurrentes.id })
    if (!r) return { ok: false as const, error: 'Esa factura recurrente ya no existe.' }
    await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'factura_recurrente', entidadId: id, despues: valores })
    return { ok: true as const, id }
  }
  const [r] = await tx.insert(facturasRecurrentes).values(valores).returning({ id: facturasRecurrentes.id })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'factura_recurrente', entidadId: r.id, despues: valores })
  return { ok: true as const, id: r.id }
}

export async function listarRecurrentes(tx: Transaccion) {
  return tx
    .select({
      id: facturasRecurrentes.id,
      nombre: facturasRecurrentes.nombre,
      cliente: terceros.razonSocial,
      terceroId: facturasRecurrentes.terceroId,
      cadaMeses: facturasRecurrentes.cadaMeses,
      proxima: facturasRecurrentes.proxima,
      hasta: facturasRecurrentes.hasta,
      renglones: facturasRecurrentes.renglones,
      autorizar: facturasRecurrentes.autorizar,
      enviar: facturasRecurrentes.enviar,
      activa: facturasRecurrentes.activa,
      emitidas: facturasRecurrentes.emitidas,
      ultimaFacturaId: facturasRecurrentes.ultimaFacturaId,
      ultimoError: facturasRecurrentes.ultimoError,
    })
    .from(facturasRecurrentes)
    .innerJoin(terceros, eq(terceros.id, facturasRecurrentes.terceroId))
    .orderBy(asc(facturasRecurrentes.proxima), asc(terceros.razonSocial))
}

export async function obtenerRecurrente(tx: Transaccion, id: string) {
  const [r] = await tx.select().from(facturasRecurrentes).where(eq(facturasRecurrentes.id, id))
  return r ?? null
}

export async function activarRecurrente(tx: Transaccion, usuarioId: string | null, id: string, activa: boolean) {
  await tx.update(facturasRecurrentes).set({ activa, actualizado: new Date() }).where(eq(facturasRecurrentes.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'factura_recurrente', entidadId: id, despues: { activa } })
  return { ok: true as const }
}

export async function eliminarRecurrente(tx: Transaccion, usuarioId: string | null, id: string) {
  await tx.delete(facturasRecurrentes).where(eq(facturasRecurrentes.id, id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'factura_recurrente', entidadId: id })
  return { ok: true as const }
}

/**
 * Arma el borrador de una recurrente (en la transacción, con la fila
 * bloqueada) y corre la próxima fecha: aunque la autorización falle después,
 * la misma vuelta no se factura dos veces.
 */
export async function prepararRecurrente(tx: Transaccion, id: string, hoy: string) {
  const [r] = await tx
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, id), eq(facturasRecurrentes.activa, true), lte(facturasRecurrentes.proxima, hoy)))
    .for('update', { skipLocked: true })
  if (!r) return null
  const desde = r.proxima
  const siguiente = sumarMeses(desde, r.cadaMeses)
  const servicio = r.concepto !== 1
  const f = await guardarComprobante(tx, null, {
    clase: 'factura',
    puntoVenta: r.puntoVenta,
    terceroId: r.terceroId,
    fecha: hoy,
    moneda: 'PES',
    cotizacion: '1',
    concepto: r.concepto,
    servicioDesde: servicio ? desde : null,
    servicioHasta: servicio ? sumarDias(siguiente, -1) : null,
    vencimiento: servicio ? sumarDias(hoy, r.diasVencimiento) : null,
    observaciones: r.observaciones ? conPeriodo(r.observaciones, desde) : null,
    items: r.renglones.map((i) => ({ ...i, descripcion: conPeriodo(i.descripcion, desde) })),
  })
  const sigue = !r.hasta || siguiente <= r.hasta
  await tx
    .update(facturasRecurrentes)
    .set({
      proxima: siguiente,
      activa: sigue,
      ultimaFacturaId: f.ok ? f.id : r.ultimaFacturaId,
      ultimoError: f.ok ? null : `${desde}: ${f.error}`,
      emitidas: f.ok ? r.emitidas + 1 : r.emitidas,
      actualizado: new Date(),
    })
    .where(eq(facturasRecurrentes.id, id))
  return f.ok ? { id: f.id, autorizar: r.autorizar, enviar: r.enviar } : { error: f.error }
}

/** Factura las recurrentes que vencieron hasta hoy. Una por una, cada una en su transacción. */
export async function facturarRecurrentes(empresaId: string, crearCliente: CrearCliente, hoy = hoyArgentina(), limite = 50) {
  const vencidas = await conEmpresa(empresaId, (tx) =>
    tx
      .select({ id: facturasRecurrentes.id })
      .from(facturasRecurrentes)
      .where(and(eq(facturasRecurrentes.activa, true), lte(facturasRecurrentes.proxima, hoy)))
      .orderBy(asc(facturasRecurrentes.proxima))
      .limit(limite),
  )
  let emitidas = 0
  let errores = 0
  for (const v of vencidas) {
    const prep = await conEmpresa(empresaId, (tx) => prepararRecurrente(tx, v.id, hoy)).catch((e: Error) => ({
      error: e.message,
    }))
    if (!prep) continue
    if ('error' in prep) {
      errores++
      continue
    }
    const e = await autorizarYMandar(empresaId, prep.id, prep, crearCliente, hoy)
    if (e.ok) emitidas++
    else {
      errores++
      await conEmpresa(empresaId, (tx) =>
        tx
          .update(facturasRecurrentes)
          .set({ ultimoError: `La factura quedó en borrador: ${e.error}` })
          .where(eq(facturasRecurrentes.id, v.id)),
      )
    }
  }
  return { emitidas, errores }
}

// ------------------------------------------------------------------- Lotes

/**
 * Borrador de una factura que viene de afuera (planilla, API): busca o da de
 * alta al cliente y guarda la factura. Si trae referencia externa y ya hay una
 * factura con ella, devuelve esa (repetir el pedido no factura dos veces).
 */
export async function borradorExterno(
  tx: Transaccion,
  usuarioId: string | null,
  f: FacturaDeLote,
  puntoVenta: number,
  hoy: string,
  buscarPadron?: BuscarPadron,
): Promise<{ ok: true; id: string; repetida: boolean } | { ok: false; error: string }> {
  if (f.referencia) {
    const [ya] = await tx
      .select({ id: comprobantes.id })
      .from(comprobantes)
      .where(eq(comprobantes.referenciaExterna, f.referencia))
    if (ya) return { ok: true, id: ya.id, repetida: true }
  }
  const c = await clientePorDocumento(tx, usuarioId, f.cliente, buscarPadron)
  if (!c.ok) return c
  const concepto = f.concepto ?? 1
  const servicio = concepto !== 1
  const fecha = f.fecha ?? hoy
  const inicioMes = `${fecha.slice(0, 7)}-01`
  const g = await guardarComprobante(tx, usuarioId, {
    clase: 'factura',
    puntoVenta,
    terceroId: c.id,
    fecha,
    moneda: 'PES',
    cotizacion: '1',
    concepto,
    servicioDesde: servicio ? (f.servicioDesde ?? inicioMes) : null,
    servicioHasta: servicio ? (f.servicioHasta ?? sumarDias(sumarMeses(inicioMes, 1), -1)) : null,
    vencimiento: servicio ? (f.vencimiento ?? sumarDias(fecha, 10)) : null,
    observaciones: f.observaciones ?? null,
    items: f.renglones,
  })
  if (!g.ok) return g
  if (f.referencia) await tx.update(comprobantes).set({ referenciaExterna: f.referencia }).where(eq(comprobantes.id, g.id))
  return { ok: true, id: g.id, repetida: false }
}

export type FacturaDeLote = {
  /** Identificador del sistema de origen (opcional). */
  referencia?: string | null
  cliente: z.input<typeof EsquemaClienteExterno>
  fecha?: string
  concepto?: number
  servicioDesde?: string | null
  servicioHasta?: string | null
  vencimiento?: string | null
  observaciones?: string | null
  renglones: RenglonGuardado[]
}

/**
 * Arma un lote: da de alta a los clientes nuevos y guarda cada factura como
 * borrador. Si una falla, se informa con su número de orden y las demás siguen.
 */
export async function crearLote(
  tx: Transaccion,
  usuarioId: string | null,
  d: { nombre: string; autorizar: boolean; enviar: boolean; puntoVenta?: number | null; facturas: FacturaDeLote[] },
  hoy = hoyArgentina(),
  buscarPadron?: BuscarPadron,
) {
  if (!d.facturas.length) return { ok: false as const, error: 'No hay facturas para armar.' }
  if (d.facturas.length > 500) return { ok: false as const, error: 'Van hasta 500 facturas por lote.' }
  const puntoVenta = d.puntoVenta ?? (await puntoVentaElectronico(tx))
  if (!puntoVenta) return { ok: false as const, error: 'No hay un punto de venta electrónico para facturar.' }
  const ids: string[] = []
  const errores: { orden: number; error: string }[] = []
  for (const [i, f] of d.facturas.entries()) {
    const g = await borradorExterno(tx, usuarioId, f, puntoVenta, hoy, buscarPadron)
    if (g.ok) {
      if (!ids.includes(g.id)) ids.push(g.id)
    } else errores.push({ orden: i + 1, error: g.error })
  }
  if (!ids.length) return { ok: false as const, error: 'No se pudo armar ninguna factura.', errores }
  const [lote] = await tx
    .insert(lotesFacturacion)
    .values({ nombre: d.nombre.slice(0, 120), comprobantes: ids, autorizar: d.autorizar, enviar: d.enviar, usuarioId })
    .returning({ id: lotesFacturacion.id })
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'lote_facturacion',
    entidadId: lote.id,
    despues: { ...d, facturas: ids.length },
  })
  return { ok: true as const, id: lote.id, armadas: ids.length, errores }
}

/** Estado de cada factura del lote. */
export async function detalleLote(tx: Transaccion, id: string) {
  const [lote] = await tx.select().from(lotesFacturacion).where(eq(lotesFacturacion.id, id))
  if (!lote) return null
  const filas = lote.comprobantes.length
    ? await tx
        .select({
          id: comprobantes.id,
          estado: comprobantes.estado,
          tipo: comprobantes.tipo,
          puntoVenta: comprobantes.puntoVenta,
          numero: comprobantes.numero,
          total: comprobantes.total,
          cliente: terceros.razonSocial,
        })
        .from(comprobantes)
        .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
        .where(inArray(comprobantes.id, lote.comprobantes))
    : []
  const orden = new Map(lote.comprobantes.map((c, i) => [c, i]))
  filas.sort((a, b) => orden.get(a.id)! - orden.get(b.id)!)
  const cuenta = (e: string) => filas.filter((f) => f.estado === e).length
  return {
    lote,
    facturas: filas.map((f) => ({ ...f, error: lote.errores[f.id] ?? null })),
    autorizadas: cuenta('autorizado'),
    borradores: cuenta('borrador'),
    total: filas.reduce((s, f) => s + Number(f.total), 0),
  }
}

export async function listarLotes(tx: Transaccion, limite = 30) {
  return tx
    .select({
      id: lotesFacturacion.id,
      nombre: lotesFacturacion.nombre,
      estado: lotesFacturacion.estado,
      cantidad: sql<number>`cardinality(${lotesFacturacion.comprobantes})`,
      creado: lotesFacturacion.creado,
    })
    .from(lotesFacturacion)
    .orderBy(sql`${lotesFacturacion.creado} desc`)
    .limit(limite)
}

/**
 * Autoriza (y manda) los borradores pendientes del lote, de a `tanda`.
 * Devuelve cuántos quedan: la pantalla vuelve a llamar hasta que no quede
 * ninguno, y la tarea periódica sigue con los lotes que quedaron a medias.
 */
export async function avanzarLote(empresaId: string, id: string, crearCliente: CrearCliente, tanda = 10, hoy = hoyArgentina()) {
  const datos = await conEmpresa(empresaId, async (tx) => {
    const [lote] = await tx.select().from(lotesFacturacion).where(eq(lotesFacturacion.id, id))
    if (!lote) return null
    const pendientes = lote.comprobantes.length
      ? await tx
          .select({ id: comprobantes.id })
          .from(comprobantes)
          .where(and(inArray(comprobantes.id, lote.comprobantes), eq(comprobantes.estado, 'borrador')))
      : []
    const conError = new Set(Object.keys(lote.errores))
    // Primero los que no fallaron; los que fallaron, al final (un reintento por vuelta).
    pendientes.sort((a, b) => Number(conError.has(a.id)) - Number(conError.has(b.id)))
    return { lote, pendientes: pendientes.map((p) => p.id) }
  })
  if (!datos) return { ok: false as const, error: 'Ese lote ya no existe.' }
  const { lote, pendientes } = datos
  if (!lote.autorizar) return { ok: true as const, procesadas: 0, quedan: 0 }
  const errores: Record<string, string> = { ...lote.errores }
  let procesadas = 0
  for (const cid of pendientes.slice(0, tanda)) {
    const e = await autorizarYMandar(
      empresaId,
      cid,
      { autorizar: true, enviar: lote.enviar, usuarioId: lote.usuarioId },
      crearCliente,
      hoy,
    )
    if (e.ok) delete errores[cid]
    else errores[cid] = e.error
    procesadas++
  }
  // Las que fallaron no se reintentan solas: quedan con su error para corregir y reintentar desde la pantalla.
  const quedan = pendientes.length - procesadas
  await conEmpresa(empresaId, (tx) =>
    tx
      .update(lotesFacturacion)
      .set({ errores, estado: quedan > 0 ? 'autorizando' : 'terminado', actualizado: new Date() })
      .where(eq(lotesFacturacion.id, id)),
  )
  return { ok: true as const, procesadas, quedan, errores: Object.keys(errores).length }
}

/** La tarea periódica sigue con los lotes que quedaron a medias. */
export async function avanzarLotes(empresaId: string, crearCliente: CrearCliente, hoy = hoyArgentina()) {
  const lotes = await conEmpresa(empresaId, (tx) =>
    tx
      .select({ id: lotesFacturacion.id })
      .from(lotesFacturacion)
      .where(and(eq(lotesFacturacion.autorizar, true), inArray(lotesFacturacion.estado, ['preparado', 'autorizando'])))
      .limit(5),
  )
  let procesadas = 0
  for (const l of lotes) {
    const r = await avanzarLote(empresaId, l.id, crearCliente, 25, hoy)
    if (r.ok) procesadas += r.procesadas
  }
  return { procesadas }
}
