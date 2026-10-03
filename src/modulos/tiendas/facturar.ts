import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { conEmpresa } from '../../db/empresa'
import { canalesVenta, comprobantes, depositos, pedidos, pedidosCanal, pedidosItems, puntosVenta } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { emitirRemito } from '../comercial/remitos'
import { emitirComprobante, guardarComprobante, type CrearCliente } from '../facturacion/comprobantes'
import { emitirRecibo } from '../facturacion/cuentas'

/**
 * Pedidos pagados en una tienda online que se remiten, facturan y cobran
 * solos (si la tienda tiene activado "facturar solo"): remito por lo que se
 * entrega, factura autorizada en ARCA y recibo por lo que cobró la tienda en
 * la cuenta configurada. Lo que falla queda anotado en el pedido de la tienda
 * para hacerlo a mano.
 */

type Pendiente = { pedidoCanalId: string; pedidoId: string; canalId: string; tipo: string }

/** Pedidos de tiendas con "facturar solo" que todavía no tienen factura. */
async function pendientes(empresaId: string, limite: number): Promise<Pendiente[]> {
  return conEmpresa(empresaId, (tx) =>
    tx
      .select({
        pedidoCanalId: pedidosCanal.id,
        pedidoId: sql<string>`${pedidosCanal.pedidoId}`,
        canalId: canalesVenta.id,
        tipo: canalesVenta.tipo,
      })
      .from(pedidosCanal)
      .innerJoin(canalesVenta, eq(canalesVenta.id, pedidosCanal.canalId))
      .innerJoin(pedidos, eq(pedidos.id, pedidosCanal.pedidoId))
      .where(
        and(
          eq(canalesVenta.facturarSolo, true),
          eq(pedidosCanal.estado, 'importado'),
          isNotNull(pedidosCanal.pedidoId),
          inArray(pedidos.estado, ['pendiente', 'parcial', 'entregado']),
          sql`not exists (select 1 from comprobantes c where c.pedido_id = ${pedidos.id} and c.estado <> 'anulado')`,
          sql`coalesce(${pedidosCanal.detalle}, '') not like 'Facturación automática:%'`,
        ),
      )
      .orderBy(asc(pedidosCanal.creado))
      .limit(limite),
  )
}

const anotar = (empresaId: string, id: string, detalle: string) =>
  conEmpresa(empresaId, (tx) => tx.update(pedidosCanal).set({ detalle, actualizado: new Date() }).where(eq(pedidosCanal.id, id)))

/** Remito y borrador de factura del pedido, en una transacción. */
async function preparar(empresaId: string, p: Pendiente, hoy: string) {
  return conEmpresa(empresaId, async (tx) => {
    const [canal] = await tx.select().from(canalesVenta).where(eq(canalesVenta.id, p.canalId))
    const [pedido] = await tx.select().from(pedidos).where(eq(pedidos.id, p.pedidoId))
    const items = await tx
      .select()
      .from(pedidosItems)
      .where(eq(pedidosItems.pedidoId, p.pedidoId))
      .orderBy(asc(pedidosItems.orden))
    const [pv] = canal.puntoVenta
      ? await tx.select().from(puntosVenta).where(eq(puntosVenta.numero, canal.puntoVenta))
      : await tx
          .select()
          .from(puntosVenta)
          .where(and(eq(puntosVenta.activo, true), eq(puntosVenta.tipo, 'electronico')))
          .orderBy(asc(puntosVenta.numero))
          .limit(1)
    if (!pv) return { error: 'No hay un punto de venta electrónico para facturar.' }

    // Remito por lo que falta entregar (si el pedido ya se entregó a mano, no).
    const porEntregar = items.filter((i) => Number(i.cantidad) > Number(i.cantidadEntregada))
    if (porEntregar.length) {
      const depositoId =
        pedido.depositoId ??
        canal.depositoId ??
        (await tx.select({ id: depositos.id }).from(depositos).where(eq(depositos.activo, true)).limit(1))[0]?.id
      if (!depositoId) return { error: 'No hay depósito para el remito.' }
      const r = await emitirRemito(tx, null, {
        puntoVenta: pv.numero,
        terceroId: pedido.terceroId,
        depositoId,
        pedidoId: pedido.id,
        fecha: hoy,
        observaciones: pedido.observaciones,
        items: porEntregar.map((i) => ({
          articuloId: i.articuloId,
          descripcion: i.descripcion,
          cantidad: String(Number(i.cantidad) - Number(i.cantidadEntregada)),
          pedidoItemId: i.id,
        })),
      })
      if (!r.ok) return { error: `Remito: ${r.error}` }
    }

    const f = await guardarComprobante(tx, null, {
      clase: 'factura',
      puntoVenta: pv.numero,
      terceroId: pedido.terceroId,
      fecha: hoy,
      moneda: 'PES',
      cotizacion: '1',
      concepto: 1,
      pedidoId: pedido.id,
      observaciones: pedido.observaciones,
      items: items.map((i) => ({
        articuloId: i.articuloId,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        descuento: i.descuento,
        alicuotaIva: i.alicuotaIva,
      })),
    })
    if (!f.ok) return { error: `Factura: ${f.error}` }
    return { facturaId: f.id, terceroId: pedido.terceroId, cuentaCobroId: canal.cuentaCobroId }
  })
}

export async function facturarPedidosPagados(empresaId: string, crearCliente: CrearCliente, limite = 20, hoy = hoyArgentina()) {
  let facturados = 0
  let errores = 0
  for (const p of await pendientes(empresaId, limite)) {
    const prep = await preparar(empresaId, p, hoy).catch((e: Error) => ({ error: e.message }))
    if ('error' in prep) {
      errores++
      await anotar(empresaId, p.pedidoCanalId, `Facturación automática: ${prep.error} Hacelo a mano desde el pedido.`)
      continue
    }
    // La autorización en ARCA va fuera de la transacción.
    const e = await emitirComprobante(empresaId, null, prep.facturaId, crearCliente, hoy)
    if (!e.ok) {
      errores++
      await anotar(empresaId, p.pedidoCanalId, `Facturación automática: la factura quedó en borrador (${e.error}).`)
      continue
    }
    // Lo cobró la tienda: recibo por el total en la cuenta de cobro.
    const cobro = await conEmpresa(empresaId, async (tx) => {
      const [c] = await tx.select({ total: comprobantes.total }).from(comprobantes).where(eq(comprobantes.id, prep.facturaId))
      return emitirRecibo(tx, null, {
        terceroId: prep.terceroId,
        fecha: hoy,
        valores: [
          {
            medio: p.tipo === 'mercadolibre' ? 'mercado_pago' : 'otro',
            importe: c.total,
            cuentaId: prep.cuentaCobroId,
            detalle: 'Cobrado por la tienda online',
          },
        ],
        imputaciones: [{ comprobanteId: prep.facturaId, importe: c.total }],
      })
    }).catch((err: Error) => ({ ok: false as const, error: err.message }))
    facturados++
    await anotar(
      empresaId,
      p.pedidoCanalId,
      `Facturación automática: remitido, facturado (N° ${e.numero})${cobro.ok ? ' y cobrado' : `; el cobro quedó pendiente (${cobro.error})`}.`,
    )
  }
  return { facturados, errores }
}
