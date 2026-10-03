import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma, conEmpresa } from '../../db/empresa'
import { comprobantes, empresas, facturasSuscripcion, membresias, usuarios } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { formatearNumero } from '../comercial/formato'
import { type CrearCliente, guardarComprobante } from '../facturacion/comprobantes'
import { autorizarYMandar, clientePorDocumento, puntoVentaElectronico } from '../facturacion/automatica'

/**
 * Vektra se factura sola: cada pago de una suscripción (débito de Mercado
 * Pago o pago cargado a mano en la consola) deja pendiente su factura, y la
 * tarea periódica la emite desde la empresa de Vektra dentro del mismo ERP
 * (VEKTRA_EMPRESA_ID, con su certificado de ARCA) y se la manda por email
 * al dueño de la empresa suscriptora.
 */

export const empresaVektra = () => process.env.VEKTRA_EMPRESA_ID?.trim() || null

const IVA = 1.21
const MAXIMO_INTENTOS = 5

const dma = (f: string) => f.split('-').reverse().join('/')

/** Deja pendiente la factura de un pago (en la misma transacción que lo registra). */
export async function encolarFacturaSuscripcion(
  tx: Transaccion,
  d: { empresaId: string; eventoId: string; importe: number; plan: string; desde: string; hasta: string },
) {
  const vektra = empresaVektra()
  if (!vektra || vektra === d.empresaId || !(d.importe > 0)) return null
  const [fila] = await tx
    .insert(facturasSuscripcion)
    .values({
      empresaId: d.empresaId,
      eventoId: d.eventoId,
      importe: d.importe.toFixed(2),
      detalle: `Suscripción a Vektra ERP, plan ${d.plan.charAt(0).toUpperCase()}${d.plan.slice(1)}`,
      desde: d.desde,
      hasta: d.hasta,
    })
    .onConflictDoNothing()
    .returning({ id: facturasSuscripcion.id })
  return fila?.id ?? null
}

/** Neto sin IVA de un importe con IVA (21 %). */
export const netoDe = (conIva: number) => (Math.round((conIva / IVA) * 100) / 100).toFixed(2)

/** Email del dueño (el primer usuario activo) de la empresa suscriptora. */
async function emailDe(empresaId: string) {
  const [u] = await comoPlataforma((tx) =>
    tx
      .select({ email: usuarios.email })
      .from(membresias)
      .innerJoin(usuarios, eq(usuarios.id, membresias.usuarioId))
      .where(and(eq(membresias.empresaId, empresaId), eq(membresias.activa, true)))
      .orderBy(asc(membresias.creado))
      .limit(1),
  )
  return u?.email ?? null
}

/** Arma (o retoma) el borrador en la empresa de Vektra. */
async function borrador(vektra: string, f: typeof facturasSuscripcion.$inferSelect, hoy: string) {
  if (f.comprobanteId) return { id: f.comprobanteId }
  const [suscriptora] = await comoPlataforma((tx) => tx.select().from(empresas).where(eq(empresas.id, f.empresaId)))
  if (!suscriptora) return { error: 'La empresa suscriptora ya no existe.' }
  const email = await emailDe(f.empresaId)
  return conEmpresa(vektra, async (tx) => {
    const c = await clientePorDocumento(tx, null, {
      documento: suscriptora.cuit,
      razonSocial: suscriptora.razonSocial,
      condicionIva: suscriptora.condicionIva,
      email,
      domicilio: [suscriptora.domicilioFiscal, suscriptora.localidad].filter(Boolean).join(', ') || null,
    })
    if (!c.ok) return { error: c.error }
    const pv = await puntoVentaElectronico(tx)
    if (!pv) return { error: 'La empresa de Vektra no tiene un punto de venta electrónico.' }
    const g = await guardarComprobante(tx, null, {
      clase: 'factura',
      puntoVenta: pv,
      terceroId: c.id,
      fecha: hoy,
      moneda: 'PES',
      cotizacion: '1',
      concepto: 2,
      servicioDesde: f.desde ?? hoy,
      servicioHasta: f.hasta ?? hoy,
      vencimiento: hoy,
      observaciones: 'Pagada.',
      items: [
        {
          descripcion: `${f.detalle}${f.desde && f.hasta ? `, del ${dma(f.desde)} al ${dma(f.hasta)}` : ''}`,
          cantidad: '1',
          precioUnitario: netoDe(Number(f.importe)),
          alicuotaIva: 5,
        },
      ],
    })
    return g.ok ? { id: g.id } : { error: g.error }
  })
}

const anotar = (id: string, valores: Partial<typeof facturasSuscripcion.$inferInsert>) =>
  comoPlataforma((tx) =>
    tx
      .update(facturasSuscripcion)
      .set({ ...valores, actualizado: new Date() })
      .where(eq(facturasSuscripcion.id, id)),
  )

/** Emite las facturas pendientes de las suscripciones (lo llama la tarea periódica). */
export async function emitirFacturasSuscripcion(crearCliente: CrearCliente, hoy = hoyArgentina(), limite = 20) {
  const vektra = empresaVektra()
  if (!vektra) return { emitidas: 0, errores: 0 }
  const pendientes = await comoPlataforma((tx) =>
    tx
      .select()
      .from(facturasSuscripcion)
      .where(
        or(
          eq(facturasSuscripcion.estado, 'pendiente'),
          and(eq(facturasSuscripcion.estado, 'error'), lt(facturasSuscripcion.intentos, MAXIMO_INTENTOS)),
        ),
      )
      .orderBy(asc(facturasSuscripcion.creado))
      .limit(limite),
  )
  let emitidas = 0
  let errores = 0
  for (const f of pendientes) {
    const b = await borrador(vektra, f, hoy).catch((e: Error) => ({ error: e.message }))
    if ('error' in b) {
      errores++
      await anotar(f.id, { estado: 'error', error: b.error, intentos: f.intentos + 1 })
      continue
    }
    if (!f.comprobanteId) await anotar(f.id, { comprobanteId: b.id })
    const e = await autorizarYMandar(vektra, b.id, { autorizar: true, enviar: true }, crearCliente, hoy)
    if (e.ok) {
      emitidas++
      const [c] = await conEmpresa(vektra, (tx) =>
        tx
          .select({ letra: comprobantes.letra, puntoVenta: comprobantes.puntoVenta, numero: comprobantes.numero })
          .from(comprobantes)
          .where(eq(comprobantes.id, b.id)),
      )
      const numero = c?.numero ? `${c.letra} ${formatearNumero(c.puntoVenta, c.numero)}` : null
      await anotar(f.id, { estado: 'emitida', error: null, numero })
    } else {
      errores++
      await anotar(f.id, { estado: 'error', error: e.error, intentos: f.intentos + 1 })
    }
  }
  return { emitidas, errores }
}

/** Facturas de suscripción de una empresa (consola de la plataforma), o las últimas de todas. */
export async function facturasDeSuscripcion(empresaId?: string, limite = 50) {
  return comoPlataforma((tx) =>
    tx
      .select()
      .from(facturasSuscripcion)
      .where(empresaId ? eq(facturasSuscripcion.empresaId, empresaId) : undefined)
      .orderBy(desc(facturasSuscripcion.creado))
      .limit(limite),
  )
}

/** Vuelve a intentar las que agotaron los intentos (desde la consola). */
export async function reintentarFacturasSuscripcion(ids: string[]) {
  if (!ids.length) return
  await comoPlataforma((tx) =>
    tx
      .update(facturasSuscripcion)
      .set({ estado: 'pendiente', intentos: 0, actualizado: new Date() })
      .where(and(inArray(facturasSuscripcion.id, ids), eq(facturasSuscripcion.estado, 'error'))),
  )
}
