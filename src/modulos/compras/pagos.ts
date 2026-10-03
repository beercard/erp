import { and, asc, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import { controlarBloqueo } from '../empresa/bloqueos'
import type { Transaccion } from '../../db/conexion'
import {
  escalaGanancias,
  imputacionesCompras,
  pagos,
  pagosValores,
  regimenesGanancias,
  retenciones,
  retencionesConfiguracion,
  terceros,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { decimal, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { filasDe, pendientesCompras } from './compras'
import { calcularRetencionGanancias, type ResultadoRetencion } from './ganancias'
import { resolverCuenta } from '../tesoreria/cuentas'
import { MEDIOS_PAGO_CON_CUENTA } from '../tesoreria/medios'
import { MEDIOS_PAGO } from './medios'

/**
 * Órdenes de pago. El pago cancela comprobantes del proveedor (en su moneda)
 * y lo que sobra queda a cuenta. Si corresponde, se le retiene Ganancias: lo
 * retenido también cancela deuda, así que se entrega en valores lo que
 * cancela menos la retención.
 */

export { MEDIOS_PAGO } from './medios'

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)

const EsquemaValor = z
  .object({
    medio: z.enum(Object.keys(MEDIOS_PAGO) as [keyof typeof MEDIOS_PAGO, ...(keyof typeof MEDIOS_PAGO)[]]),
    importe: decimal('Cada valor necesita un importe mayor que cero.').refine((v) => Number(v) > 0, {
      error: 'Cada valor necesita un importe mayor que cero.',
    }),
    detalle: texto,
    banco: texto,
    numeroValor: texto,
    fechaPago: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .pipe(z.iso.date().nullable()),
    reciboValorId: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .pipe(z.uuid().nullable()),
    /** Caja, banco o tarjeta de donde sale; vacío: la predeterminada del medio. */
    cuentaId: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .pipe(z.uuid().nullable()),
  })
  .refine((v) => !['cheque_propio', 'echeq_propio'].includes(v.medio) || (v.banco && v.numeroValor && v.fechaPago), {
    error: 'Los cheques propios necesitan banco, número y fecha de pago.',
  })
  .refine((v) => (v.medio === 'cheque_tercero') === !!v.reciboValorId, {
    error: 'Elegí el cheque de terceros de la cartera.',
  })

export const EsquemaPago = z.object({
  terceroId: z.uuid({ error: 'Elegí el proveedor.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  moneda: z.enum(['PES', 'DOL']).default('PES'),
  /** Dólar del día: convierte entre la moneda del pago y la de los comprobantes. */
  cotizacion: decimal('Escribí la cotización del dólar.').default('1'),
  imputaciones: z.array(z.object({ compraId: z.uuid(), importe: decimal('Importe inválido.') })).default([]),
  /** Lo que se paga sin aplicar a comprobantes, en la moneda del pago. */
  aCuenta: decimal('Importe a cuenta inválido.').default('0'),
  valores: z.array(EsquemaValor).default([]),
  observaciones: texto,
})

export type EntradaPago = z.input<typeof EsquemaPago>

/** Convierte un importe entre pesos y dólares con la cotización del pago. */
function convertir(importe: string, de: string, a: string, cotizacion: string) {
  if (de === a) return monto(importe)
  return a === 'PES' ? monto(importe).times(cotizacion) : monto(importe).dividedBy(cotizacion)
}

export type Liquidacion = {
  destinos: { compraId: string; importe: string; importeOrigen: string; basePesos: string }[]
  /** Lo que cancela el pago, en su moneda. */
  cancelado: string
  basePesos: string
  regimen: string | null
  retencion: (ResultadoRetencion & { concepto: string }) | null
  /** La retención en la moneda del pago. */
  retencionMonedaPago: string
  /** Lo que se entrega en valores. */
  aPagar: string
}

/**
 * Calcula el pago sin grabarlo: cuánto cancela, la retención de Ganancias y
 * cuánto hay que entregar. Lo usa la pantalla (vista previa) y la emisión.
 */
export async function liquidarPago(
  tx: Transaccion,
  d: z.infer<typeof EsquemaPago>,
): Promise<{ ok: true; liquidacion: Liquidacion } | { ok: false; error: string }> {
  const [proveedor] = await tx.select().from(terceros).where(eq(terceros.id, d.terceroId))
  if (!proveedor) return { ok: false, error: 'Ese proveedor ya no existe.' }
  const cot = d.moneda === 'PES' && !monto(d.cotizacion).gt(0) ? '1' : d.cotizacion
  if (!monto(cot).gt(0)) return { ok: false, error: 'Escribí la cotización del dólar.' }

  const validas = d.imputaciones.filter((i) => monto(i.importe).gt(0))
  const deuda = new Map((await pendientesCompras(tx, { ids: validas.map((i) => i.compraId) })).map((p) => [p.id, p]))
  const destinos: Liquidacion['destinos'] = []
  for (const i of validas) {
    const c = deuda.get(i.compraId)
    if (!c || c.terceroId !== d.terceroId) return { ok: false, error: 'Uno de los comprobantes no es de este proveedor.' }
    if (monto(i.importe).gt(c.saldo)) {
      return {
        ok: false,
        error: `Al comprobante ${c.numero} le quedan ${c.saldo}: no se le puede aplicar ${aImporte(i.importe)}.`,
      }
    }
    if (c.moneda !== d.moneda && c.moneda !== 'PES' && d.moneda !== 'PES') {
      return { ok: false, error: 'Solo se mezclan pesos y dólares.' }
    }
    if (c.moneda !== d.moneda && monto(cot).eq(1)) {
      return { ok: false, error: 'Hay comprobantes en otra moneda: escribí la cotización del dólar del día.' }
    }
    const importeOrigen = convertir(i.importe, c.moneda, d.moneda, cot)
    const importePesos = convertir(aImporte(importeOrigen), d.moneda, 'PES', cot)
    // Ganancias se retiene sobre lo pagado sin IVA ni percepciones.
    const proporcion = monto(c.total).gt(0) ? monto(c.neto).plus(c.noGravado).plus(c.exento).dividedBy(c.total) : new D(1)
    destinos.push({
      compraId: c.id,
      importe: aImporte(i.importe),
      importeOrigen: aImporte(importeOrigen),
      basePesos: aImporte(importePesos.times(proporcion)),
    })
  }
  const aCuenta = monto(d.aCuenta)
  const cancelado = destinos.reduce((s, x) => s.plus(x.importeOrigen), new D(0)).plus(aCuenta)
  // Un pago a cuenta a un inscripto se supone con IVA al 21 %.
  const aCuentaPesos = convertir(aImporte(aCuenta), d.moneda, 'PES', cot)
  const baseACuenta = proveedor.condicionIva === 1 ? aCuentaPesos.dividedBy('1.21') : aCuentaPesos
  const basePesos = destinos.reduce((s, x) => s.plus(x.basePesos), new D(0)).plus(baseACuenta)

  let retencion: Liquidacion['retencion'] = null
  let regimen: string | null = null
  const [config] = await tx.select().from(retencionesConfiguracion)
  // Monotributistas (6) no sufren retención de Ganancias por sus ventas.
  if (config?.gananciasActiva && proveedor.regimenGanancias && proveedor.condicionIva !== 6 && basePesos.gt(0)) {
    const [r] = await tx
      .select()
      .from(regimenesGanancias)
      .where(and(eq(regimenesGanancias.codigo, proveedor.regimenGanancias), eq(regimenesGanancias.activo, true)))
    if (r) {
      regimen = r.codigo
      const mes = d.fecha.slice(0, 7)
      const desde = `${mes}-01`
      const [anio, m] = mes.split('-').map(Number)
      const hasta = m === 12 ? `${anio + 1}-01-01` : `${anio}-${String(m + 1).padStart(2, '0')}-01`
      const delMes = and(
        eq(pagos.terceroId, d.terceroId),
        eq(pagos.regimenGanancias, r.codigo),
        eq(pagos.estado, 'emitido'),
        gte(pagos.fecha, desde),
        lt(pagos.fecha, hasta),
      )
      const [anterior] = await tx
        .select({ base: sql<string>`coalesce(sum(${pagos.baseGanancias}), 0)` })
        .from(pagos)
        .where(delMes)
      const [retenido] = await tx
        .select({ total: sql<string>`coalesce(sum(${retenciones.importe}), 0)` })
        .from(retenciones)
        .innerJoin(pagos, eq(pagos.id, retenciones.pagoId))
        .where(and(delMes, eq(retenciones.impuesto, 'ganancias')))
      const escala = r.usaEscala ? await tx.select().from(escalaGanancias) : []
      retencion = {
        ...calcularRetencionGanancias({
          regimen: r,
          escala,
          inscripto: proveedor.gananciasInscripto,
          baseAnteriorMes: anterior.base,
          basePago: aImporte(basePesos),
          retenidoMes: retenido.total,
        }),
        concepto: r.concepto,
      }
    }
  }
  const retencionMonedaPago = retencion ? convertir(retencion.importe, 'PES', d.moneda, cot) : new D(0)
  return {
    ok: true,
    liquidacion: {
      destinos,
      cancelado: aImporte(cancelado),
      basePesos: aImporte(basePesos),
      regimen,
      retencion,
      retencionMonedaPago: aImporte(retencionMonedaPago),
      aPagar: aImporte(cancelado.minus(retencionMonedaPago)),
    },
  }
}

/** Cheques y ECHEQ recibidos de clientes que todavía no se entregaron. */
export async function chequesEnCartera(tx: Transaccion, ids?: string[]) {
  return filasDe<{
    id: string
    medio: string
    importe: string
    banco: string | null
    numeroValor: string | null
    fechaPago: string | null
    cuitLibrador: string | null
    cliente: string
    reciboNumero: number
  }>(
    await tx.execute(sql`
      select rv.id, rv.medio, rv.importe, rv.banco, rv.numero_valor as "numeroValor", rv.fecha_pago as "fechaPago",
        rv.cuit_librador as "cuitLibrador", t.razon_social as cliente, r.numero as "reciboNumero"
      from recibos_valores rv
      join recibos r on r.id = rv.recibo_id and r.estado = 'emitido'
      join terceros t on t.id = r.tercero_id
      where rv.medio in ('cheque', 'echeq')
        and not exists (
          select 1 from pagos_valores pv join pagos p on p.id = pv.pago_id
          where pv.recibo_valor_id = rv.id and p.estado = 'emitido'
        )
        and not exists (
          select 1 from movimientos_tesoreria m
          where m.cheque_id = rv.id and m.tipo = 'deposito_cheque' and m.estado = 'vigente'
        )
        and not exists (select 1 from cheques_rechazados cr where cr.cheque_id = rv.id)
        ${ids ? sql`and rv.id in ${ids.length ? ids : ['00000000-0000-0000-0000-000000000000']}` : sql``}
      order by rv.fecha_pago nulls last, rv.importe
    `),
  )
}

export async function emitirPago(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
): Promise<{ ok: true; id: string; numero: number } | { ok: false; error: string }> {
  const p = EsquemaPago.safeParse(entrada)
  if (!p.success) {
    const i = p.error.issues[0]
    const donde = i.path[0] === 'valores' && typeof i.path[1] === 'number' ? `Valor ${i.path[1] + 1}: ` : ''
    return { ok: false, error: donde + (donde ? i.message : primerError(p.error)) }
  }
  const d = p.data
  const cerrado = await controlarBloqueo(tx, 'compras', d.fecha)
  if (cerrado) return { ok: false, error: cerrado }
  const r = await liquidarPago(tx, d)
  if (!r.ok) return r
  const l = r.liquidacion
  if (!monto(l.cancelado).gt(0)) return { ok: false, error: 'Elegí qué comprobantes se pagan o escribí un importe a cuenta.' }
  const entregado = d.valores.reduce((s, v) => s.plus(v.importe), new D(0))
  if (entregado.minus(l.aPagar).abs().gt('0.009')) {
    return {
      ok: false,
      error: `Los valores suman ${aImporte(entregado)} y hay que entregar ${l.aPagar}${monto(l.retencionMonedaPago).gt(0) ? ` (se retienen ${l.retencionMonedaPago})` : ''}.`,
    }
  }
  const terceros_ = d.valores.filter((v) => v.medio === 'cheque_tercero').map((v) => v.reciboValorId!)
  if (new Set(terceros_).size !== terceros_.length) return { ok: false, error: 'Un cheque de terceros está dos veces.' }
  if (terceros_.length) {
    if (d.moneda !== 'PES') return { ok: false, error: 'Los cheques de terceros son en pesos: el pago tiene que ser en pesos.' }
    const cartera = new Map((await chequesEnCartera(tx, terceros_)).map((c) => [c.id, c]))
    for (const v of d.valores.filter((x) => x.medio === 'cheque_tercero')) {
      const c = cartera.get(v.reciboValorId!)
      if (!c) return { ok: false, error: 'Uno de los cheques de terceros ya no está en cartera.' }
      if (!monto(c.importe).eq(v.importe))
        return { ok: false, error: `El cheque ${c.numeroValor} es de $ ${c.importe}: se entrega entero.` }
    }
  }

  // Cuenta de tesorería de cada valor (la elegida o la predeterminada del medio).
  const cuentas: (string | null)[] = []
  for (const v of d.valores) {
    const c = await resolverCuenta(tx, v, { moneda: d.moneda, medios: MEDIOS_PAGO_CON_CUENTA })
    if (!c.ok) return c
    cuentas.push(c.cuentaId)
  }

  const numero = await siguienteNumero(tx, 'orden_pago')
  const [pago] = await tx
    .insert(pagos)
    .values({
      numero,
      fecha: d.fecha,
      terceroId: d.terceroId,
      moneda: d.moneda,
      cotizacion: d.moneda === 'PES' && !monto(d.cotizacion).gt(0) ? '1' : d.cotizacion,
      total: l.cancelado,
      baseGanancias: l.regimen ? l.basePesos : '0',
      regimenGanancias: l.regimen,
      observaciones: d.observaciones,
      usuarioId,
    })
    .returning()
  if (d.valores.length) {
    await tx.insert(pagosValores).values(
      d.valores.map((v, n) => ({
        pagoId: pago.id,
        cuentaId: cuentas[n],
        medio: v.medio,
        importe: aImporte(v.importe),
        detalle: v.detalle,
        banco: v.banco,
        numeroValor: v.numeroValor,
        fechaPago: v.fechaPago,
        reciboValorId: v.reciboValorId,
      })),
    )
  }
  if (l.retencion && monto(l.retencion.importe).gt(0)) {
    await tx.insert(retenciones).values({
      pagoId: pago.id,
      impuesto: 'ganancias',
      regimen: l.regimen,
      numero: await siguienteNumero(tx, 'certificado_ganancias'),
      base: l.retencion.base,
      alicuota: l.retencion.alicuota,
      importe: l.retencion.importe,
    })
  }
  if (l.destinos.length) {
    await tx.insert(imputacionesCompras).values(
      l.destinos.map((x) => ({
        pagoId: pago.id,
        compraId: x.compraId,
        importe: x.importe,
        importeOrigen: x.importeOrigen,
        fecha: d.fecha,
      })),
    )
  }
  await auditar(tx, {
    usuarioId,
    accion: 'emision',
    entidad: 'pago',
    entidadId: pago.id,
    despues: { numero, ...d, liquidacion: l },
  })
  return { ok: true, id: pago.id, numero }
}

/** Anula el pago: la deuda vuelve, los cheques de terceros vuelven a cartera y la retención queda sin efecto. */
export async function anularPago(tx: Transaccion, usuarioId: string, id: string) {
  const [pg] = await tx.select().from(pagos).where(eq(pagos.id, id)).for('update')
  if (!pg) return { ok: false as const, error: 'Ese pago ya no existe.' }
  if (pg.estado === 'anulado') return { ok: false as const, error: 'El pago ya está anulado.' }
  const cerrado = await controlarBloqueo(tx, 'compras', pg.fecha)
  if (cerrado) return { ok: false as const, error: cerrado }
  await tx.update(pagos).set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId }).where(eq(pagos.id, id))
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'pago', entidadId: id, antes: { estado: pg.estado } })
  return { ok: true as const }
}

export async function obtenerPago(tx: Transaccion, id: string) {
  const [pg] = await tx.select().from(pagos).where(eq(pagos.id, id))
  if (!pg) return null
  const [valores, rets, aplicado, [proveedor]] = await Promise.all([
    tx.select().from(pagosValores).where(eq(pagosValores.pagoId, id)),
    tx.select().from(retenciones).where(eq(retenciones.pagoId, id)),
    tx.execute(sql`
      select i.id, i.importe, i.importe_origen as "importeOrigen", c.id as "compraId", c.tipo, c.punto_venta as "puntoVenta",
        c.numero, c.fecha, c.moneda, c.total
      from imputaciones_compras i join compras c on c.id = i.compra_id
      where i.pago_id = ${id}
      order by c.fecha, c.numero
    `),
    tx.select().from(terceros).where(eq(terceros.id, pg.terceroId)),
  ])
  const imputaciones = filasDe<{
    id: string
    importe: string
    importeOrigen: string
    compraId: string
    tipo: number
    puntoVenta: number
    numero: number
    fecha: string
    moneda: string
    total: string
  }>(aplicado)
  const imputadoTotal = imputaciones.reduce((s, x) => s.plus(x.importeOrigen), new D(0))
  const regimen = pg.regimenGanancias
    ? (await tx.select().from(regimenesGanancias).where(eq(regimenesGanancias.codigo, pg.regimenGanancias)))[0]
    : undefined
  return {
    ...pg,
    valores,
    retenciones: rets,
    imputaciones,
    proveedor,
    regimen,
    aCuenta: aImporte(monto(pg.total).minus(imputadoTotal)),
  }
}

export async function listarPagos(tx: Transaccion, q?: string) {
  const t = q?.trim()
  return tx
    .select({
      id: pagos.id,
      numero: pagos.numero,
      fecha: pagos.fecha,
      moneda: pagos.moneda,
      total: pagos.total,
      estado: pagos.estado,
      proveedor: terceros.razonSocial,
      retenido: sql<string>`coalesce((select sum(r.importe) from retenciones r where r.pago_id = pagos.id), 0)`,
    })
    .from(pagos)
    .innerJoin(terceros, eq(terceros.id, pagos.terceroId))
    .where(t ? or(ilike(terceros.razonSocial, `%${t}%`), /^\d+$/.test(t) ? eq(pagos.numero, Number(t)) : undefined) : undefined)
    .orderBy(desc(pagos.fecha), desc(pagos.numero))
    .limit(300)
}

/** Retenciones practicadas en un período (para el listado y la presentación). */
export async function listarRetenciones(tx: Transaccion, filtro: { desde: string; hasta: string }) {
  return tx
    .select({
      id: retenciones.id,
      impuesto: retenciones.impuesto,
      regimen: retenciones.regimen,
      numero: retenciones.numero,
      base: retenciones.base,
      alicuota: retenciones.alicuota,
      importe: retenciones.importe,
      fecha: pagos.fecha,
      pagoId: pagos.id,
      pagoNumero: pagos.numero,
      estado: pagos.estado,
      proveedor: terceros.razonSocial,
      cuit: terceros.numeroDocumento,
    })
    .from(retenciones)
    .innerJoin(pagos, eq(pagos.id, retenciones.pagoId))
    .innerJoin(terceros, eq(terceros.id, pagos.terceroId))
    .where(and(gte(pagos.fecha, filtro.desde), lt(pagos.fecha, filtro.hasta)))
    .orderBy(asc(retenciones.impuesto), asc(retenciones.numero))
}
