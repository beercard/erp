import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { ordenesCompra, ordenesCompraItems, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { monto } from '../../lib/dinero'
import { calcularTotales } from '../comercial/calculo'
import { decimal, EsquemaItem, opcionalUuid, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'

/**
 * Órdenes de compra: lo que se le pide a un proveedor, con precio pactado.
 * Se reciben con comprobantes de compra (renglón por renglón, parcial o
 * total) y el estado se actualiza solo.
 */

const EsquemaOrden = z.object({
  terceroId: z.uuid({ error: 'Elegí el proveedor.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  fechaEntrega: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(z.iso.date().nullable()),
  depositoId: opcionalUuid,
  moneda: z.enum(['PES', 'DOL']).default('PES'),
  cotizacion: decimal('Escribí la cotización.').default('1'),
  observaciones: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  items: z.array(EsquemaItem).min(1, { error: 'Agregá al menos un renglón.' }),
})

export async function guardarOrden(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  id?: string,
): Promise<{ ok: true; id: string; numero: number } | { ok: false; error: string }> {
  const p = EsquemaOrden.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  const { lineas, totales } = calcularTotales(
    d.items.map((i) => ({
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      descuento: i.descuento ?? '0',
      alicuotaIva: i.alicuotaIva,
    })),
  )
  const cabecera = {
    terceroId: d.terceroId,
    fecha: d.fecha,
    fechaEntrega: d.fechaEntrega,
    depositoId: d.depositoId,
    moneda: d.moneda,
    cotizacion: d.moneda === 'PES' ? '1' : d.cotizacion,
    observaciones: d.observaciones,
    neto: totales.neto,
    iva: totales.iva,
    total: totales.total,
  }
  let orden: typeof ordenesCompra.$inferSelect
  if (id) {
    const [actual] = await tx.select().from(ordenesCompra).where(eq(ordenesCompra.id, id)).for('update')
    if (!actual) return { ok: false, error: 'Esa orden ya no existe.' }
    if (actual.estado !== 'pendiente')
      return { ok: false, error: 'La orden ya tiene mercadería recibida o está cancelada: no se modifica.' }
    ;[orden] = await tx.update(ordenesCompra).set(cabecera).where(eq(ordenesCompra.id, id)).returning()
    await tx.delete(ordenesCompraItems).where(eq(ordenesCompraItems.ordenId, id))
  } else {
    ;[orden] = await tx
      .insert(ordenesCompra)
      .values({ ...cabecera, numero: await siguienteNumero(tx, 'orden_compra'), usuarioId })
      .returning()
  }
  await tx.insert(ordenesCompraItems).values(
    d.items.map((i, n) => ({
      ordenId: orden.id,
      orden: n + 1,
      articuloId: i.articuloId ?? null,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      descuento: i.descuento ?? '0',
      alicuotaIva: i.alicuotaIva,
      neto: lineas[n].neto,
      iva: lineas[n].iva,
    })),
  )
  await auditar(tx, { usuarioId, accion: id ? 'modificacion' : 'alta', entidad: 'orden_compra', entidadId: orden.id, despues: d })
  return { ok: true, id: orden.id, numero: orden.numero }
}

export async function cancelarOrden(tx: Transaccion, usuarioId: string, id: string) {
  const [o] = await tx.select().from(ordenesCompra).where(eq(ordenesCompra.id, id)).for('update')
  if (!o) return { ok: false as const, error: 'Esa orden ya no existe.' }
  if (o.estado === 'recibida' || o.estado === 'cancelada') return { ok: false as const, error: 'La orden ya está cerrada.' }
  await tx.update(ordenesCompra).set({ estado: 'cancelada' }).where(eq(ordenesCompra.id, id))
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'orden_compra', entidadId: id, antes: { estado: o.estado } })
  return { ok: true as const }
}

/** Renglones de la orden con lo ya recibido y lo que falta. */
export async function itemsDeOrden(tx: Transaccion, ordenId: string) {
  const filas = await tx
    .select({
      id: ordenesCompraItems.id,
      orden: ordenesCompraItems.orden,
      articuloId: ordenesCompraItems.articuloId,
      descripcion: ordenesCompraItems.descripcion,
      cantidad: ordenesCompraItems.cantidad,
      precioUnitario: ordenesCompraItems.precioUnitario,
      descuento: ordenesCompraItems.descuento,
      alicuotaIva: ordenesCompraItems.alicuotaIva,
      neto: ordenesCompraItems.neto,
      recibido: sql<string>`coalesce((
        select sum(ci.cantidad) from compras_items ci join compras c on c.id = ci.compra_id
        where ci.orden_item_id = ordenes_compra_items.id and c.estado = 'registrado' and c.clase <> 'nota_credito'
      ), 0)`,
    })
    .from(ordenesCompraItems)
    .where(eq(ordenesCompraItems.ordenId, ordenId))
    .orderBy(asc(ordenesCompraItems.orden))
  return filas.map((f) => ({
    ...f,
    pendiente: monto(f.cantidad).minus(f.recibido).gt(0) ? monto(f.cantidad).minus(f.recibido).toFixed(4) : '0',
  }))
}

export async function obtenerOrden(tx: Transaccion, id: string) {
  const [o] = await tx.select().from(ordenesCompra).where(eq(ordenesCompra.id, id))
  if (!o) return null
  const [items, [proveedor]] = await Promise.all([
    itemsDeOrden(tx, id),
    tx.select().from(terceros).where(eq(terceros.id, o.terceroId)),
  ])
  return { ...o, items, proveedor }
}

export async function listarOrdenes(tx: Transaccion, filtro: { q?: string; estado?: string; terceroId?: string } = {}) {
  const q = filtro.q?.trim()
  return tx
    .select({
      id: ordenesCompra.id,
      numero: ordenesCompra.numero,
      fecha: ordenesCompra.fecha,
      fechaEntrega: ordenesCompra.fechaEntrega,
      moneda: ordenesCompra.moneda,
      total: ordenesCompra.total,
      estado: ordenesCompra.estado,
      proveedor: terceros.razonSocial,
    })
    .from(ordenesCompra)
    .innerJoin(terceros, eq(terceros.id, ordenesCompra.terceroId))
    .where(
      and(
        filtro.estado === 'abiertas'
          ? inArray(ordenesCompra.estado, ['pendiente', 'parcial'])
          : filtro.estado
            ? eq(ordenesCompra.estado, filtro.estado)
            : undefined,
        filtro.terceroId ? eq(ordenesCompra.terceroId, filtro.terceroId) : undefined,
        q
          ? or(ilike(terceros.razonSocial, `%${q}%`), /^\d+$/.test(q) ? eq(ordenesCompra.numero, Number(q)) : undefined)
          : undefined,
      ),
    )
    .orderBy(desc(ordenesCompra.fecha), desc(ordenesCompra.numero))
    .limit(300)
}
