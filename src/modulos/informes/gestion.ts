import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { articulos, compras, comprobantes, comprobantesItems, terceros, vendedores } from '../../db/schema'

/**
 * Informes de gestión: ventas por mes, cliente, artículo y vendedor, y
 * compras por proveedor. Todo en pesos (importe × tipo de cambio del
 * comprobante), neto de IVA, con las notas de crédito restando. Solo
 * comprobantes autorizados (ventas) y registrados (compras).
 */

const signoVenta = sql`case when ${comprobantes.clase} = 'nota_credito' then -1 else 1 end`
const signoCompra = sql`case when ${compras.clase} = 'nota_credito' then -1 else 1 end`
const netoVenta = sql<string>`sum((${comprobantes.neto} + ${comprobantes.noGravado} + ${comprobantes.exento}) * ${comprobantes.cotizacion} * ${signoVenta})`
const netoCompra = sql<string>`sum((${compras.neto} + ${compras.noGravado} + ${compras.exento}) * ${compras.cotizacion} * ${signoCompra})`

const r2 = (v: string | number | null) => Math.round(Number(v ?? 0) * 100) / 100

export type Rango = { desde: string; hasta: string }

const ventasDelRango = (r: Rango) =>
  and(
    eq(comprobantes.estado, 'autorizado'),
    ne(comprobantes.letra, 'X'),
    gte(comprobantes.fecha, r.desde),
    lte(comprobantes.fecha, r.hasta),
  )

export async function resumenVentas(tx: Transaccion, r: Rango) {
  const [x] = await tx
    .select({
      neto: netoVenta,
      total: sql<string>`sum(${comprobantes.total} * ${comprobantes.cotizacion} * ${signoVenta})`,
      facturas: sql<number>`count(*) filter (where ${comprobantes.clase} <> 'nota_credito')::int`,
      clientes: sql<number>`count(distinct ${comprobantes.terceroId})::int`,
    })
    .from(comprobantes)
    .where(ventasDelRango(r))
  return {
    neto: r2(x.neto),
    total: r2(x.total),
    facturas: x.facturas,
    clientes: x.clientes,
    promedio: x.facturas ? r2(Number(x.neto) / x.facturas) : 0,
  }
}

/** Ventas netas de cada mes (los 12 que terminan en el mes de "hasta"). */
export async function ventasPorMes(tx: Transaccion, hasta: string) {
  const [a, m] = hasta.split('-').map(Number)
  const inicio = new Date(Date.UTC(a, m - 12, 1)).toISOString().slice(0, 10)
  const filas = await tx
    .select({ mes: sql<string>`to_char(${comprobantes.fecha}, 'YYYY-MM')`, neto: netoVenta })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.estado, 'autorizado'),
        ne(comprobantes.letra, 'X'),
        gte(comprobantes.fecha, inicio),
        lte(comprobantes.fecha, hasta),
      ),
    )
    .groupBy(sql`1`)
  const meses: { mes: string; neto: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    meses.push({ mes, neto: r2(filas.find((f) => f.mes === mes)?.neto ?? 0) })
  }
  return meses
}

export async function ventasPorCliente(tx: Transaccion, r: Rango, limite = 50) {
  const filas = await tx
    .select({
      id: terceros.id,
      codigo: terceros.codigo,
      nombre: terceros.razonSocial,
      neto: netoVenta,
      comprobantes: sql<number>`count(*)::int`,
    })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .where(ventasDelRango(r))
    .groupBy(terceros.id, terceros.codigo, terceros.razonSocial)
    .orderBy(desc(netoVenta))
    .limit(limite)
  return filas.map((f) => ({ ...f, neto: r2(f.neto) }))
}

export async function ventasPorArticulo(tx: Transaccion, r: Rango, limite = 50) {
  const neto = sql<string>`sum(${comprobantesItems.neto} * ${comprobantes.cotizacion} * ${signoVenta})`
  const filas = await tx
    .select({
      codigo: articulos.codigo,
      nombre: sql<string>`coalesce(${articulos.nombre}, min(${comprobantesItems.descripcion}))`,
      cantidad: sql<string>`sum(${comprobantesItems.cantidad} * ${signoVenta})`,
      neto,
    })
    .from(comprobantesItems)
    .innerJoin(comprobantes, eq(comprobantes.id, comprobantesItems.comprobanteId))
    .leftJoin(articulos, eq(articulos.id, comprobantesItems.articuloId))
    .where(ventasDelRango(r))
    .groupBy(
      articulos.id,
      articulos.codigo,
      articulos.nombre,
      sql`case when ${articulos.id} is null then ${comprobantesItems.descripcion} end`,
    )
    .orderBy(desc(neto))
    .limit(limite)
  return filas.map((f) => ({ ...f, cantidad: Number(f.cantidad), neto: r2(f.neto) }))
}

export async function ventasPorVendedor(tx: Transaccion, r: Rango) {
  const filas = await tx
    .select({
      nombre: sql<string>`coalesce(${vendedores.nombre}, 'Sin vendedor')`,
      neto: netoVenta,
      comprobantes: sql<number>`count(*)::int`,
    })
    .from(comprobantes)
    .leftJoin(vendedores, eq(vendedores.id, comprobantes.vendedorId))
    .where(ventasDelRango(r))
    .groupBy(vendedores.nombre)
    .orderBy(desc(netoVenta))
  return filas.map((f) => ({ ...f, neto: r2(f.neto) }))
}

export async function comprasPorProveedor(tx: Transaccion, r: Rango, limite = 50) {
  const filas = await tx
    .select({ codigo: terceros.codigo, nombre: terceros.razonSocial, neto: netoCompra, comprobantes: sql<number>`count(*)::int` })
    .from(compras)
    .innerJoin(terceros, eq(terceros.id, compras.terceroId))
    .where(
      and(eq(compras.estado, 'registrado'), ne(compras.letra, 'X'), gte(compras.fecha, r.desde), lte(compras.fecha, r.hasta)),
    )
    .groupBy(terceros.id, terceros.codigo, terceros.razonSocial)
    .orderBy(desc(netoCompra))
    .limit(limite)
  return filas.map((f) => ({ ...f, neto: r2(f.neto) }))
}

export async function informeGestion(tx: Transaccion, r: Rango) {
  const [resumen, meses, clientes, articulosVendidos, vendedoresLista, proveedores] = await Promise.all([
    resumenVentas(tx, r),
    ventasPorMes(tx, r.hasta),
    ventasPorCliente(tx, r),
    ventasPorArticulo(tx, r),
    ventasPorVendedor(tx, r),
    comprasPorProveedor(tx, r),
  ])
  const [c] = await tx
    .select({ neto: netoCompra })
    .from(compras)
    .where(
      and(eq(compras.estado, 'registrado'), ne(compras.letra, 'X'), gte(compras.fecha, r.desde), lte(compras.fecha, r.hasta)),
    )
  const totalCompras = r2(c.neto)
  return { resumen, meses, clientes, articulos: articulosVendidos, vendedores: vendedoresLista, proveedores, totalCompras }
}
