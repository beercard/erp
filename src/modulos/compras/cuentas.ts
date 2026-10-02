import { and, eq, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { compras, pagos } from '../../db/schema'
import { aImporte, D, monto, type Monto } from '../../lib/dinero'
import { filasDe, notasCreditoDisponibles, pendientesCompras } from './compras'

/**
 * Cuenta corriente de proveedores, una por moneda (la deuda en dólares se
 * cancela en dólares). Saldo positivo: le debemos al proveedor.
 *
 * En cada moneda: suman las facturas y notas de débito; restan las notas de
 * crédito, lo que los pagos cancelaron de comprobantes de esa moneda y lo que
 * se pagó a cuenta en esa moneda.
 */

export type MovimientoProveedor = {
  id: string
  fecha: string
  tipo: 'compra' | 'pago'
  compraTipo: number | null
  puntoVenta: number | null
  numero: number
  /** Aumenta la deuda. */
  haber: string
  /** La cancela. */
  debe: string
  saldo: string
}

export async function cuentaProveedor(tx: Transaccion, terceroId: string) {
  const comps = await tx
    .select()
    .from(compras)
    .where(and(eq(compras.terceroId, terceroId), eq(compras.estado, 'registrado')))
  const pgs = await tx
    .select()
    .from(pagos)
    .where(and(eq(pagos.terceroId, terceroId), eq(pagos.estado, 'emitido')))
  // Lo que cada pago canceló, por moneda del comprobante.
  const aplicado = filasDe<{ pagoId: string; moneda: string; importe: string; importeOrigen: string }>(
    await tx.execute(sql`
      select i.pago_id as "pagoId", c.moneda, sum(i.importe)::text as importe, sum(i.importe_origen)::text as "importeOrigen"
      from imputaciones_compras i join compras c on c.id = i.compra_id
      join pagos p on p.id = i.pago_id
      where p.tercero_id = ${terceroId} and p.estado = 'emitido'
      group by i.pago_id, c.moneda
    `),
  )
  type Fila = Omit<MovimientoProveedor, 'saldo'> & { moneda: string; creado: Date }
  const filas: Fila[] = comps.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    creado: c.creado,
    moneda: c.moneda,
    tipo: 'compra',
    compraTipo: c.tipo,
    puntoVenta: c.puntoVenta,
    numero: c.numero,
    haber: c.clase === 'nota_credito' ? '0.00' : aImporte(c.total),
    debe: c.clase === 'nota_credito' ? aImporte(c.total) : '0.00',
  }))
  for (const p of pgs) {
    const deEste = aplicado.filter((a) => a.pagoId === p.id)
    const porMoneda = new Map<string, Monto>()
    for (const a of deEste) porMoneda.set(a.moneda, (porMoneda.get(a.moneda) ?? new D(0)).plus(a.importe))
    const aCuenta = monto(p.total).minus(deEste.reduce((s, a) => s.plus(a.importeOrigen), new D(0)))
    if (aCuenta.gt(0)) porMoneda.set(p.moneda, (porMoneda.get(p.moneda) ?? new D(0)).plus(aCuenta))
    for (const [moneda, importe] of porMoneda) {
      filas.push({
        id: p.id,
        fecha: p.fecha,
        creado: p.creado,
        moneda,
        tipo: 'pago',
        compraTipo: null,
        puntoVenta: null,
        numero: p.numero,
        haber: '0.00',
        debe: aImporte(importe),
      })
    }
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.getTime() - b.creado.getTime())
  const pendientes = await pendientesCompras(tx, { terceroId })
  const monedas = [...new Set(filas.map((f) => f.moneda))].sort()
  const cuentas = monedas.map((moneda) => {
    let saldo = new D(0)
    const movimientos: MovimientoProveedor[] = filas
      .filter((f) => f.moneda === moneda)
      .map(({ moneda: _m, creado: _c, ...f }) => {
        saldo = saldo.plus(f.haber).minus(f.debe)
        return { ...f, saldo: aImporte(saldo) }
      })
    const deuda = pendientes.filter((p) => p.moneda === moneda).reduce((s, p) => s.plus(p.saldo), new D(0))
    return {
      moneda,
      movimientos,
      saldo: aImporte(saldo),
      // Pagado o acreditado y no aplicado a ningún comprobante.
      aCuenta: aImporte(deuda.minus(saldo)),
    }
  })
  return { cuentas, pendientes, notasCredito: await notasCreditoDisponibles(tx, terceroId) }
}

/** Saldo de cada proveedor con movimientos, por moneda. */
export async function saldosPorProveedor(tx: Transaccion) {
  return filasDe<{ id: string; codigo: string; razonSocial: string; moneda: string; saldo: string }>(
    await tx.execute(sql`
      select t.id, t.codigo, t.razon_social as "razonSocial", m.moneda, sum(m.importe)::text as saldo
      from terceros t
      join (
        select tercero_id, moneda, case when clase = 'nota_credito' then -total else total end as importe
        from compras where estado = 'registrado'
        union all
        -- Lo que cada pago canceló, en la moneda de cada comprobante.
        select p.tercero_id, c.moneda, -i.importe
        from imputaciones_compras i join pagos p on p.id = i.pago_id join compras c on c.id = i.compra_id
        where p.estado = 'emitido'
        union all
        -- Lo pagado a cuenta, en la moneda del pago.
        select p.tercero_id, p.moneda, -(p.total - coalesce((
          select sum(i.importe_origen) from imputaciones_compras i where i.pago_id = p.id
        ), 0))
        from pagos p where p.estado = 'emitido'
      ) m on m.tercero_id = t.id
      group by t.id, t.codigo, t.razon_social, m.moneda
      having sum(m.importe) <> 0
      order by t.razon_social, m.moneda
    `),
  )
}
