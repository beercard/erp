import { aImporte, D, monto, type Monto } from '../../lib/dinero'

/**
 * Retención del Impuesto a las Ganancias (RG 830). Cálculo puro: los datos
 * del mes los junta src/modulos/compras/pagos.ts.
 *
 * Por cada proveedor y régimen, en el mes calendario:
 *   base acumulada = lo pagado en el mes (neto de IVA), con este pago;
 *   sujeto = base acumulada − mínimo no sujeto (solo inscriptos);
 *   retención del mes = sujeto × alícuota (o la escala, para inscriptos en
 *   regímenes que la usan);
 *   retención de este pago = retención del mes − lo ya retenido en el mes.
 * Si da menos que el mínimo de retención, no se retiene.
 */

export type RegimenGanancias = {
  codigo: string
  concepto: string
  alicuotaInscripto: string
  alicuotaNoInscripto: string
  minimoNoSujeto: string
  minimoRetencion: string
  usaEscala: boolean
}

export type TramoEscala = { desde: string; hasta: string | null; fijo: string; porcentaje: string }

export type ResultadoRetencion = {
  /** Base sujeta a retención (acumulado del mes menos el mínimo). */
  base: string
  /** Porcentaje aplicado; nulo si salió de la escala. */
  alicuota: string | null
  importe: string
  explicacion: string
}

export function aplicarEscala(sujeto: Monto, escala: TramoEscala[]): Monto {
  const tramo = [...escala]
    .sort((a, b) => Number(a.desde) - Number(b.desde))
    .find((t) => sujeto.gt(t.desde) && (t.hasta === null || sujeto.lte(t.hasta)))
  if (!tramo) return new D(0)
  return monto(tramo.fijo).plus(sujeto.minus(tramo.desde).times(tramo.porcentaje).dividedBy(100))
}

export function calcularRetencionGanancias(p: {
  regimen: RegimenGanancias
  escala: TramoEscala[]
  inscripto: boolean
  /** Base de los pagos anteriores del mes al mismo proveedor por el mismo régimen. */
  baseAnteriorMes: string
  basePago: string
  /** Retenciones ya practicadas en el mes por el mismo régimen. */
  retenidoMes: string
}): ResultadoRetencion {
  const acumulado = monto(p.baseAnteriorMes).plus(p.basePago)
  const minimo = p.inscripto ? monto(p.regimen.minimoNoSujeto) : new D(0)
  const sujeto = D.max(0, acumulado.minus(minimo))
  const conEscala = p.inscripto && p.regimen.usaEscala
  const alicuota = p.inscripto ? p.regimen.alicuotaInscripto : p.regimen.alicuotaNoInscripto
  const delMes = conEscala ? aplicarEscala(sujeto, p.escala) : sujeto.times(alicuota).dividedBy(100)
  const importe = D.max(0, delMes.minus(p.retenidoMes))
  const cero = importe.lt(p.regimen.minimoRetencion) || importe.lte(0)
  const pesos = (v: Monto | string) => `$ ${aImporte(v)}`
  const explicacion = [
    `Pagado en el mes ${pesos(acumulado)}`,
    minimo.gt(0) ? `menos mínimo no sujeto ${pesos(minimo)}` : null,
    `= sujeto ${pesos(sujeto)}`,
    conEscala ? 'por escala' : `al ${monto(alicuota).toString()} %`,
    `= ${pesos(delMes)}`,
    monto(p.retenidoMes).gt(0) ? `menos ya retenido ${pesos(p.retenidoMes)}` : null,
    cero && importe.gt(0) ? `: menos que el mínimo de retención (${pesos(p.regimen.minimoRetencion)}), no se retiene` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return {
    base: aImporte(sujeto),
    alicuota: conEscala ? null : monto(alicuota).toFixed(4),
    importe: cero ? '0.00' : aImporte(importe),
    explicacion,
  }
}
