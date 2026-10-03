import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { compras, terceros } from '../../db/schema'
import { conciliar, type FilaArca } from '../compras/misComprobantes'
import { discriminaIva, datosTipoCompra } from '../compras/tipos'
import { limitesPeriodo } from './libroIva'

/**
 * Cruce del libro de IVA compras con "Mis Comprobantes Recibidos" de ARCA,
 * antes de presentar. El Portal IVA viene precargado con lo de ARCA: lo que
 * no coincide salta recién ahí. Acá se ve antes:
 *
 * - Faltan: ARCA los tiene y no están cargados (crédito fiscal sin computar).
 * - Solo en el sistema: cargados en el período y ARCA no los tiene, dentro
 *   de las fechas del archivo (comprobante mal cargado o apócrifo).
 * - Diferencias: el total o el IVA no coinciden con lo que informó el emisor.
 * - En otro período: están cargados, pero se computan en otro mes.
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const signo = (tipo: number) => (datosTipoCompra(tipo)?.clase === 'nota_credito' ? -1 : 1)

export type ResultadoCruce = Awaited<ReturnType<typeof cruceCompras>>

export async function cruceCompras(tx: Transaccion, periodo: string, filas: FilaArca[]) {
  const { desde, hasta } = limitesPeriodo(periodo)
  const delMes = filas.filter((f) => f.fecha >= desde && f.fecha <= hasta)
  const c = await conciliar(tx, delMes)
  const ids = c.filas.map((f) => f.compraId).filter((x): x is string => !!x)
  const cargadas = ids.length
    ? await tx
        .select({ id: compras.id, periodoIva: compras.periodoIva, total: compras.total, iva: compras.iva })
        .from(compras)
        .where(inArray(compras.id, ids))
    : []
  const porId = new Map(cargadas.map((x) => [x.id, x]))

  const faltan: (FilaArca & { creditoFiscal: number })[] = []
  const diferencias: {
    fila: FilaArca
    compraId: string
    totalArca: number
    totalSistema: number
    ivaArca: number
    ivaSistema: number
  }[] = []
  const otroPeriodo: { fila: FilaArca; compraId: string; periodoIva: string }[] = []
  let coinciden = 0
  for (const f of c.filas) {
    const letra = datosTipoCompra(f.tipo)?.letra ?? ''
    const ivaArca = discriminaIva(letra) ? Number(f.iva) : 0
    if (!f.compraId) {
      faltan.push({ ...f, creditoFiscal: r2(ivaArca * Number(f.cotizacion || 1) * signo(f.tipo)) })
      continue
    }
    const x = porId.get(f.compraId)!
    if (Math.abs(Number(x.total) - Number(f.total)) > 1 || Math.abs(Number(x.iva) - ivaArca) > 1)
      diferencias.push({
        fila: f,
        compraId: f.compraId,
        totalArca: Number(f.total),
        totalSistema: Number(x.total),
        ivaArca,
        ivaSistema: Number(x.iva),
      })
    else if (x.periodoIva !== periodo) otroPeriodo.push({ fila: f, compraId: f.compraId, periodoIva: x.periodoIva })
    else coinciden++
  }

  // Lo cargado en este período que ARCA no informa (solo dentro de las fechas que cubre el archivo).
  const fechas = delMes.map((f) => f.fecha).sort()
  const enArchivo = new Set(c.filas.map((f) => f.compraId).filter(Boolean))
  const soloEnSistema = fechas.length
    ? (
        await tx
          .select({
            id: compras.id,
            tipo: compras.tipo,
            letra: compras.letra,
            puntoVenta: compras.puntoVenta,
            numero: compras.numero,
            fecha: compras.fecha,
            total: compras.total,
            iva: compras.iva,
            origen: compras.origen,
            proveedor: terceros.razonSocial,
          })
          .from(compras)
          .innerJoin(terceros, eq(terceros.id, compras.terceroId))
          .where(
            and(
              eq(compras.estado, 'registrado'),
              ne(compras.letra, 'X'),
              eq(compras.periodoIva, periodo),
              gte(compras.fecha, desde),
              lte(compras.fecha, hasta),
            ),
          )
      ).filter((x) => !enArchivo.has(x.id))
    : []

  return {
    leidos: filas.length,
    delMes: delMes.length,
    fueraDelMes: filas.length - delMes.length,
    coinciden,
    faltan,
    creditoSinComputar: r2(faltan.reduce((s, f) => s + f.creditoFiscal, 0)),
    diferencias,
    otroPeriodo,
    soloEnSistema,
  }
}
