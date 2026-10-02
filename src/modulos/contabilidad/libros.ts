import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { asientos, asientosLineas, cuentasContables, ejercicios, terceros } from '../../db/schema'
import type { Hoja } from '../../lib/xlsx'
import { filasDe } from '../compras/compras'
import { planDeCuentas, type TipoCuenta } from './plan'

/**
 * Libros e informes contables: diario, mayor, sumas y saldos, estado de
 * resultados y situación patrimonial. Todo sale de los asientos
 * registrados (los anulados por contraasiento suman cero).
 */

const r2 = (n: number) => Math.round(n * 100) / 100 + 0

// ---------------------------------------------------------------- Libro diario

export async function libroDiario(tx: Transaccion, desde: string, hasta: string) {
  const lista = await tx
    .select()
    .from(asientos)
    .where(and(eq(asientos.estado, 'registrado'), gte(asientos.fecha, desde), lte(asientos.fecha, hasta)))
    .orderBy(asc(asientos.fecha), asc(asientos.numero))
  const lineas = lista.length
    ? await tx
        .select({
          asientoId: asientosLineas.asientoId,
          codigo: cuentasContables.codigo,
          cuenta: cuentasContables.nombre,
          debe: asientosLineas.debe,
          haber: asientosLineas.haber,
          detalle: asientosLineas.detalle,
          tercero: terceros.razonSocial,
        })
        .from(asientosLineas)
        .innerJoin(cuentasContables, eq(cuentasContables.id, asientosLineas.cuentaId))
        .leftJoin(terceros, eq(terceros.id, asientosLineas.terceroId))
        .where(
          inArray(
            asientosLineas.asientoId,
            lista.map((a) => a.id),
          ),
        )
        .orderBy(asc(asientosLineas.orden))
    : []
  const porAsiento = Map.groupBy(lineas, (l) => l.asientoId)
  return lista.map((a, i) => ({
    ...a,
    /** Número de orden en el libro (correlativo por fecha), además del número interno. */
    orden: i + 1,
    lineas: (porAsiento.get(a.id) ?? []).map((l) => ({ ...l, debe: Number(l.debe), haber: Number(l.haber) })),
  }))
}

// ---------------------------------------------------------------- Mayor

export async function mayor(tx: Transaccion, cuentaId: string, desde: string, hasta: string) {
  const [anterior] = filasDe<{ s: string }>(
    await tx.execute(sql`
      select coalesce(sum(l.debe - l.haber), 0)::text as s
      from asientos_lineas l join asientos a on a.id = l.asiento_id
      where l.cuenta_id = ${cuentaId} and a.estado = 'registrado' and a.fecha < ${desde}`),
  )
  const movs = await tx
    .select({
      asientoId: asientos.id,
      numero: asientos.numero,
      fecha: asientos.fecha,
      concepto: asientos.concepto,
      origen: asientos.origen,
      debe: asientosLineas.debe,
      haber: asientosLineas.haber,
      detalle: asientosLineas.detalle,
      tercero: terceros.razonSocial,
    })
    .from(asientosLineas)
    .innerJoin(asientos, eq(asientos.id, asientosLineas.asientoId))
    .leftJoin(terceros, eq(terceros.id, asientosLineas.terceroId))
    .where(
      and(
        eq(asientosLineas.cuentaId, cuentaId),
        eq(asientos.estado, 'registrado'),
        gte(asientos.fecha, desde),
        lte(asientos.fecha, hasta),
      ),
    )
    .orderBy(asc(asientos.fecha), asc(asientos.numero), asc(asientosLineas.orden))
  let saldo = Math.round(Number(anterior?.s ?? 0) * 100)
  const saldoAnterior = saldo / 100
  const filas = movs.map((m) => {
    saldo += Math.round(Number(m.debe) * 100) - Math.round(Number(m.haber) * 100)
    return { ...m, debe: Number(m.debe), haber: Number(m.haber), saldo: saldo / 100 }
  })
  return {
    saldoAnterior,
    movimientos: filas,
    debe: r2(filas.reduce((s, f) => s + f.debe, 0)),
    haber: r2(filas.reduce((s, f) => s + f.haber, 0)),
    saldo: saldo / 100,
  }
}

// ---------------------------------------------------------------- Sumas y saldos

export type FilaBalance = {
  id: string
  codigo: string
  nombre: string
  tipo: TipoCuenta
  nivel: number
  imputable: boolean
  /** Saldo al comienzo del período. */
  anterior: number
  debe: number
  haber: number
  /** Saldo deudor positivo, acreedor negativo. */
  saldo: number
}

/**
 * Balance de sumas y saldos con los rubros acumulando a sus subcuentas. Las
 * cuentas sin movimiento ni saldo se omiten (salvo que se pidan todas).
 */
export async function sumasYSaldos(tx: Transaccion, desde: string, hasta: string, todas = false): Promise<FilaBalance[]> {
  const [plan, movs] = await Promise.all([
    planDeCuentas(tx),
    tx.execute(sql`
      select l.cuenta_id as "cuentaId",
        coalesce(sum(l.debe - l.haber) filter (where a.fecha < ${desde}), 0)::text as anterior,
        coalesce(sum(l.debe) filter (where a.fecha >= ${desde}), 0)::text as debe,
        coalesce(sum(l.haber) filter (where a.fecha >= ${desde}), 0)::text as haber
      from asientos_lineas l join asientos a on a.id = l.asiento_id
      where a.estado = 'registrado' and a.fecha <= ${hasta}
      group by l.cuenta_id`),
  ])
  const porCuenta = new Map(
    filasDe<{ cuentaId: string; anterior: string; debe: string; haber: string }>(movs).map((m) => [
      m.cuentaId,
      {
        anterior: Math.round(Number(m.anterior) * 100),
        debe: Math.round(Number(m.debe) * 100),
        haber: Math.round(Number(m.haber) * 100),
      },
    ]),
  )
  const filas = plan.map((c) => {
    // Un rubro suma lo de todas las cuentas que empiezan con su código.
    const propias = plan.filter((x) => x.codigo === c.codigo || x.codigo.startsWith(`${c.codigo}.`))
    const t = propias.reduce(
      (s, x) => {
        const m = porCuenta.get(x.id)
        return m ? { anterior: s.anterior + m.anterior, debe: s.debe + m.debe, haber: s.haber + m.haber } : s
      },
      { anterior: 0, debe: 0, haber: 0 },
    )
    return {
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo as TipoCuenta,
      nivel: c.nivel,
      imputable: c.imputable,
      anterior: t.anterior / 100,
      debe: t.debe / 100,
      haber: t.haber / 100,
      saldo: (t.anterior + t.debe - t.haber) / 100,
    }
  })
  return todas ? filas : filas.filter((f) => f.anterior || f.debe || f.haber)
}

// ---------------------------------------------------------------- Estados contables

/** Ejercicio que contiene una fecha (para el inicio del estado de resultados). */
async function inicioDelEjercicio(tx: Transaccion, fecha: string) {
  const [e] = await tx
    .select()
    .from(ejercicios)
    .where(and(lte(ejercicios.inicio, fecha), gte(ejercicios.fin, fecha)))
  return e?.inicio ?? null
}

type Renglon = { codigo: string; nombre: string; nivel: number; importe: number; imputable: boolean }

const renglones = (filas: FilaBalance[], tipo: TipoCuenta, signo: 1 | -1): Renglon[] =>
  filas
    .filter((f) => f.tipo === tipo && f.nivel > 1)
    .map((f) => ({ codigo: f.codigo, nombre: f.nombre, nivel: f.nivel, importe: r2(f.saldo * signo), imputable: f.imputable }))

/**
 * Estado de resultados de un período (por defecto desde el inicio del
 * ejercicio). Sin contar la refundición del cierre, que deja las cuentas en cero.
 */
export async function estadoResultados(tx: Transaccion, desde: string | null, hasta: string) {
  const inicio = desde ?? (await inicioDelEjercicio(tx, hasta)) ?? hasta
  const filas = await saldosDelPeriodo(tx, inicio, hasta, true)
  const ingresos = renglones(filas, 'ingreso', -1)
  const egresos = renglones(filas, 'egreso', 1)
  const total = (t: TipoCuenta, s: 1 | -1) => r2((filas.find((f) => f.tipo === t && f.nivel === 1)?.saldo ?? 0) * s)
  const totalIngresos = total('ingreso', -1)
  const totalEgresos = total('egreso', 1)
  return { desde: inicio, hasta, ingresos, egresos, totalIngresos, totalEgresos, resultado: r2(totalIngresos - totalEgresos) }
}

/** Movimientos del período sin la refundición (para resultados). */
async function saldosDelPeriodo(tx: Transaccion, desde: string, hasta: string, sinRefundicion: boolean): Promise<FilaBalance[]> {
  const plan = await planDeCuentas(tx)
  const movs = filasDe<{ cuentaId: string; s: string }>(
    await tx.execute(sql`
      select l.cuenta_id as "cuentaId", sum(l.debe - l.haber)::text as s
      from asientos_lineas l join asientos a on a.id = l.asiento_id
      where a.estado = 'registrado' and a.fecha >= ${desde} and a.fecha <= ${hasta}
        ${sinRefundicion ? sql`and a.origen <> 'refundicion'` : sql``}
      group by l.cuenta_id`),
  )
  const por = new Map(movs.map((m) => [m.cuentaId, Math.round(Number(m.s) * 100)]))
  return plan.map((c) => {
    const s = plan
      .filter((x) => x.codigo === c.codigo || x.codigo.startsWith(`${c.codigo}.`))
      .reduce((t, x) => t + (por.get(x.id) ?? 0), 0)
    return {
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo as TipoCuenta,
      nivel: c.nivel,
      imputable: c.imputable,
      anterior: 0,
      debe: 0,
      haber: 0,
      saldo: s / 100,
    }
  })
}

/**
 * Situación patrimonial a una fecha. Mientras el ejercicio no se cierra, el
 * resultado del ejercicio en curso se muestra dentro del patrimonio neto.
 */
export async function situacionPatrimonial(tx: Transaccion, hasta: string) {
  const filas = await sumasYSaldos(tx, hasta, hasta, true)
  const activo = renglones(filas, 'activo', 1)
  const pasivo = renglones(filas, 'pasivo', -1)
  const patrimonio = renglones(filas, 'patrimonio', -1)
  const total = (t: TipoCuenta, s: 1 | -1) => r2((filas.find((f) => f.tipo === t && f.nivel === 1)?.saldo ?? 0) * s)
  // Ingresos y egresos todavía no refundidos.
  const resultadoNoCerrado = r2(total('ingreso', -1) - total('egreso', 1))
  const totalActivo = total('activo', 1)
  const totalPasivo = total('pasivo', -1)
  const totalPatrimonio = r2(total('patrimonio', -1) + resultadoNoCerrado)
  return {
    hasta,
    activo,
    pasivo,
    patrimonio,
    resultadoNoCerrado,
    totalActivo,
    totalPasivo,
    totalPatrimonio,
    /** Debe dar cero: activo = pasivo + patrimonio neto. */
    diferencia: r2(totalActivo - totalPasivo - totalPatrimonio),
  }
}

// ---------------------------------------------------------------- Planillas

const fecha = (iso: string) => iso.split('-').reverse().join('/')

export async function hojasLibros(tx: Transaccion, desde: string, hasta: string): Promise<Hoja[]> {
  const [diario, balance, resultados, situacion] = await Promise.all([
    libroDiario(tx, desde, hasta),
    sumasYSaldos(tx, desde, hasta),
    estadoResultados(tx, desde, hasta),
    situacionPatrimonial(tx, hasta),
  ])
  const sangria = (nivel: number, t: string) => `${'   '.repeat(Math.max(0, nivel - 1))}${t}`
  return [
    {
      nombre: 'Libro diario',
      filas: [
        ['Orden', 'Fecha', 'Asiento', 'Cuenta', 'Nombre', 'Detalle', 'Debe', 'Haber'],
        ...diario.flatMap((a) => [
          [a.orden, fecha(a.fecha), a.numero, null, a.concepto, a.automatico ? 'Automático' : 'Manual', null, null],
          ...a.lineas.map((l) => [
            null,
            null,
            null,
            l.codigo,
            l.cuenta,
            l.detalle ?? l.tercero ?? '',
            l.debe || null,
            l.haber || null,
          ]),
        ]),
      ],
    },
    {
      nombre: 'Sumas y saldos',
      filas: [
        ['Código', 'Cuenta', 'Saldo anterior', 'Debe', 'Haber', 'Saldo deudor', 'Saldo acreedor'],
        ...balance.map((f) => [
          f.codigo,
          sangria(f.nivel, f.nombre),
          f.anterior,
          f.debe,
          f.haber,
          f.saldo > 0 ? f.saldo : null,
          f.saldo < 0 ? -f.saldo : null,
        ]),
      ],
    },
    {
      nombre: 'Estado de resultados',
      filas: [
        [`Del ${fecha(resultados.desde)} al ${fecha(resultados.hasta)}`, null],
        ['INGRESOS', resultados.totalIngresos],
        ...resultados.ingresos.filter((r) => r.importe).map((r) => [sangria(r.nivel, r.nombre), r.importe]),
        ['EGRESOS', resultados.totalEgresos],
        ...resultados.egresos.filter((r) => r.importe).map((r) => [sangria(r.nivel, r.nombre), r.importe]),
        [resultados.resultado >= 0 ? 'GANANCIA' : 'PÉRDIDA', resultados.resultado],
      ],
    },
    {
      nombre: 'Situación patrimonial',
      filas: [
        [`Al ${fecha(hasta)}`, null],
        ['ACTIVO', situacion.totalActivo],
        ...situacion.activo.filter((r) => r.importe).map((r) => [sangria(r.nivel, r.nombre), r.importe]),
        ['PASIVO', situacion.totalPasivo],
        ...situacion.pasivo.filter((r) => r.importe).map((r) => [sangria(r.nivel, r.nombre), r.importe]),
        ['PATRIMONIO NETO', situacion.totalPatrimonio],
        ...situacion.patrimonio.filter((r) => r.importe).map((r) => [sangria(r.nivel, r.nombre), r.importe]),
        ...(situacion.resultadoNoCerrado ? [['   Resultado del ejercicio en curso', situacion.resultadoNoCerrado]] : []),
        ['PASIVO + PATRIMONIO NETO', r2(situacion.totalPasivo + situacion.totalPatrimonio)],
      ],
    },
  ]
}
