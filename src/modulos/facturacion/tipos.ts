/**
 * Tipos de comprobante de ARCA y qué letra corresponde a cada operación.
 * Sin base de datos: lo usan la emisión, las pantallas y las pruebas.
 */

export type Clase = 'factura' | 'nota_debito' | 'nota_credito'

/**
 * Nota de débito interna (sin valor fiscal): por ejemplo, el cheque rechazado
 * que vuelve a la cuenta del cliente o del proveedor. No pasa por ARCA.
 */
export const TIPO_DEBITO_INTERNO = 99
export type Letra = 'A' | 'B' | 'C'

type Variante = 'comun' | 'fce' | 'retencion'

/**
 * Código de comprobante de ARCA por letra y clase (y FCE MiPyME). Desde la
 * RG 5762/2025 los códigos 51 a 53 (las viejas "M") son A con la leyenda
 * "OPERACIÓN SUJETA A RETENCIÓN".
 */
const CODIGOS: Record<Variante, Partial<Record<Letra, Record<Clase, number>>>> = {
  comun: {
    A: { factura: 1, nota_debito: 2, nota_credito: 3 },
    B: { factura: 6, nota_debito: 7, nota_credito: 8 },
    C: { factura: 11, nota_debito: 12, nota_credito: 13 },
  },
  fce: {
    A: { factura: 201, nota_debito: 202, nota_credito: 203 },
    B: { factura: 206, nota_debito: 207, nota_credito: 208 },
    C: { factura: 211, nota_debito: 212, nota_credito: 213 },
  },
  retencion: {
    A: { factura: 51, nota_debito: 52, nota_credito: 53 },
  },
}

/** Leyendas de la RG 5762/2025 en los comprobantes A. */
export const LEYENDA_SUJETA_RETENCION = 'OPERACIÓN SUJETA A RETENCIÓN'
export const LEYENDA_CBU_INFORMADA = 'PAGO EN CBU INFORMADA'

/** Régimen de emisión de comprobantes A de la empresa (lo informa ARCA). */
export const REGIMENES_CLASE_A = {
  comun: 'Factura A común',
  sujeta_retencion: `A con leyenda "${LEYENDA_SUJETA_RETENCION}" (códigos 51 a 53)`,
  cbu_informada: `A con leyenda "${LEYENDA_CBU_INFORMADA}"`,
} as const
export type RegimenClaseA = keyof typeof REGIMENES_CLASE_A

const NOMBRE_CLASE: Record<Clase, string> = { factura: 'Factura', nota_debito: 'Nota de débito', nota_credito: 'Nota de crédito' }

export function codigoComprobante(letra: Letra, clase: Clase, fce = false, sujetaRetencion = false): number {
  if (sujetaRetencion && letra === 'A' && !fce) return CODIGOS.retencion.A![clase]
  return CODIGOS[fce ? 'fce' : 'comun'][letra]![clase]
}

/** Datos de un código de ARCA: letra, clase, si es FCE y si es A sujeta a retención (51 a 53). */
export function datosTipo(tipo: number): { letra: Letra; clase: Clase; fce: boolean; sujetaRetencion: boolean } {
  for (const variante of ['comun', 'fce', 'retencion'] as const) {
    for (const letra of ['A', 'B', 'C'] as const) {
      for (const clase of ['factura', 'nota_debito', 'nota_credito'] as const) {
        if (CODIGOS[variante][letra]?.[clase] === tipo)
          return { letra, clase, fce: variante === 'fce', sujetaRetencion: variante === 'retencion' }
      }
    }
  }
  throw new Error(`Tipo de comprobante desconocido: ${tipo}`)
}

export function nombreComprobante(tipo: number): string {
  // 0: saldo migrado de PYMEXIS que no es un comprobante fiscal (recibo, a cuenta…).
  if (tipo === 0) return 'Saldo inicial'
  if (tipo === TIPO_DEBITO_INTERNO) return 'Nota de débito interna'
  const { letra, clase, fce } = datosTipo(tipo)
  if (!fce) return `${NOMBRE_CLASE[clase]} ${letra}`
  return clase === 'factura'
    ? `Factura de crédito electrónica MiPyME ${letra}`
    : `${NOMBRE_CLASE[clase]} electrónica MiPyME ${letra}`
}

/** Abreviatura para listados: FA, NCA, NDB, FCEA… */
export function abreviatura(tipo: number): string {
  if (tipo === 0) return 'SI'
  if (tipo === TIPO_DEBITO_INTERNO) return 'NDI'
  const { letra, clase, fce } = datosTipo(tipo)
  const base = clase === 'factura' ? 'F' : clase === 'nota_credito' ? 'NC' : 'ND'
  return `${fce ? (clase === 'factura' ? 'FCE' : `${base}E`) : base}${letra}`
}

/**
 * Condiciones frente al IVA de un emisor. Un Responsable Inscripto emite A o
 * B según el receptor (la letra que corresponde está en el catálogo
 * condiciones_iva.letra_desde_inscripto); Exento y Monotributo emiten C.
 */
export function letraPara(condicionEmisor: number, letraDesdeInscripto: string | null | undefined): Letra {
  if (condicionEmisor !== 1) return 'C'
  return letraDesdeInscripto === 'A' ? 'A' : 'B'
}

/** Tipo y número de documento a informar. Sin documento válido: consumidor final (99, 0). */
export function documentoReceptor(tipoDocumento: number | null, numero: string | null): { docTipo: number; docNumero: string } {
  const digitos = (numero ?? '').replace(/\D/g, '')
  if (!tipoDocumento || tipoDocumento === 99 || !digitos) return { docTipo: 99, docNumero: '0' }
  return { docTipo: tipoDocumento, docNumero: digitos }
}

/** Días de tolerancia de ARCA para la fecha del comprobante. */
export function rangoFecha(concepto: number): number {
  return concepto === 1 ? 5 : 10
}

/**
 * URL del código QR que exige ARCA (RG 4291): un JSON en base64 con los datos
 * del comprobante.
 */
export function urlQr(c: {
  fecha: string
  cuit: string
  puntoVenta: number
  tipo: number
  numero: number
  total: string
  moneda: string
  cotizacion: string
  docTipo: number | null
  docNumero: string | null
  cae: string
}): string {
  const datos: Record<string, string | number> = {
    ver: 1,
    fecha: c.fecha,
    cuit: Number(c.cuit),
    ptoVta: c.puntoVenta,
    tipoCmp: c.tipo,
    nroCmp: c.numero,
    importe: Number(c.total),
    moneda: c.moneda,
    ctz: Number(c.cotizacion),
    tipoCodAut: 'E',
    codAut: Number(c.cae),
  }
  if (c.docTipo && c.docTipo !== 99) {
    datos.tipoDocRec = c.docTipo
    datos.nroDocRec = Number(c.docNumero)
  }
  return `https://www.arca.gob.ar/fe/qr/?p=${btoa(JSON.stringify(datos))}`
}
