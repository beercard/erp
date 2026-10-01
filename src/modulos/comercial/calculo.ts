import { aImporte, aImporteArca, D, monto, type Monto } from '../../lib/dinero'

/**
 * Cálculo de documentos comerciales, sin base de datos: lo usan presupuestos,
 * pedidos y (en la etapa 2) los comprobantes fiscales, y lo prueban las
 * pruebas unitarias.
 *
 * Reglas:
 * - Neto del renglón = cantidad × precio × (1 − descuento %), a centavos.
 * - El IVA se calcula POR ALÍCUOTA sobre la suma de netos de esa alícuota y
 *   se redondea una sola vez, al par (Round Half Even), como lo pide ARCA. El IVA de cada renglón es
 *   informativo.
 */

/** Código de alícuota de ARCA → porcentaje. */
export const TASAS_IVA: Record<number, string> = { 3: '0', 4: '10.5', 5: '21', 6: '27', 8: '5', 9: '2.5' }

export type LineaEntrada = {
  cantidad: string
  precioUnitario: string
  descuento?: string | null
  alicuotaIva: number
}

export type LineaCalculada = LineaEntrada & { neto: string; iva: string }

export type Totales = {
  neto: string
  iva: string
  total: string
  /** Base e IVA por alícuota, para el pie del documento y para ARCA. */
  porAlicuota: { alicuotaIva: number; base: string; iva: string }[]
}

export function calcularLinea(l: LineaEntrada): LineaCalculada {
  const tasa = TASAS_IVA[l.alicuotaIva]
  if (tasa === undefined) throw new Error(`Alícuota de IVA desconocida: ${l.alicuotaIva}`)
  const neto = monto(l.cantidad)
    .times(l.precioUnitario)
    .times(new D(100).minus(l.descuento || 0))
    .dividedBy(100)
  // El IVA del renglón sale del neto ya redondeado: es el que se muestra.
  const netoRedondeado = aImporte(neto)
  return { ...l, neto: netoRedondeado, iva: aImporte(monto(netoRedondeado).times(tasa).dividedBy(100)) }
}

export function calcularTotales(lineas: LineaEntrada[]): { lineas: LineaCalculada[]; totales: Totales } {
  const calculadas = lineas.map(calcularLinea)
  const bases = new Map<number, Monto>()
  for (const l of calculadas) bases.set(l.alicuotaIva, (bases.get(l.alicuotaIva) ?? new D(0)).plus(l.neto))
  const porAlicuota = [...bases]
    .sort(([a], [b]) => a - b)
    .map(([alicuotaIva, base]) => ({
      alicuotaIva,
      base: aImporte(base),
      iva: aImporteArca(base.times(TASAS_IVA[alicuotaIva]).dividedBy(100)),
    }))
  const neto = porAlicuota.reduce<Monto>((acc, a) => acc.plus(a.base), new D(0))
  const iva = porAlicuota.reduce<Monto>((acc, a) => acc.plus(a.iva), new D(0))
  return {
    lineas: calculadas,
    totales: { neto: aImporte(neto), iva: aImporte(iva), total: aImporte(neto.plus(iva)), porAlicuota },
  }
}

/**
 * Pasa un precio de una moneda a otra con la cotización del documento
 * (pesos por unidad de moneda extranjera). Solo se convierte entre pesos y
 * una moneda extranjera; dos extranjeras distintas no se mezclan en un
 * documento.
 */
export function convertir(precio: string, de: string, a: string, cotizacion: string): string {
  if (de === a) return precio
  const c = monto(cotizacion)
  if (c.lte(0)) throw new Error('La cotización tiene que ser mayor que cero.')
  if (a === 'PES') return monto(precio).times(c).toDecimalPlaces(4).toFixed(4)
  if (de === 'PES') return monto(precio).dividedBy(c).toDecimalPlaces(4).toFixed(4)
  throw new Error(`No se convierte directamente de ${de} a ${a}.`)
}
