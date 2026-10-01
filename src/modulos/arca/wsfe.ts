import { cuerpoSoap, ErrorArca, escapar, sobre, type Transporte } from './soap'

/**
 * WSFEv1: factura electrónica de ARCA (facturas, notas de débito y de
 * crédito A, B y C, y factura de crédito MiPyME).
 *
 * El orden de los elementos importa: es el del esquema de ARCA.
 */

export const URL_WSFE = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
} as const

const NS = 'http://ar.gov.afip.dif.FEV1/'

export type Credenciales = { token: string; firma: string; cuit: string }

export type SolicitudCae = {
  puntoVenta: number
  tipo: number
  numero: number
  /** 1 productos, 2 servicios, 3 ambos. */
  concepto: number
  docTipo: number
  docNumero: string
  /** AAAA-MM-DD */
  fecha: string
  total: string
  noGravado: string
  neto: string
  exento: string
  tributos: string
  iva: string
  servicioDesde?: string | null
  servicioHasta?: string | null
  vencimientoPago?: string | null
  moneda: string
  cotizacion: string
  condicionIvaReceptor: number
  asociados?: { tipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string }[]
  detalleTributos?: { id: number; descripcion: string; base: string; alicuota: string; importe: string }[]
  detalleIva?: { id: number; base: string; importe: string }[]
  opcionales?: { id: string; valor: string }[]
}

export type Mensaje = { codigo: string; mensaje: string }

export type RespuestaCae = {
  /** A aprobado, R rechazado, P parcial (no aplica a un solo comprobante). */
  resultado: 'A' | 'R' | 'P'
  cae: string | null
  caeVence: string | null
  observaciones: Mensaje[]
  errores: Mensaje[]
}

const aArca = (fecha: string) => fecha.replaceAll('-', '')
const deArca = (fecha: string) => `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`

function auth(c: Credenciales): string {
  return `<ar:Auth><ar:Token>${escapar(c.token)}</ar:Token><ar:Sign>${escapar(c.firma)}</ar:Sign><ar:Cuit>${escapar(c.cuit)}</ar:Cuit></ar:Auth>`
}

const el = (nombre: string, valor: string | number | null | undefined) =>
  valor === null || valor === undefined || valor === '' ? '' : `<ar:${nombre}>${escapar(valor)}</ar:${nombre}>`

export function pedidoCae(c: Credenciales, s: SolicitudCae): string {
  const asociados = s.asociados?.length
    ? `<ar:CbtesAsoc>${s.asociados
        .map(
          (a) =>
            `<ar:CbteAsoc>${el('Tipo', a.tipo)}${el('PtoVta', a.puntoVenta)}${el('Nro', a.numero)}${el('Cuit', a.cuit)}${el('CbteFch', aArca(a.fecha))}</ar:CbteAsoc>`,
        )
        .join('')}</ar:CbtesAsoc>`
    : ''
  const tributos = s.detalleTributos?.length
    ? `<ar:Tributos>${s.detalleTributos
        .map(
          (t) =>
            `<ar:Tributo>${el('Id', t.id)}${el('Desc', t.descripcion)}${el('BaseImp', t.base)}${el('Alic', t.alicuota)}${el('Importe', t.importe)}</ar:Tributo>`,
        )
        .join('')}</ar:Tributos>`
    : ''
  const iva = s.detalleIva?.length
    ? `<ar:Iva>${s.detalleIva.map((a) => `<ar:AlicIva>${el('Id', a.id)}${el('BaseImp', a.base)}${el('Importe', a.importe)}</ar:AlicIva>`).join('')}</ar:Iva>`
    : ''
  const opcionales = s.opcionales?.length
    ? `<ar:Opcionales>${s.opcionales.map((o) => `<ar:Opcional>${el('Id', o.id)}${el('Valor', o.valor)}</ar:Opcional>`).join('')}</ar:Opcionales>`
    : ''
  const servicios = s.concepto !== 1
  const detalle =
    el('Concepto', s.concepto) +
    el('DocTipo', s.docTipo) +
    el('DocNro', s.docNumero) +
    el('CbteDesde', s.numero) +
    el('CbteHasta', s.numero) +
    el('CbteFch', aArca(s.fecha)) +
    el('ImpTotal', s.total) +
    el('ImpTotConc', s.noGravado) +
    el('ImpNeto', s.neto) +
    el('ImpOpEx', s.exento) +
    el('ImpTrib', s.tributos) +
    el('ImpIVA', s.iva) +
    (servicios ? el('FchServDesde', s.servicioDesde && aArca(s.servicioDesde)) : '') +
    (servicios ? el('FchServHasta', s.servicioHasta && aArca(s.servicioHasta)) : '') +
    (s.vencimientoPago ? el('FchVtoPago', aArca(s.vencimientoPago)) : '') +
    el('MonId', s.moneda) +
    el('MonCotiz', s.cotizacion) +
    (s.moneda !== 'PES' ? el('CanMisMonExt', 'N') : '') +
    el('CondicionIVAReceptorId', s.condicionIvaReceptor) +
    asociados +
    tributos +
    iva +
    opcionales
  return sobre(
    `<ar:FECAESolicitar>${auth(c)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg>${el('PtoVta', s.puntoVenta)}${el('CbteTipo', s.tipo)}</ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>${detalle}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar>`,
    { ar: NS },
  )
}

type Nodo = Record<string, unknown>

function mensajes(lista: unknown, item: string): Mensaje[] {
  const arr = ((lista as Nodo | undefined)?.[item] ?? []) as Nodo[]
  return arr.map((m) => ({ codigo: String(m.Code ?? ''), mensaje: String(m.Msg ?? '') }))
}

function resultado(xml: string, operacion: string): Nodo {
  const body = cuerpoSoap(xml)
  const r = (body[`${operacion}Response`] as Nodo | undefined)?.[`${operacion}Result`] as Nodo | undefined
  if (!r) throw new ErrorArca(`Respuesta de ARCA sin ${operacion}Result.`)
  return r
}

export function leerRespuestaCae(xml: string): RespuestaCae {
  const r = resultado(xml, 'FECAESolicitar')
  const errores = mensajes(r.Errors, 'Err')
  const det = ((r.FeDetResp as Nodo | undefined)?.FECAEDetResponse as Nodo[] | undefined)?.[0]
  if (!det) {
    // Rechazo de cabecera (por ejemplo, punto de venta inexistente).
    return { resultado: 'R', cae: null, caeVence: null, observaciones: [], errores }
  }
  const cae = String(det.CAE ?? '').trim()
  const vence = String(det.CAEFchVto ?? '').trim()
  return {
    resultado: (String(det.Resultado ?? 'R') as RespuestaCae['resultado']) || 'R',
    cae: cae || null,
    caeVence: vence ? deArca(vence) : null,
    observaciones: mensajes(det.Observaciones, 'Obs'),
    errores,
  }
}

export function pedidoUltimoAutorizado(c: Credenciales, puntoVenta: number, tipo: number): string {
  return sobre(
    `<ar:FECompUltimoAutorizado>${auth(c)}${el('PtoVta', puntoVenta)}${el('CbteTipo', tipo)}</ar:FECompUltimoAutorizado>`,
    {
      ar: NS,
    },
  )
}

export function leerUltimoAutorizado(xml: string): number {
  const r = resultado(xml, 'FECompUltimoAutorizado')
  const errores = mensajes(r.Errors, 'Err')
  if (errores.length) throw new ErrorArca(errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(' · '), errores[0].codigo)
  return Number(r.CbteNro ?? 0)
}

export type ComprobanteConsultado = {
  numero: number
  fecha: string
  total: string
  docNumero: string
  cae: string
  caeVence: string
  resultado: string
}

export function pedidoConsulta(c: Credenciales, puntoVenta: number, tipo: number, numero: number): string {
  return sobre(
    `<ar:FECompConsultar>${auth(c)}<ar:FeCompConsReq>${el('CbteTipo', tipo)}${el('CbteNro', numero)}${el('PtoVta', puntoVenta)}</ar:FeCompConsReq></ar:FECompConsultar>`,
    { ar: NS },
  )
}

/** Null si ARCA no tiene ese comprobante (código 602). */
export function leerConsulta(xml: string): ComprobanteConsultado | null {
  const r = resultado(xml, 'FECompConsultar')
  const errores = mensajes(r.Errors, 'Err')
  if (errores.some((e) => e.codigo === '602')) return null
  if (errores.length) throw new ErrorArca(errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(' · '), errores[0].codigo)
  const g = r.ResultGet as Nodo
  return {
    numero: Number(g.CbteDesde),
    fecha: deArca(String(g.CbteFch)),
    total: String(g.ImpTotal),
    docNumero: String(g.DocNro),
    cae: String(g.CodAutorizacion ?? ''),
    caeVence: g.FchVto ? deArca(String(g.FchVto)) : '',
    resultado: String(g.Resultado ?? ''),
  }
}

export function pedidoDummy(): string {
  return sobre('<ar:FEDummy/>', { ar: NS })
}

export function leerDummy(xml: string): { aplicacion: string; base: string; autenticacion: string } {
  const r = resultado(xml, 'FEDummy')
  return { aplicacion: String(r.AppServer ?? ''), base: String(r.DbServer ?? ''), autenticacion: String(r.AuthServer ?? '') }
}

export const ACCION = (operacion: string) => `${NS}${operacion}`

/** Operaciones de WSFE con el transporte y las credenciales ya resueltos. */
export function wsfe(transporte: Transporte, ambiente: keyof typeof URL_WSFE) {
  const url = URL_WSFE[ambiente]
  return {
    dummy: async () => leerDummy(await transporte(url, ACCION('FEDummy'), pedidoDummy())),
    ultimoAutorizado: async (c: Credenciales, puntoVenta: number, tipo: number) =>
      leerUltimoAutorizado(await transporte(url, ACCION('FECompUltimoAutorizado'), pedidoUltimoAutorizado(c, puntoVenta, tipo))),
    solicitarCae: async (c: Credenciales, s: SolicitudCae) =>
      leerRespuestaCae(await transporte(url, ACCION('FECAESolicitar'), pedidoCae(c, s))),
    consultar: async (c: Credenciales, puntoVenta: number, tipo: number, numero: number) =>
      leerConsulta(await transporte(url, ACCION('FECompConsultar'), pedidoConsulta(c, puntoVenta, tipo, numero))),
  }
}
