import type { Clase } from '../facturacion/tipos'

/**
 * Comprobantes que se reciben de proveedores, con su código de ARCA. Además
 * de los A, B y C que emite la empresa, se reciben M (emisores observados por
 * ARCA) y facturas de crédito electrónicas MiPyME.
 */
export type LetraCompra = 'A' | 'B' | 'C' | 'M'

const CODIGOS: Record<'comun' | 'fce', Partial<Record<LetraCompra, Record<Clase, number>>>> = {
  comun: {
    A: { factura: 1, nota_debito: 2, nota_credito: 3 },
    B: { factura: 6, nota_debito: 7, nota_credito: 8 },
    C: { factura: 11, nota_debito: 12, nota_credito: 13 },
    M: { factura: 51, nota_debito: 52, nota_credito: 53 },
  },
  fce: {
    A: { factura: 201, nota_debito: 202, nota_credito: 203 },
    B: { factura: 206, nota_debito: 207, nota_credito: 208 },
    C: { factura: 211, nota_debito: 212, nota_credito: 213 },
  },
}

export const LETRAS_COMPRA: LetraCompra[] = ['A', 'B', 'C', 'M']

export function codigoCompra(letra: LetraCompra, clase: Clase, fce = false): number | null {
  return CODIGOS[fce ? 'fce' : 'comun'][letra]?.[clase] ?? null
}

/** Letra, clase y si es FCE de un código de ARCA; nulo si no es un comprobante de compra conocido. */
export function datosTipoCompra(tipo: number): { letra: LetraCompra; clase: Clase; fce: boolean } | null {
  for (const variante of ['comun', 'fce'] as const) {
    for (const [letra, clases] of Object.entries(CODIGOS[variante])) {
      for (const [clase, codigo] of Object.entries(clases)) {
        if (codigo === tipo) return { letra: letra as LetraCompra, clase: clase as Clase, fce: variante === 'fce' }
      }
    }
  }
  return null
}

/** Abreviatura para listados: FA, NCA, NDM, FCEA… */
export function abreviaturaCompra(tipo: number): string {
  // 0: saldo migrado de PYMEXIS que no es un comprobante fiscal (pago, a cuenta…).
  if (tipo === 0) return 'SI'
  const d = datosTipoCompra(tipo)
  if (!d) return String(tipo)
  const base = d.clase === 'factura' ? 'F' : d.clase === 'nota_credito' ? 'NC' : 'ND'
  return `${d.fce ? (d.clase === 'factura' ? 'FCE' : `${base}E`) : base}${d.letra}`
}

/** Solo A y M discriminan IVA: en B y C el precio es final y no hay crédito fiscal. */
export const discriminaIva = (letra: string) => letra === 'A' || letra === 'M'

/** Letra que corresponde según la condición de IVA del proveedor (la empresa es inscripta). */
export function letraEsperada(condicionProveedor: number): LetraCompra {
  return condicionProveedor === 1 ? 'A' : 'C'
}
