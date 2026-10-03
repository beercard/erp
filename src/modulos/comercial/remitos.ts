import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  articulos,
  depositos,
  movimientosStock,
  pedidos,
  pedidosItems,
  puntosVenta,
  remitos,
  remitosItems,
  terceros,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { monto } from '../../lib/dinero'
import { actualizarEstadoPedido } from './documentos'
import { siguienteNumero } from './numeracion'
import { registrarMovimientos, saldoDe } from './stock'

/**
 * Remitos: la entrega de mercadería. Descuentan stock del depósito, y si
 * vienen de un pedido actualizan lo entregado. No se modifican: se anulan,
 * y la anulación devuelve el stock y lo pendiente del pedido.
 */

const EsquemaRemito = z.object({
  puntoVenta: z.coerce.number().int().min(1, { error: 'Elegí el punto de venta.' }),
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  depositoId: z.uuid({ error: 'Elegí el depósito.' }),
  pedidoId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  transporteId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  fecha: z.iso.date(),
  observaciones: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  items: z
    .array(
      z.object({
        articuloId: z.uuid().nullable().optional(),
        descripcion: z.string().trim().min(1),
        cantidad: z
          .union([z.string(), z.number()])
          .transform((v) => String(v).replace(',', '.'))
          .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/))
          .refine((v) => Number(v) > 0, { error: 'Las cantidades tienen que ser mayores que cero.' }),
        pedidoItemId: z.uuid().nullable().optional(),
        series: z.array(z.string().trim().min(1)).optional(),
      }),
    )
    .min(1, { error: 'El remito necesita al menos un renglón.' }),
})

export type ResultadoRemito =
  { ok: true; id: string; puntoVenta: number; numero: number; avisos: string[] } | { ok: false; error: string }

export async function emitirRemito(tx: Transaccion, usuarioId: string | null, entrada: unknown): Promise<ResultadoRemito> {
  const p = EsquemaRemito.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const [pv] = await tx
    .select()
    .from(puntosVenta)
    .where(and(eq(puntosVenta.numero, d.puntoVenta), eq(puntosVenta.activo, true)))
  if (!pv) return { ok: false, error: `El punto de venta ${d.puntoVenta} no existe o está dado de baja.` }

  // Si viene de un pedido: cada renglón tiene que ser de ese pedido y no
  // pasarse de lo pendiente. El pedido se bloquea hasta terminar.
  if (d.pedidoId) {
    const [pedido] = await tx.select().from(pedidos).where(eq(pedidos.id, d.pedidoId)).for('update')
    if (!pedido) return { ok: false, error: 'Ese pedido ya no existe.' }
    if (['entregado', 'cancelado'].includes(pedido.estado)) return { ok: false, error: `El pedido está ${pedido.estado}.` }
    if (pedido.terceroId !== d.terceroId) return { ok: false, error: 'El remito tiene que ser para el mismo cliente del pedido.' }
    const items = await tx.select().from(pedidosItems).where(eq(pedidosItems.pedidoId, d.pedidoId))
    const porId = new Map(items.map((i) => [i.id, i]))
    for (const r of d.items) {
      if (!r.pedidoItemId) continue
      const it = porId.get(r.pedidoItemId)
      if (!it) return { ok: false, error: `“${r.descripcion}” no es de este pedido.` }
      const pendiente = monto(it.cantidad).minus(it.cantidadEntregada)
      if (monto(r.cantidad).gt(pendiente)) {
        return {
          ok: false,
          error: `“${r.descripcion}”: quedan ${pendiente.toString()} por entregar y el remito lleva ${r.cantidad}.`,
        }
      }
    }
  }

  const ids = d.items.map((i) => i.articuloId).filter((x): x is string => Boolean(x))
  const arts = ids.length ? await tx.select().from(articulos).where(inArray(articulos.id, ids)) : []
  const porArticulo = new Map(arts.map((a) => [a.id, a]))
  const avisos: string[] = []
  for (const r of d.items) {
    const a = r.articuloId ? porArticulo.get(r.articuloId) : null
    if (a?.llevaSerie && (r.series?.length ?? 0) !== Number(r.cantidad)) {
      avisos.push(`${a.codigo}: se entregan ${r.cantidad} y se cargaron ${r.series?.length ?? 0} números de serie.`)
    }
    if (a?.llevaStock) {
      const saldo = monto(await saldoDe(tx, a.id, d.depositoId))
      if (saldo.lt(r.cantidad))
        avisos.push(`${a.codigo}: el depósito tenía ${saldo.toString()} y salen ${r.cantidad}; queda stock negativo.`)
    }
  }

  const numero = await siguienteNumero(tx, 'remito', d.puntoVenta)
  const [remito] = await tx
    .insert(remitos)
    .values({
      puntoVenta: d.puntoVenta,
      numero,
      fecha: d.fecha,
      terceroId: d.terceroId,
      pedidoId: d.pedidoId,
      depositoId: d.depositoId,
      transporteId: d.transporteId,
      observaciones: d.observaciones,
      usuarioId,
    })
    .returning()
  await tx.insert(remitosItems).values(
    d.items.map((r, n) => ({
      remitoId: remito.id,
      orden: n + 1,
      articuloId: r.articuloId ?? null,
      descripcion: r.descripcion,
      cantidad: r.cantidad,
      pedidoItemId: r.pedidoItemId ?? null,
      series: r.series?.length ? r.series : null,
    })),
  )
  await registrarMovimientos(
    tx,
    usuarioId,
    d.items
      .filter((r) => r.articuloId && porArticulo.get(r.articuloId)?.llevaStock)
      .map((r) => ({
        articuloId: r.articuloId!,
        depositoId: d.depositoId,
        cantidad: `-${r.cantidad}`,
        tipo: 'remito' as const,
        origenId: remito.id,
        observacion: `Remito ${numero}`,
      })),
  )
  if (d.pedidoId) {
    for (const r of d.items.filter((x) => x.pedidoItemId)) {
      const [it] = await tx.select().from(pedidosItems).where(eq(pedidosItems.id, r.pedidoItemId!))
      await tx
        .update(pedidosItems)
        .set({ cantidadEntregada: monto(it.cantidadEntregada).plus(r.cantidad).toFixed(4) })
        .where(eq(pedidosItems.id, it.id))
    }
    await actualizarEstadoPedido(tx, d.pedidoId)
  }
  await auditar(tx, { usuarioId, accion: 'emision', entidad: 'remito', entidadId: remito.id, despues: { ...d, numero } })
  return { ok: true, id: remito.id, puntoVenta: d.puntoVenta, numero, avisos }
}

export async function anularRemito(tx: Transaccion, usuarioId: string, id: string) {
  const [remito] = await tx.select().from(remitos).where(eq(remitos.id, id)).for('update')
  if (!remito) return { ok: false as const, error: 'Ese remito ya no existe.' }
  if (remito.estado === 'anulado') return { ok: false as const, error: 'El remito ya está anulado.' }
  // Devuelve exactamente lo que salió: los movimientos del remito, con signo contrario.
  const salidas = await tx
    .select()
    .from(movimientosStock)
    .where(and(eq(movimientosStock.origenId, id), eq(movimientosStock.tipo, 'remito')))
  await registrarMovimientos(
    tx,
    usuarioId,
    salidas.map((m) => ({
      articuloId: m.articuloId,
      depositoId: m.depositoId,
      cantidad: monto(m.cantidad).negated().toFixed(4),
      tipo: 'anulacion_remito' as const,
      origenId: id,
      observacion: `Anulación del remito ${remito.numero}`,
    })),
  )
  const items = await tx.select().from(remitosItems).where(eq(remitosItems.remitoId, id))
  for (const r of items.filter((x) => x.pedidoItemId)) {
    const [it] = await tx.select().from(pedidosItems).where(eq(pedidosItems.id, r.pedidoItemId!))
    await tx
      .update(pedidosItems)
      .set({ cantidadEntregada: monto(it.cantidadEntregada).minus(r.cantidad).toFixed(4) })
      .where(eq(pedidosItems.id, it.id))
  }
  await tx.update(remitos).set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId }).where(eq(remitos.id, id))
  if (remito.pedidoId) await actualizarEstadoPedido(tx, remito.pedidoId)
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'remito', entidadId: id })
  return { ok: true as const }
}

export async function listarRemitos(tx: Transaccion, q?: string) {
  const texto = q?.trim()
  return tx
    .select({
      id: remitos.id,
      puntoVenta: remitos.puntoVenta,
      numero: remitos.numero,
      fecha: remitos.fecha,
      cliente: terceros.razonSocial,
      deposito: depositos.nombre,
      estado: remitos.estado,
      pedidoId: remitos.pedidoId,
    })
    .from(remitos)
    .innerJoin(terceros, eq(terceros.id, remitos.terceroId))
    .innerJoin(depositos, eq(depositos.id, remitos.depositoId))
    .where(
      texto
        ? /^\d+$/.test(texto)
          ? or(eq(remitos.numero, Number(texto)), ilike(terceros.razonSocial, `%${texto}%`))
          : ilike(terceros.razonSocial, `%${texto}%`)
        : undefined,
    )
    .orderBy(desc(remitos.fecha), desc(remitos.numero))
    .limit(200)
}

export async function obtenerRemito(tx: Transaccion, id: string) {
  const [cab] = await tx.select().from(remitos).where(eq(remitos.id, id))
  if (!cab) return null
  const items = await tx.select().from(remitosItems).where(eq(remitosItems.remitoId, id)).orderBy(asc(remitosItems.orden))
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, cab.terceroId))
  const [deposito] = await tx.select().from(depositos).where(eq(depositos.id, cab.depositoId))
  const [pedido] = cab.pedidoId
    ? await tx.select({ id: pedidos.id, numero: pedidos.numero }).from(pedidos).where(eq(pedidos.id, cab.pedidoId))
    : []
  return { ...cab, items, cliente, deposito, pedido: pedido ?? null }
}
