import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  articulos,
  compras,
  comprasItems,
  comprasIva,
  comprasTributos,
  imputacionesCompras,
  ordenesCompra,
  ordenesCompraItems,
  terceros,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { controlarPeriodoIva } from '../impuestos/presentaciones'
import { aImporte, D, monto, normalizarNumero } from '../../lib/dinero'
import { calcularTotales, TASAS_IVA } from '../comercial/calculo'
import { decimal, EsquemaItem, opcionalUuid, primerError } from '../comercial/documentos'
import { registrarMovimientos } from '../comercial/stock'
import { codigoCompra, discriminaIva, LETRAS_COMPRA } from './tipos'

/**
 * Comprobantes de compra: se registran como los emitió el proveedor. Con
 * artículos, la mercadería entra al depósito; sin artículos (gastos,
 * servicios) se cargan las bases por alícuota. Un comprobante registrado no
 * se edita: se anula (y el stock vuelve) y se carga de nuevo.
 */

export const TIPOS_TRIBUTO = {
  percepcion_iva: 'Percepción de IVA',
  percepcion_iibb: 'Percepción de IIBB',
  percepcion_ganancias: 'Percepción de Ganancias',
  impuestos_internos: 'Impuestos internos',
  impuesto_municipal: 'Impuesto municipal',
  otro: 'Otro tributo',
} as const

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)

const fechaOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.iso.date().nullable())

const EsquemaTributo = z.object({
  tipo: z.enum(Object.keys(TIPOS_TRIBUTO) as [keyof typeof TIPOS_TRIBUTO, ...(keyof typeof TIPOS_TRIBUTO)[]]),
  provincia: texto,
  importe: decimal('Cada percepción o tributo necesita un importe.').refine((v) => Number(v) > 0, {
    error: 'Cada percepción o tributo necesita un importe.',
  }),
})

const EsquemaIva = z.object({
  alicuotaIva: z.coerce.number().refine((v) => v in TASAS_IVA, { error: 'Alícuota de IVA inválida.' }),
  base: decimal('Base de IVA inválida.'),
  /** Vacío: se calcula. Si viene, es el IVA impreso en el comprobante. */
  importe: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => (v === null || v === undefined || v === '' ? null : String(v)))
    .pipe(
      z
        .string()
        .transform(normalizarNumero)
        .pipe(z.string().regex(/^\d+(\.\d+)?$/, { error: 'IVA inválido.' }))
        .nullable(),
    ),
})

export const EsquemaCompra = z.object({
  terceroId: z.uuid({ error: 'Elegí el proveedor.' }),
  clase: z.enum(['factura', 'nota_debito', 'nota_credito']),
  letra: z.enum(LETRAS_COMPRA as [string, ...string[]]),
  fce: z.boolean().default(false),
  puntoVenta: z.coerce
    .number({ error: 'Punto de venta inválido.' })
    .int()
    .min(0, { error: 'Punto de venta inválido.' })
    .max(99999, { error: 'Punto de venta inválido.' }),
  numero: z.coerce
    .number({ error: 'Número inválido.' })
    .int()
    .min(1, { error: 'Escribí el número del comprobante.' })
    .max(99999999, { error: 'Número inválido.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  /** "AAAA-MM"; vacío = el mes de la fecha. */
  periodoIva: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(
      z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Período de IVA inválido (AAAA-MM).' })
        .nullable(),
    ),
  vencimiento: fechaOpcional,
  cae: texto,
  moneda: z.enum(['PES', 'DOL']).default('PES'),
  cotizacion: decimal('Escribí la cotización.').default('1'),
  depositoId: opcionalUuid,
  ordenCompraId: opcionalUuid,
  /** Nota de crédito: la factura a la que se aplica. */
  aplicarA: opcionalUuid,
  actualizarCosto: z.boolean().default(false),
  items: z.array(EsquemaItem.extend({ ordenItemId: opcionalUuid })).default([]),
  iva: z.array(EsquemaIva).default([]),
  noGravado: decimal('Importe no gravado inválido.').default('0'),
  exento: decimal('Importe exento inválido.').default('0'),
  tributos: z.array(EsquemaTributo).default([]),
  observaciones: texto,
})

export type EntradaCompra = z.input<typeof EsquemaCompra>

/** Tolerancia entre el IVA impreso y el calculado (redondeos del proveedor). */
const TOLERANCIA_IVA = new D(1)

/**
 * Totales de la compra. Con renglones, las bases salen de ellos; sin
 * renglones, de las bases cargadas. El IVA de cada alícuota puede venir
 * impreso (se respeta si difiere del calculado en menos de $ 1).
 */
export function calcularCompra(d: z.infer<typeof EsquemaCompra>):
  | {
      ok: true
      lineas: { neto: string; iva: string }[]
      porAlicuota: { alicuotaIva: number; base: string; importe: string }[]
      neto: string
      iva: string
      tributos: string
      total: string
    }
  | { ok: false; error: string } {
  const conIva = discriminaIva(d.letra)
  const impreso = new Map(d.iva.filter((i) => i.importe !== null).map((i) => [i.alicuotaIva, i.importe!]))
  let lineas: { neto: string; iva: string }[] = []
  let bases: { alicuotaIva: number; base: string }[]
  if (d.items.length) {
    const calculo = calcularTotales(
      d.items.map((i) => ({
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        descuento: i.descuento ?? '0',
        // En B y C el precio es final: no hay IVA que discriminar.
        alicuotaIva: conIva ? i.alicuotaIva : 3,
      })),
    )
    lineas = calculo.lineas
    bases = calculo.totales.porAlicuota.map((a) => ({ alicuotaIva: a.alicuotaIva, base: a.base }))
  } else {
    bases = d.iva.filter((i) => monto(i.base).gt(0)).map((i) => ({ alicuotaIva: conIva ? i.alicuotaIva : 3, base: i.base }))
  }
  if (!bases.length && monto(d.noGravado).lte(0) && monto(d.exento).lte(0)) {
    return { ok: false, error: 'El comprobante no tiene importes: cargá los renglones o las bases de IVA.' }
  }
  const porAlicuota: { alicuotaIva: number; base: string; importe: string }[] = []
  for (const b of bases) {
    const calculado = monto(b.base).times(TASAS_IVA[b.alicuotaIva]).dividedBy(100)
    const deImpreso = impreso.get(b.alicuotaIva)
    if (!conIva) {
      porAlicuota.push({ alicuotaIva: 3, base: aImporte(b.base), importe: '0.00' })
      continue
    }
    if (deImpreso !== undefined && monto(deImpreso).minus(calculado).abs().gt(TOLERANCIA_IVA)) {
      return {
        ok: false,
        error: `El IVA al ${TASAS_IVA[b.alicuotaIva]} % (${aImporte(deImpreso)}) no corresponde a la base ${aImporte(b.base)}: daría ${aImporte(calculado)}.`,
      }
    }
    porAlicuota.push({ alicuotaIva: b.alicuotaIva, base: aImporte(b.base), importe: aImporte(deImpreso ?? calculado) })
  }
  const neto = porAlicuota.reduce((s, a) => s.plus(a.base), new D(0))
  const iva = porAlicuota.reduce((s, a) => s.plus(a.importe), new D(0))
  const tributos = d.tributos.reduce((s, t) => s.plus(t.importe), new D(0))
  const total = neto.plus(iva).plus(d.noGravado).plus(d.exento).plus(tributos)
  return {
    ok: true,
    lineas,
    porAlicuota,
    neto: aImporte(neto),
    iva: aImporte(iva),
    tributos: aImporte(tributos),
    total: aImporte(total),
  }
}

type Resultado = { ok: true; id: string } | { ok: false; error: string }

/** Error de validación que revierte toda la transacción del comprobante. */
export class CompraInvalida extends Error {}

export async function registrarCompra(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  origen: 'erp' | 'mis_comprobantes' | 'pymexis' = 'erp',
): Promise<Resultado> {
  const p = EsquemaCompra.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  const [proveedor] = await tx.select().from(terceros).where(eq(terceros.id, d.terceroId))
  if (!proveedor) return { ok: false, error: 'Ese proveedor ya no existe.' }
  const tipo = codigoCompra(d.letra as 'A', d.clase, d.fce)
  if (tipo === null) return { ok: false, error: `No existe la factura de crédito electrónica ${d.letra}.` }
  if (d.moneda !== 'PES' && monto(d.cotizacion).lte(0)) return { ok: false, error: 'Escribí la cotización del dólar.' }

  const [repetida] = await tx
    .select({ id: compras.id })
    .from(compras)
    .where(
      and(
        eq(compras.terceroId, d.terceroId),
        eq(compras.tipo, tipo),
        eq(compras.puntoVenta, d.puntoVenta),
        eq(compras.numero, d.numero),
        eq(compras.estado, 'registrado'),
      ),
    )
  if (repetida) return { ok: false, error: 'Ese comprobante del proveedor ya está registrado.' }
  const cerrado = await controlarPeriodoIva(tx, d.periodoIva ?? d.fecha.slice(0, 7))
  if (cerrado) return { ok: false, error: cerrado }

  const calculo = calcularCompra(d)
  if (!calculo.ok) return calculo

  // Artículos que mueven stock: necesitan depósito.
  const ids = d.items.map((i) => i.articuloId).filter((x): x is string => !!x)
  const conStock = new Set(
    ids.length
      ? (
          await tx
            .select({ id: articulos.id })
            .from(articulos)
            .where(and(inArray(articulos.id, ids), eq(articulos.llevaStock, true)))
        ).map((a) => a.id)
      : [],
  )
  if (conStock.size && !d.depositoId) return { ok: false, error: 'Elegí el depósito donde entra la mercadería.' }

  const [compra] = await tx
    .insert(compras)
    .values({
      clase: d.clase,
      letra: d.letra,
      tipo,
      puntoVenta: d.puntoVenta,
      numero: d.numero,
      fecha: d.fecha,
      periodoIva: d.periodoIva ?? d.fecha.slice(0, 7),
      terceroId: d.terceroId,
      cae: d.cae,
      vencimiento: d.vencimiento,
      moneda: d.moneda,
      cotizacion: d.moneda === 'PES' ? '1' : d.cotizacion,
      depositoId: conStock.size ? d.depositoId : null,
      ordenCompraId: d.ordenCompraId,
      neto: calculo.neto,
      noGravado: aImporte(d.noGravado),
      exento: aImporte(d.exento),
      iva: calculo.iva,
      tributos: calculo.tributos,
      total: calculo.total,
      origen,
      observaciones: d.observaciones,
      usuarioId,
    })
    .returning()

  if (d.items.length) {
    await tx.insert(comprasItems).values(
      d.items.map((i, n) => ({
        compraId: compra.id,
        orden: n + 1,
        articuloId: i.articuloId ?? null,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        descuento: i.descuento ?? '0',
        alicuotaIva: discriminaIva(d.letra) ? i.alicuotaIva : 3,
        neto: calculo.lineas[n].neto,
        iva: calculo.lineas[n].iva,
        ordenItemId: i.ordenItemId,
      })),
    )
  }
  if (discriminaIva(d.letra) && calculo.porAlicuota.length) {
    await tx.insert(comprasIva).values(calculo.porAlicuota.map((a) => ({ ...a, compraId: compra.id })))
  }
  if (d.tributos.length) {
    await tx.insert(comprasTributos).values(
      d.tributos.map((t) => ({
        compraId: compra.id,
        tipo: t.tipo,
        provincia: t.tipo === 'percepcion_iibb' ? t.provincia : null,
        importe: aImporte(t.importe),
      })),
    )
  }

  // Stock: la factura y la nota de débito entran; la nota de crédito (devolución) sale.
  const signo = d.clase === 'nota_credito' ? -1 : 1
  await registrarMovimientos(
    tx,
    usuarioId,
    d.items
      .filter((i) => i.articuloId && conStock.has(i.articuloId))
      .map((i) => ({
        articuloId: i.articuloId!,
        depositoId: d.depositoId!,
        cantidad: monto(i.cantidad).times(signo).toFixed(4),
        tipo: 'compra' as const,
        origenId: compra.id,
      })),
  )

  if (d.actualizarCosto && d.clase === 'factura') {
    for (const i of d.items) {
      if (!i.articuloId) continue
      const costo = monto(i.precioUnitario)
        .times(new D(100).minus(i.descuento ?? 0))
        .dividedBy(100)
      await tx
        .update(articulos)
        .set({ costo: costo.toFixed(4), monedaCosto: d.moneda })
        .where(eq(articulos.id, i.articuloId))
    }
  }

  if (d.ordenCompraId) await actualizarEstadoOrden(tx, d.ordenCompraId)

  if (d.clase === 'nota_credito' && d.aplicarA) {
    const [destino] = await pendientesCompras(tx, { ids: [d.aplicarA] })
    if (!destino || destino.terceroId !== d.terceroId)
      throw new CompraInvalida('La factura a la que se aplica la nota no es de este proveedor.')
    if (destino.moneda !== compra.moneda)
      throw new CompraInvalida('La nota de crédito y la factura tienen que estar en la misma moneda.')
    const importe = D.min(monto(compra.total), monto(destino.saldo))
    if (importe.gt(0)) {
      await tx.insert(imputacionesCompras).values({
        notaCreditoId: compra.id,
        compraId: destino.id,
        importe: aImporte(importe),
        importeOrigen: aImporte(importe),
        fecha: d.fecha,
      })
    }
  }

  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'compra', entidadId: compra.id, despues: { tipo, ...d } })
  return { ok: true, id: compra.id }
}

/** Lo imputado a cada compra (en su moneda), sin contar pagos anulados ni notas anuladas. */
const imputado = sql<string>`coalesce((
  select sum(i.importe) from imputaciones_compras i
  left join pagos p on p.id = i.pago_id
  left join compras nc on nc.id = i.nota_credito_id
  where i.compra_id = compras.id and (p.estado = 'emitido' or nc.estado = 'registrado')
), 0)`

/** Facturas y notas de débito registradas con saldo (en su moneda), de un proveedor o por id. */
export async function pendientesCompras(tx: Transaccion, filtro: { terceroId?: string; ids?: string[] }) {
  const filas = await tx
    .select({
      id: compras.id,
      tipo: compras.tipo,
      letra: compras.letra,
      puntoVenta: compras.puntoVenta,
      numero: compras.numero,
      fecha: compras.fecha,
      vencimiento: compras.vencimiento,
      terceroId: compras.terceroId,
      moneda: compras.moneda,
      cotizacion: compras.cotizacion,
      neto: compras.neto,
      noGravado: compras.noGravado,
      exento: compras.exento,
      total: compras.total,
      imputado,
    })
    .from(compras)
    .where(
      and(
        eq(compras.estado, 'registrado'),
        inArray(compras.clase, ['factura', 'nota_debito']),
        filtro.terceroId ? eq(compras.terceroId, filtro.terceroId) : undefined,
        filtro.ids ? inArray(compras.id, filtro.ids.length ? filtro.ids : ['00000000-0000-0000-0000-000000000000']) : undefined,
      ),
    )
    .orderBy(asc(compras.fecha), asc(compras.numero))
  return filas
    .map((f) => ({ ...f, saldo: aImporte(monto(f.total).minus(f.imputado)) }))
    .filter((f) => filtro.ids || monto(f.saldo).gt(0))
}

/** Estado de una orden de compra según lo recibido en comprobantes registrados. */
export async function actualizarEstadoOrden(tx: Transaccion, ordenId: string) {
  const [orden] = await tx.select().from(ordenesCompra).where(eq(ordenesCompra.id, ordenId))
  if (!orden || orden.estado === 'cancelada') return
  const items = await tx
    .select({
      id: ordenesCompraItems.id,
      cantidad: ordenesCompraItems.cantidad,
      recibido: sql<string>`coalesce((
        select sum(ci.cantidad) from compras_items ci join compras c on c.id = ci.compra_id
        where ci.orden_item_id = ordenes_compra_items.id and c.estado = 'registrado' and c.clase <> 'nota_credito'
      ), 0)`,
    })
    .from(ordenesCompraItems)
    .where(eq(ordenesCompraItems.ordenId, ordenId))
  const nada = items.every((i) => monto(i.recibido).lte(0))
  const todo = items.every((i) => monto(i.recibido).gte(i.cantidad))
  const estado = todo ? 'recibida' : nada ? 'pendiente' : 'parcial'
  if (estado !== orden.estado) await tx.update(ordenesCompra).set({ estado }).where(eq(ordenesCompra.id, ordenId))
}

export async function anularCompra(tx: Transaccion, usuarioId: string, id: string) {
  const [c] = await tx.select().from(compras).where(eq(compras.id, id)).for('update')
  if (!c) return { ok: false as const, error: 'Ese comprobante ya no existe.' }
  if (c.estado === 'anulado') return { ok: false as const, error: 'El comprobante ya está anulado.' }
  const cerrado = await controlarPeriodoIva(tx, c.periodoIva)
  if (cerrado) return { ok: false as const, error: cerrado }
  const [aplicado] = filasDe<{ n: number }>(
    await tx.execute(sql`
      select count(*)::int as n from imputaciones_compras i
      left join pagos p on p.id = i.pago_id
      left join compras nc on nc.id = i.nota_credito_id
      where i.compra_id = ${id} and (p.estado = 'emitido' or nc.estado = 'registrado')
    `),
  )
  // Una nota de crédito se puede anular aunque esté aplicada (su aplicación deja de contar);
  // una factura pagada no: primero se anula el pago o la nota.
  if (aplicado.n > 0) {
    return { ok: false as const, error: 'El comprobante tiene pagos o notas de crédito aplicados: anulá primero el pago.' }
  }
  const items = await tx.select().from(comprasItems).where(eq(comprasItems.compraId, id))
  if (c.depositoId) {
    const signo = c.clase === 'nota_credito' ? 1 : -1
    const conStock = await tx
      .select({ id: articulos.id })
      .from(articulos)
      .where(
        and(
          inArray(
            articulos.id,
            items
              .map((i) => i.articuloId)
              .filter((x): x is string => !!x)
              .concat('00000000-0000-0000-0000-000000000000'),
          ),
          eq(articulos.llevaStock, true),
        ),
      )
    const ids = new Set(conStock.map((a) => a.id))
    await registrarMovimientos(
      tx,
      usuarioId,
      items
        .filter((i) => i.articuloId && ids.has(i.articuloId))
        .map((i) => ({
          articuloId: i.articuloId!,
          depositoId: c.depositoId!,
          cantidad: monto(i.cantidad).times(signo).toFixed(4),
          tipo: 'anulacion_compra' as const,
          origenId: c.id,
        })),
    )
  }
  await tx.update(compras).set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId }).where(eq(compras.id, id))
  if (c.ordenCompraId) await actualizarEstadoOrden(tx, c.ordenCompraId)
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'compra', entidadId: id, antes: { estado: c.estado } })
  return { ok: true as const }
}

export async function obtenerCompra(tx: Transaccion, id: string) {
  const [c] = await tx.select().from(compras).where(eq(compras.id, id))
  if (!c) return null
  const [items, detalleIva, detalleTributos, [proveedor], aplicaciones] = await Promise.all([
    tx.select().from(comprasItems).where(eq(comprasItems.compraId, id)).orderBy(asc(comprasItems.orden)),
    tx.select().from(comprasIva).where(eq(comprasIva.compraId, id)).orderBy(asc(comprasIva.alicuotaIva)),
    tx.select().from(comprasTributos).where(eq(comprasTributos.compraId, id)),
    tx.select().from(terceros).where(eq(terceros.id, c.terceroId)),
    tx.execute(sql`
      select i.id, i.importe, i.importe_origen as "importeOrigen", i.fecha,
        i.pago_id as "pagoId", p.numero as "pagoNumero", p.estado as "pagoEstado", p.moneda as "pagoMoneda",
        i.nota_credito_id as "notaCreditoId", nc.tipo as "ncTipo", nc.punto_venta as "ncPuntoVenta",
        nc.numero as "ncNumero", nc.estado as "ncEstado",
        i.compra_id as "compraId", f.tipo as "fTipo", f.punto_venta as "fPuntoVenta", f.numero as "fNumero"
      from imputaciones_compras i
      left join pagos p on p.id = i.pago_id
      left join compras nc on nc.id = i.nota_credito_id
      join compras f on f.id = i.compra_id
      where i.compra_id = ${id} or i.nota_credito_id = ${id}
      order by i.fecha, i.creado
    `),
  ])
  const filas = filasDe<{
    id: string
    importe: string
    importeOrigen: string
    fecha: string
    pagoId: string | null
    pagoNumero: number | null
    pagoEstado: string | null
    pagoMoneda: string | null
    notaCreditoId: string | null
    ncTipo: number | null
    ncPuntoVenta: number | null
    ncNumero: number | null
    ncEstado: string | null
    compraId: string
    fTipo: number
    fPuntoVenta: number
    fNumero: number
  }>(aplicaciones)
  const vigentes = filas.filter((f) => f.pagoEstado === 'emitido' || f.ncEstado === 'registrado')
  const cancelado = vigentes.filter((f) => f.compraId === id).reduce((s, f) => s.plus(f.importe), new D(0))
  const aplicadoNc = vigentes.filter((f) => f.notaCreditoId === id).reduce((s, f) => s.plus(f.importeOrigen), new D(0))
  const saldo = c.clase === 'nota_credito' ? monto(c.total).minus(aplicadoNc) : monto(c.total).minus(cancelado)
  return { ...c, items, detalleIva, detalleTributos, proveedor, aplicaciones: filas, saldo: aImporte(saldo) }
}

export async function listarCompras(tx: Transaccion, filtro: { q?: string; periodo?: string; terceroId?: string } = {}) {
  const q = filtro.q?.trim()
  return tx
    .select({
      id: compras.id,
      tipo: compras.tipo,
      puntoVenta: compras.puntoVenta,
      numero: compras.numero,
      fecha: compras.fecha,
      periodoIva: compras.periodoIva,
      moneda: compras.moneda,
      total: compras.total,
      estado: compras.estado,
      origen: compras.origen,
      proveedor: terceros.razonSocial,
      terceroId: compras.terceroId,
    })
    .from(compras)
    .innerJoin(terceros, eq(terceros.id, compras.terceroId))
    .where(
      and(
        filtro.periodo ? eq(compras.periodoIva, filtro.periodo) : undefined,
        filtro.terceroId ? eq(compras.terceroId, filtro.terceroId) : undefined,
        q
          ? or(
              ilike(terceros.razonSocial, `%${q}%`),
              eq(terceros.numeroDocumento, q.replace(/\D/g, '') || '-'),
              /^\d+$/.test(q) ? eq(compras.numero, Number(q)) : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(desc(compras.fecha), desc(compras.creado))
    .limit(300)
}

/** Notas de crédito del proveedor con algo sin aplicar (en su moneda). */
export async function notasCreditoDisponibles(tx: Transaccion, terceroId: string) {
  const filas = await tx
    .select({
      id: compras.id,
      tipo: compras.tipo,
      puntoVenta: compras.puntoVenta,
      numero: compras.numero,
      fecha: compras.fecha,
      moneda: compras.moneda,
      total: compras.total,
      aplicado: sql<string>`coalesce((select sum(i.importe_origen) from imputaciones_compras i where i.nota_credito_id = compras.id), 0)`,
    })
    .from(compras)
    .where(and(eq(compras.terceroId, terceroId), eq(compras.clase, 'nota_credito'), eq(compras.estado, 'registrado')))
    .orderBy(asc(compras.fecha))
  return filas
    .map((f) => ({ ...f, disponible: aImporte(monto(f.total).minus(f.aplicado)) }))
    .filter((f) => monto(f.disponible).gt(0))
}

/** Aplica una nota de crédito del proveedor a facturas suyas de la misma moneda. */
export async function aplicarNotaCredito(
  tx: Transaccion,
  usuarioId: string,
  notaCreditoId: string,
  destinos: { compraId: string; importe: string }[],
  fecha: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validos = destinos.filter((x) => monto(x.importe).gt(0))
  if (!validos.length) return { ok: true }
  const [nc] = (await notasCreditoDisponibles(tx, (await terceroDe(tx, notaCreditoId)) ?? '')).filter(
    (n) => n.id === notaCreditoId,
  )
  if (!nc) return { ok: false, error: 'La nota de crédito no tiene saldo para aplicar.' }
  const total = validos.reduce((s, x) => s.plus(x.importe), new D(0))
  if (total.gt(nc.disponible)) return { ok: false, error: `Se aplican ${aImporte(total)} y la nota tiene ${nc.disponible}.` }
  const deuda = new Map((await pendientesCompras(tx, { ids: validos.map((x) => x.compraId) })).map((p) => [p.id, p]))
  const [ncFila] = await tx.select().from(compras).where(eq(compras.id, notaCreditoId))
  for (const x of validos) {
    const f = deuda.get(x.compraId)
    if (!f || f.terceroId !== ncFila.terceroId) return { ok: false, error: 'Una de las facturas no es de este proveedor.' }
    if (f.moneda !== nc.moneda) return { ok: false, error: 'La nota y la factura tienen que estar en la misma moneda.' }
    if (monto(x.importe).gt(f.saldo)) return { ok: false, error: `A la factura ${f.numero} le quedan ${f.saldo}.` }
  }
  await tx.insert(imputacionesCompras).values(
    validos.map((x) => ({
      notaCreditoId,
      compraId: x.compraId,
      importe: aImporte(x.importe),
      importeOrigen: aImporte(x.importe),
      fecha,
    })),
  )
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'imputacion_compra', entidadId: notaCreditoId, despues: validos })
  return { ok: true }
}

/** Filas de un tx.execute (PGlite devuelve { rows }, postgres-js un arreglo). */
export function filasDe<T>(resultado: unknown): T[] {
  return (Array.isArray(resultado) ? resultado : (resultado as { rows: unknown[] }).rows) as T[]
}

async function terceroDe(tx: Transaccion, compraId: string) {
  const [c] = await tx.select({ terceroId: compras.terceroId }).from(compras).where(eq(compras.id, compraId))
  return c?.terceroId
}
