import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { compras, comprasTributos, recibos, recibosValores } from '../../db/schema'
import { libroCompras, libroVentas, limitesPeriodo } from './libroIva'

/**
 * Posición de IVA del mes (lo que se arma en la declaración F.2002): débito
 * fiscal de las ventas contra crédito fiscal de las compras, y aparte las
 * percepciones y retenciones de IVA sufridas, que se computan como pagos a
 * cuenta. No incluye el saldo a favor de meses anteriores (lo pone el
 * contador al presentar).
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
  const debito = ventas.resumen.iva
  const credito = comprasLibro.resumen.iva
  const tecnico = r(debito - credito)
  const pagosACuenta = r(Number(percepciones.total) + Number(retenciones.total))
  return {
    debito,
    credito,
    /** Positivo: IVA a pagar antes de los pagos a cuenta. Negativo: saldo técnico a favor (se arrastra). */
    saldoTecnico: tecnico,
    percepciones: r(Number(percepciones.total)),
    retenciones: r(Number(retenciones.total)),
    /** Lo que queda a pagar (o, si es negativo, saldo de libre disponibilidad). */
    aPagar: tecnico > 0 ? r(tecnico - pagosACuenta) : r(-pagosACuenta),
    ventas,
    compras: comprasLibro,
  }
}
