import { sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { D, monto } from '../../lib/dinero'
import { filasDe } from '../compras/compras'
import { guardarOrden } from '../compras/ordenes'

/**
 * Reposición de stock: los artículos que, contando lo que ya está pedido y
 * todavía no llegó, quedan por debajo del stock mínimo. Para cada uno se
 * sugiere cuánto pedir (el lote de reposición o hasta el doble del mínimo) y
 * a quién (el proveedor habitual o el de la última compra), y se arman las
 * órdenes de compra agrupadas por proveedor.
 */

export type Faltante = {
  id: string
  codigo: string
  nombre: string
  unidad: string
  alicuotaIva: number
  minimo: string
  stock: string
  /** Pedido en órdenes de compra pendientes, todavía sin recibir. */
  enCamino: string
  sugerido: string
  proveedorId: string | null
  proveedor: string | null
  /** Último precio de compra (o el costo del artículo). */
  precio: string
}

/** Cantidad a pedir: el lote o lo que falta para llegar al doble del mínimo; nunca menos de lo que falta para el mínimo. */
export function cantidadSugerida(minimo: string, disponible: string, lote: string | null) {
  const falta = monto(minimo).minus(disponible)
  if (falta.lte(0)) return '0'
  const base = lote && monto(lote).gt(0) ? monto(lote) : monto(minimo).times(2).minus(disponible)
  return D.max(base, falta).toDecimalPlaces(0, D.ROUND_UP).toString()
}

export async function faltantes(tx: Transaccion): Promise<Faltante[]> {
  const filas = filasDe<Omit<Faltante, 'sugerido'> & { lote: string | null }>(
    await tx.execute(sql`
      with stock as (
        select articulo_id, sum(cantidad) as cantidad from movimientos_stock group by articulo_id
      ),
      camino as (
        select oci.articulo_id, sum(greatest(oci.cantidad - coalesce((
          select sum(ci.cantidad) from compras_items ci join compras c on c.id = ci.compra_id
          where ci.orden_item_id = oci.id and c.estado = 'registrado' and c.clase <> 'nota_credito'
        ), 0), 0)) as cantidad
        from ordenes_compra_items oci join ordenes_compra o on o.id = oci.orden_id
        where o.estado in ('pendiente', 'parcial') and oci.articulo_id is not null
        group by oci.articulo_id
      ),
      ultima as (
        select distinct on (ci.articulo_id) ci.articulo_id, c.tercero_id, ci.precio_unitario
        from compras_items ci join compras c on c.id = ci.compra_id
        where c.estado = 'registrado' and c.clase = 'factura' and ci.articulo_id is not null and c.moneda = 'PES'
        order by ci.articulo_id, c.fecha desc, c.creado desc
      )
      select a.id, a.codigo, a.nombre, a.unidad, a.alicuota_iva as "alicuotaIva",
        trim_scale(a.stock_minimo)::text as minimo, trim_scale(a.lote_reposicion)::text as lote,
        trim_scale(coalesce(s.cantidad, 0))::text as stock, trim_scale(coalesce(k.cantidad, 0))::text as "enCamino",
        coalesce(a.proveedor_id, u.tercero_id) as "proveedorId", t.razon_social as proveedor,
        coalesce(u.precio_unitario, case when a.moneda_costo = 'PES' then a.costo end, 0)::text as precio
      from articulos a
      left join stock s on s.articulo_id = a.id
      left join camino k on k.articulo_id = a.id
      left join ultima u on u.articulo_id = a.id
      left join terceros t on t.id = coalesce(a.proveedor_id, u.tercero_id)
      where a.activo and a.lleva_stock and a.stock_minimo is not null and a.stock_minimo > 0
        and coalesce(s.cantidad, 0) + coalesce(k.cantidad, 0) < a.stock_minimo
      order by t.razon_social nulls last, a.nombre
    `),
  )
  return filas.map(({ lote, ...f }) => ({
    ...f,
    sugerido: cantidadSugerida(f.minimo, monto(f.stock).plus(f.enCamino).toString(), lote),
  }))
}

/**
 * Arma una orden de compra por proveedor con los artículos elegidos (o todos
 * los faltantes) y las cantidades indicadas (o las sugeridas). Los que no
 * tienen proveedor quedan afuera y se informan.
 */
export async function generarOrdenesReposicion(
  tx: Transaccion,
  usuarioId: string,
  hoy: string,
  elegidos?: Record<string, string>,
) {
  const lista = (await faltantes(tx)).filter((f) => !elegidos || f.id in elegidos)
  const porProveedor = new Map<string, Faltante[]>()
  const sinProveedor: string[] = []
  for (const f of lista) {
    if (!f.proveedorId) {
      sinProveedor.push(f.nombre)
      continue
    }
    porProveedor.set(f.proveedorId, [...(porProveedor.get(f.proveedorId) ?? []), f])
  }
  const ordenes: { id: string; numero: number; proveedor: string; renglones: number }[] = []
  for (const [proveedorId, items] of porProveedor) {
    const r = await guardarOrden(tx, usuarioId, {
      terceroId: proveedorId,
      fecha: hoy,
      observaciones: 'Reposición de stock (artículos por debajo del mínimo).',
      items: items.map((i) => ({
        articuloId: i.id,
        descripcion: i.nombre,
        cantidad: elegidos?.[i.id] && Number(elegidos[i.id]) > 0 ? elegidos[i.id] : i.sugerido,
        precioUnitario: i.precio,
        descuento: '0',
        alicuotaIva: i.alicuotaIva,
      })),
    })
    if (!r.ok) return { ok: false as const, error: `${items[0].proveedor}: ${r.error}` }
    ordenes.push({ id: r.id, numero: r.numero, proveedor: items[0].proveedor ?? '', renglones: items.length })
  }
  return { ok: true as const, ordenes, sinProveedor }
}
