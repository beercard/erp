import { and, asc, eq, ne, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { cuentasTesoreria } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { primerError } from '../comercial/documentos'
import { filasDe } from '../compras/compras'
import { MEDIOS_PREDETERMINABLES, TIPOS_CUENTA } from './medios'

/**
 * Cuentas de tesorería y sus movimientos. El saldo no se guarda: es la suma
 * de lo que entró por recibos emitidos, lo que salió por pagos emitidos y los
 * movimientos de tesorería vigentes.
 */

const EsquemaCuenta = z.object({
  codigo: z.string().trim().min(1, { error: 'Escribí un código corto (por ejemplo, ICBC).' }).max(20),
  nombre: z.string().trim().min(2, { error: 'Escribí el nombre de la cuenta.' }),
  tipo: z.enum(Object.keys(TIPOS_CUENTA) as [string, ...string[]]),
  moneda: z.enum(['PES', 'DOL']).default('PES'),
  banco: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  numeroCuenta: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  cbu: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '') : null))
    .refine((v) => !v || v.length === 22, { error: 'El CBU tiene 22 dígitos.' }),
  mediosPredeterminados: z.array(z.enum(Object.keys(MEDIOS_PREDETERMINABLES) as [string, ...string[]])).default([]),
  activa: z.boolean().default(true),
})

export async function guardarCuenta(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaCuenta.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const [repetida] = await tx
    .select({ id: cuentasTesoreria.id })
    .from(cuentasTesoreria)
    .where(and(eq(cuentasTesoreria.codigo, d.codigo), id ? ne(cuentasTesoreria.id, id) : undefined))
  if (repetida) return { ok: false as const, error: `Ya hay una cuenta con el código ${d.codigo}.` }
  // Cada medio tiene una sola cuenta predeterminada: se la saca a las demás.
  for (const medio of d.mediosPredeterminados) {
    await tx
      .update(cuentasTesoreria)
      .set({ mediosPredeterminados: sql`array_remove(${cuentasTesoreria.mediosPredeterminados}, ${medio})` })
      .where(id ? ne(cuentasTesoreria.id, id) : undefined)
  }
  let cuentaId = id
  if (id) {
    const [c] = await tx.update(cuentasTesoreria).set(d).where(eq(cuentasTesoreria.id, id)).returning()
    if (!c) return { ok: false as const, error: 'Esa cuenta ya no existe.' }
  } else {
    cuentaId = (await tx.insert(cuentasTesoreria).values(d).returning())[0].id
  }
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'cuenta_tesoreria',
    entidadId: cuentaId,
    despues: d,
  })
  return { ok: true as const, id: cuentaId! }
}

/** La cuenta por defecto de un medio de cobro o de pago (o nula si no hay). */
export async function cuentaPredeterminada(tx: Transaccion, medio: string) {
  const [c] = await tx
    .select()
    .from(cuentasTesoreria)
    .where(and(eq(cuentasTesoreria.activa, true), sql`${medio} = any(${cuentasTesoreria.mediosPredeterminados})`))
  return c ?? null
}

export type MovimientoCuenta = {
  origen: 'recibo_valor' | 'pago_valor' | 'movimiento'
  id: string
  fecha: string
  importe: string
  tipo: string
  descripcion: string
  /** Recibo, pago o movimiento al que lleva el enlace. */
  documentoId: string
  numero: number | null
  conciliado: boolean
}

/** Todo lo que entró y salió de una cuenta, en orden. */
export function libro(cuentaId: string) {
  return sql`
    select 'recibo_valor' as origen, rv.id, r.fecha, rv.importe::numeric as importe, rv.medio as tipo,
      'Recibo ' || lpad(r.numero::text, 8, '0') || ' · ' || t.razon_social as descripcion,
      r.id as "documentoId", r.numero, r.creado
    from recibos_valores rv
    join recibos r on r.id = rv.recibo_id and r.estado = 'emitido'
    join terceros t on t.id = r.tercero_id
    where rv.cuenta_id = ${cuentaId}
    union all
    select 'pago_valor', pv.id,
      case when pv.medio in ('cheque_propio', 'echeq_propio') then coalesce(pv.fecha_pago, p.fecha) else p.fecha end,
      -pv.importe, pv.medio,
      'Orden de pago ' || lpad(p.numero::text, 6, '0') || ' · ' || t.razon_social
        || coalesce(' · cheque ' || pv.numero_valor, ''),
      p.id, p.numero, p.creado
    from pagos_valores pv
    join pagos p on p.id = pv.pago_id and p.estado = 'emitido'
    join terceros t on t.id = p.tercero_id
    where pv.cuenta_id = ${cuentaId}
    union all
    select 'movimiento', m.id, m.fecha, m.importe, m.tipo,
      coalesce(m.concepto || ' · ', '') || coalesce(m.detalle, '') || coalesce(' (' || m.comprobante || ')', ''),
      m.id, null, m.creado
    from movimientos_tesoreria m
    where m.cuenta_id = ${cuentaId} and m.estado = 'vigente'
  `
}

export async function movimientosCuenta(tx: Transaccion, cuentaId: string, filtro: { desde?: string; hasta?: string } = {}) {
  const filas = filasDe<
    Omit<MovimientoCuenta, 'conciliado' | 'importe'> & { importe: string; creado: Date; conciliado: boolean }
  >(
    await tx.execute(sql`
      select l.*, exists (select 1 from conciliaciones c where c.origen = l.origen and c.origen_id = l.id) as conciliado
      from (${libro(cuentaId)}) l
      where (${filtro.hasta ?? null}::date is null or l.fecha <= ${filtro.hasta ?? null}::date)
      order by l.fecha, l.creado
    `),
  )
  // Saldo acumulado: el de antes del período más los movimientos del período.
  let saldo = new D(0)
  const conSaldo = filas.map((f) => {
    saldo = saldo.plus(f.importe)
    return { ...f, importe: aImporte(f.importe), saldo: aImporte(saldo) }
  })
  const desde = filtro.desde
  const anterior = desde ? conSaldo.filter((f) => f.fecha < desde) : []
  return {
    saldoAnterior: anterior.length ? anterior.at(-1)!.saldo : '0.00',
    movimientos: desde ? conSaldo.filter((f) => f.fecha >= desde) : conSaldo,
    saldo: aImporte(saldo),
  }
}

/** Saldo de cada cuenta (a una fecha, por defecto hoy y lo que venga: cheques diferidos incluidos). */
export async function saldosCuentas(tx: Transaccion, hasta?: string) {
  const cuentas = await tx.select().from(cuentasTesoreria).orderBy(asc(cuentasTesoreria.tipo), asc(cuentasTesoreria.codigo))
  const saldos = filasDe<{ cuentaId: string; saldo: string; aFuturo: string }>(
    await tx.execute(sql`
      select cuenta_id as "cuentaId",
        coalesce(sum(importe) filter (where ${hasta ?? null}::date is null or fecha <= ${hasta ?? null}::date), 0)::text as saldo,
        coalesce(sum(importe) filter (where fecha > current_date), 0)::text as "aFuturo"
      from (
        select rv.cuenta_id, r.fecha, rv.importe from recibos_valores rv join recibos r on r.id = rv.recibo_id and r.estado = 'emitido'
        where rv.cuenta_id is not null
        union all
        select pv.cuenta_id,
          case when pv.medio in ('cheque_propio', 'echeq_propio') then coalesce(pv.fecha_pago, p.fecha) else p.fecha end,
          -pv.importe
        from pagos_valores pv join pagos p on p.id = pv.pago_id and p.estado = 'emitido'
        where pv.cuenta_id is not null
        union all
        select cuenta_id, fecha, importe from movimientos_tesoreria where estado = 'vigente'
      ) m
      group by cuenta_id
    `),
  )
  const porCuenta = new Map(saldos.map((s) => [s.cuentaId, s]))
  return cuentas.map((c) => ({
    ...c,
    saldo: aImporte(monto(porCuenta.get(c.id)?.saldo ?? '0')),
    /** Cheques propios diferidos que todavía no se debitaron (u otros movimientos a futuro). */
    aFuturo: aImporte(monto(porCuenta.get(c.id)?.aFuturo ?? '0')),
  }))
}

export async function saldoCuenta(tx: Transaccion, cuentaId: string, hasta?: string) {
  return (await saldosCuentas(tx, hasta)).find((c) => c.id === cuentaId)?.saldo ?? '0.00'
}

/**
 * Cuenta por la que entra o sale un valor de un recibo o de un pago: la
 * elegida o la predeterminada del medio. Los medios que no pasan por una
 * cuenta (cheques de terceros, retenciones) quedan sin cuenta.
 */
export async function resolverCuenta(
  tx: Transaccion,
  v: { medio: string; cuentaId?: string | null },
  o: { moneda: string; medios: string[] },
): Promise<{ ok: true; cuentaId: string | null } | { ok: false; error: string }> {
  if (!o.medios.includes(v.medio)) return { ok: true, cuentaId: null }
  const c = v.cuentaId
    ? (await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, v.cuentaId)))[0]
    : await cuentaPredeterminada(tx, v.medio)
  if (!c) {
    // Sin cuenta elegida ni predeterminada, el valor no impacta en tesorería.
    if (!v.cuentaId) return { ok: true, cuentaId: null }
    return { ok: false, error: 'La cuenta elegida ya no existe.' }
  }
  if (!c.activa) return { ok: false, error: `La cuenta ${c.nombre} está inactiva.` }
  if (c.moneda !== o.moneda)
    return {
      ok: false,
      error: `La cuenta ${c.nombre} es en ${c.moneda === 'DOL' ? 'dólares' : 'pesos'}: no coincide con la moneda.`,
    }
  if ((v.medio === 'cheque_propio' || v.medio === 'echeq_propio') && c.tipo !== 'banco') {
    return { ok: false, error: 'Los cheques propios salen de una cuenta bancaria.' }
  }
  if (v.medio === 'tarjeta' && c.tipo !== 'tarjeta') return { ok: false, error: 'Elegí la tarjeta de crédito de la empresa.' }
  return { ok: true, cuentaId: c.id }
}
