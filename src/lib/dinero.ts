import Decimal from 'decimal.js'

/**
 * Dinero con decimales exactos. En la base es numeric y llega como string;
 * acá se opera con Decimal y nunca con number (0.1 + 0.2 !== 0.3).
 * Redondeo comercial: la mitad hacia arriba, como ARCA.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
export type Monto = InstanceType<typeof D>

export function monto(valor: Decimal.Value | null | undefined): Monto {
  return new D(valor ?? 0)
}

/** Redondea a centavos y devuelve el string para guardar en numeric(18,2). */
export function aImporte(valor: Decimal.Value): string {
  return new D(valor).toDecimalPlaces(2).toFixed(2)
}

export function sumar(valores: Decimal.Value[]): Monto {
  return valores.reduce<Monto>((acc, v) => acc.plus(v), new D(0))
}

/** Aplica un porcentaje: aplicarPorcentaje(100, 21) = 121. */
export function aplicarPorcentaje(base: Decimal.Value, porcentaje: Decimal.Value): Monto {
  return new D(base).times(new D(100).plus(porcentaje)).dividedBy(100)
}

const formatos = new Map<string, Intl.NumberFormat>()

/** 1234.5 → "$ 1.234,50" (es-AR). */
export function formatearMonto(valor: Decimal.Value, simbolo = '$'): string {
  let formato = formatos.get('2')
  if (!formato) {
    formato = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    formatos.set('2', formato)
  }
  const n = new D(valor).toDecimalPlaces(2)
  const texto = formato.format(Math.abs(n.toNumber()))
  return `${n.isNegative() ? '−' : ''}${simbolo} ${texto}`
}
