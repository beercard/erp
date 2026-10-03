import { createHmac, timingSafeEqual } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import { comoPlataforma } from '../../db/empresa'
import { eventosSuscripcion, suscripciones } from '../../db/schema'
import { MESES_COBRADOS_EN_ANUAL, planPorId, precioDeLista, type DatosSuscripcion } from '../../lib/planes'
import { pedirJson } from '../tiendas/http'
import type { Fetch } from '../tiendas/tipos'
import { registrarPago, resolverPedido } from './suscripciones'

/**
 * Cobro de la suscripción con débito automático de Mercado Pago (suscripción
 * sin plan asociado, "preapproval"). La empresa autoriza una vez en Mercado
 * Pago; cada cobro aprobado avisa acá, se registra el pago (corre la fecha
 * de vencimiento) y, si había un cambio de plan esperando el pago, se aplica.
 *
 *   MP_ACCESS_TOKEN       token de producción de la cuenta de Vektra
 *   MP_WEBHOOK_SECRET     clave secreta de las notificaciones (para la firma)
 */

const API = 'https://api.mercadopago.com'
const IVA = 1.21

export const mpConfigurado = () => Boolean(process.env.MP_ACCESS_TOKEN && process.env.MP_WEBHOOK_SECRET)

const cabeceras = () => ({
  authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  'content-type': 'application/json',
  accept: 'application/json',
})

/** Lo que se debita cada vez, con IVA: un mes, o en el anual diez meses por año. */
export function importeDebito(
  s: Pick<DatosSuscripcion, 'plan' | 'aplicaciones' | 'usuariosAdicionales'> & { ciclo: string; precioAcordado: string | null },
) {
  const mensual = s.precioAcordado ? Number(s.precioAcordado) : precioDeLista(s)
  const neto = s.ciclo === 'anual' ? mensual * MESES_COBRADOS_EN_ANUAL : mensual
  return Math.round(neto * IVA * 100) / 100
}

/**
 * Crea el débito automático y devuelve la dirección de Mercado Pago donde la
 * empresa lo autoriza (con tarjeta o dinero en cuenta).
 */
export async function crearDebito(
  f: Fetch,
  d: {
    empresaId: string
    email: string
    suscripcion: Parameters<typeof importeDebito>[0]
    vuelta: string
  },
) {
  const plan = planPorId(d.suscripcion.plan)
  const monto = importeDebito(d.suscripcion)
  if (monto <= 0) throw new Error('El plan gratis no se cobra.')
  const r = await pedirJson<{ id: string; init_point: string }>(f, `${API}/preapproval`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      reason: `Vektra ERP · Plan ${plan.nombre} (${d.suscripcion.ciclo})`,
      external_reference: d.empresaId,
      payer_email: d.email,
      back_url: d.vuelta,
      status: 'pending',
      auto_recurring: {
        frequency: d.suscripcion.ciclo === 'anual' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: monto,
        currency_id: 'ARS',
      },
    }),
  })
  await comoPlataforma((tx) =>
    tx
      .update(suscripciones)
      .set({ mpSuscripcion: r.id, mpEstado: 'pending', actualizado: new Date() })
      .where(eq(suscripciones.empresaId, d.empresaId)),
  )
  return { id: r.id, url: r.init_point, monto }
}

/**
 * Firma de la notificación: x-signature "ts=…,v1=…", con v1 =
 * HMAC-SHA256(secreto, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
 */
export function firmaValida(
  firma: string | null,
  requestId: string | null,
  dataId: string | null,
  secreto = process.env.MP_WEBHOOK_SECRET,
) {
  if (!firma || !secreto || !dataId) return false
  const partes = Object.fromEntries(firma.split(',').map((p) => p.trim().split('=') as [string, string]))
  if (!partes.ts || !partes.v1) return false
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
  const manifiesto = `id:${id};${requestId ? `request-id:${requestId};` : ''}ts:${partes.ts};`
  const esperada = Buffer.from(createHmac('sha256', secreto).update(manifiesto).digest('hex'))
  const recibida = Buffer.from(partes.v1)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

type CobroAutorizado = {
  id: number | string
  preapproval_id: string
  status: string
  transaction_amount?: number
  payment?: { id?: number | string; status?: string }
}

async function suscripcionPorDebito(id: string) {
  const [s] = await comoPlataforma((tx) => tx.select().from(suscripciones).where(eq(suscripciones.mpSuscripcion, id)))
  return s ?? null
}

/**
 * Procesa una notificación ya verificada. Idempotente: el mismo cobro avisado
 * dos veces se registra una sola vez.
 */
export async function procesarAviso(f: Fetch, tipo: string, id: string) {
  if (tipo === 'subscription_authorized_payment') {
    const c = await pedirJson<CobroAutorizado>(f, `${API}/authorized_payments/${encodeURIComponent(id)}`, {
      headers: cabeceras(),
    })
    if (c.payment?.status !== 'approved') return 'sin aprobar'
    const s = await suscripcionPorDebito(c.preapproval_id)
    if (!s) return 'desconocido'
    const referencia = `mp:${c.id}`
    const [repetido] = await comoPlataforma((tx) =>
      tx
        .select({ id: eventosSuscripcion.id })
        .from(eventosSuscripcion)
        .where(
          and(
            eq(eventosSuscripcion.empresaId, s.empresaId),
            eq(eventosSuscripcion.tipo, 'pago'),
            sql`${eventosSuscripcion.detalle}->>'referencia' = ${referencia}`,
          ),
        ),
    )
    if (repetido) return 'repetido'
    // Un cambio de plan que esperaba el pago se aplica antes de registrar el cobro.
    const [pedido] = await comoPlataforma((tx) =>
      tx
        .select({ id: eventosSuscripcion.id })
        .from(eventosSuscripcion)
        .where(
          and(
            eq(eventosSuscripcion.empresaId, s.empresaId),
            eq(eventosSuscripcion.tipo, 'pedido'),
            eq(eventosSuscripcion.estado, 'pendiente'),
          ),
        ),
    )
    if (pedido) await resolverPedido(null, pedido.id, true)
    await registrarPago(null, s.empresaId, {
      importe: String(c.transaction_amount ?? ''),
      medio: 'Mercado Pago (débito automático)',
      referencia,
    })
    return 'pagado'
  }
  if (tipo === 'subscription_preapproval') {
    const p = await pedirJson<{ id: string; status: string }>(f, `${API}/preapproval/${encodeURIComponent(id)}`, {
      headers: cabeceras(),
    })
    const s = await suscripcionPorDebito(p.id)
    if (!s) return 'desconocido'
    if (s.mpEstado !== p.status) {
      await comoPlataforma(async (tx) => {
        await tx
          .update(suscripciones)
          .set({ mpEstado: p.status, actualizado: new Date() })
          .where(eq(suscripciones.empresaId, s.empresaId))
        await tx.insert(eventosSuscripcion).values({
          empresaId: s.empresaId,
          tipo: 'nota',
          detalle: { texto: `Débito automático de Mercado Pago: ${ESTADOS_DEBITO[p.status] ?? p.status}.` },
        })
      })
    }
    return p.status
  }
  return 'ignorado'
}

export const ESTADOS_DEBITO: Record<string, string> = {
  pending: 'esperando la autorización',
  authorized: 'activo',
  paused: 'pausado',
  cancelled: 'cancelado',
}
