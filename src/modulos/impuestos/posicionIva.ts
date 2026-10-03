import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { compras, comprasTributos, presentaciones, recibos, recibosValores, saldosIva } from '../../db/schema'
import { libroCompras, libroVentas, limitesPeriodo } from './libroIva'

/** El mes anterior a "AAAA-MM". */
export function periodoAnterior(periodo: string) {
  const [a, m] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export type SaldosIva = { tecnico: number; libre: number; origen: 'presentacion' | 'manual' | 'ninguno' }

/**
 * Saldos a favor con los que arranca el período: los que dejó la
 * presentación del mes anterior; si no hay, los cargados a mano; si no, cero.
 */
export async function saldosAnteriores(tx: Transaccion, periodo: string): Promise<SaldosIva> {
  const [p] = await tx
    .select({ resumen: presentaciones.resumen })
    .from(presentaciones)
    .where(
      and(
        eq(presentaciones.impuesto, 'iva_digital'),
        eq(presentaciones.periodo, periodoAnterior(periodo)),
        eq(presentaciones.estado, 'presentada'),
      ),
    )
  const pos = (p?.resumen as { posicion?: { saldoTecnicoAFavor: number; libreDisponibilidad: number } } | undefined)?.posicion
  if (pos) return { tecnico: pos.saldoTecnicoAFavor, libre: pos.libreDisponibilidad, origen: 'presentacion' }
  const [m] = await tx.select().from(saldosIva).where(eq(saldosIva.periodo, periodo))
  if (m) return { tecnico: Number(m.tecnico), libre: Number(m.libre), origen: 'manual' }
  return { tecnico: 0, libre: 0, origen: 'ninguno' }
}

/** Carga a mano los saldos con los que arranca un período (si el anterior no se presentó desde acá). */
export async function guardarSaldosIniciales(
  tx: Transaccion,
  usuarioId: string,
  periodo: string,
  tecnico: number,
  libre: number,
) {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(periodo)) return { ok: false as const, error: 'Período inválido.' }
  if (!(tecnico >= 0) || !(libre >= 0)) return { ok: false as const, error: 'Los saldos a favor son importes positivos.' }
  const valores = { tecnico: tecnico.toFixed(2), libre: libre.toFixed(2), usuarioId }
  await tx
    .insert(saldosIva)
    .values({ periodo, ...valores })
    .onConflictDoUpdate({ target: [saldosIva.empresaId, saldosIva.periodo], set: valores })
  return { ok: true as const }
}

/**
 * Posición de IVA del mes (lo que se arma en la declaración F.2002): débito
 * fiscal de las ventas contra crédito fiscal de las compras, y aparte las
 * percepciones y retenciones de IVA sufridas, que se computan como pagos a
 * cuenta. Arrastra los saldos a favor del mes anterior como en el F.2002:
 *
 *   saldo técnico = débito − crédito − saldo técnico anterior
 *     (si es negativo, queda a favor para el mes siguiente)
 *   pagos a cuenta = percepciones + retenciones + libre disponibilidad anterior
 *   a pagar = impuesto determinado − pagos a cuenta
 *     (si los pagos a cuenta sobran, quedan de libre disponibilidad)
 */
export async function posicionIva(tx: Transaccion, periodo: string) {
  const { desde, hasta } = limitesPeriodo(periodo)
  const [ventas, comprasLibro, [percepciones], [retenciones]] = await Promise.all([
    libroVentas(tx, periodo),
    libroCompras(tx, periodo),
    tx
      .select({
        total: sql<string>`coalesce(sum(${comprasTributos.importe} * ${compras.cotizacion} * case when ${compras.clase} = 'nota_credito' then -1 else 1 end), 0)`,
      })
      .from(comprasTributos)
      .innerJoin(compras, eq(compras.id, comprasTributos.compraId))
      .where(and(eq(comprasTributos.tipo, 'percepcion_iva'), eq(compras.estado, 'registrado'), eq(compras.periodoIva, periodo))),
    tx
      .select({ total: sql<string>`coalesce(sum(${recibosValores.importe}), 0)` })
      .from(recibosValores)
      .innerJoin(recibos, eq(recibos.id, recibosValores.reciboId))
      .where(
        and(
          inArray(recibosValores.medio, ['retencion_iva']),
          eq(recibos.estado, 'emitido'),
          gte(recibos.fecha, desde),
          lte(recibos.fecha, hasta),
        ),
      ),
  ])
  const r = (n: number) => Math.round(n * 100) / 100
  const anterior = await saldosAnteriores(tx, periodo)
  const debito = ventas.resumen.iva
  const credito = comprasLibro.resumen.iva
  const tecnico = r(debito - credito - anterior.tecnico)
  const determinado = Math.max(0, tecnico)
  const pagosACuenta = r(Number(percepciones.total) + Number(retenciones.total) + anterior.libre)
  return {
    debito,
    credito,
    anterior,
    /** Positivo: impuesto determinado. Negativo: saldo técnico a favor (se arrastra). */
    saldoTecnico: tecnico,
    saldoTecnicoAFavor: r(Math.max(0, -tecnico)),
    percepciones: r(Number(percepciones.total)),
    retenciones: r(Number(retenciones.total)),
    pagosACuenta,
    aPagar: r(Math.max(0, determinado - pagosACuenta)),
    libreDisponibilidad: r(Math.max(0, pagosACuenta - determinado)),
    ventas,
    compras: comprasLibro,
  }
}
