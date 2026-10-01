import https from 'node:https'

import { XMLParser } from 'fast-xml-parser'

/**
 * SOAP mínimo para los servicios de ARCA: armar el sobre, mandarlo y leer la
 * respuesta. Se separa el transporte para que las pruebas lo reemplacen.
 */

export type Transporte = (url: string, accion: string, cuerpo: string) => Promise<string>

/** El pedido no llegó a ARCA: se puede reintentar sin riesgo. */
export class ErrorSinEnviar extends Error {}

/**
 * No se sabe si ARCA recibió el pedido (se cortó la conexión o venció el
 * tiempo después de mandarlo). Para un pedido de CAE hay que consultar antes
 * de volver a pedir, o se puede autorizar dos veces.
 */
export class ErrorIncierto extends Error {}

/** ARCA respondió con un error del servicio (SOAP Fault o error propio). */
export class ErrorArca extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: string,
  ) {
    super(mensaje)
  }
}

export function escapar(texto: string | number): string {
  return String(texto).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
}

export function sobre(cuerpo: string, espacios: Record<string, string>): string {
  const ns = Object.entries(espacios)
    .map(([p, u]) => ` xmlns:${p}="${u}"`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"${ns}><soapenv:Header/><soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`
}

const lector = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  // Listas que ARCA devuelve con un solo elemento a veces y varios otras.
  isArray: (nombre) =>
    [
      'Obs',
      'Err',
      'Evt',
      'FECAEDetResponse',
      'AlicIva',
      'Tributo',
      'CbteAsoc',
      'Opcional',
      'TributoTipo',
      'CondicionIvaReceptor',
    ].includes(nombre),
})

export function leerXml(xml: string): Record<string, unknown> {
  return lector.parse(xml) as Record<string, unknown>
}

/** Cuerpo de la respuesta SOAP; si es un Fault, lanza ErrorArca. */
export function cuerpoSoap(xml: string): Record<string, unknown> {
  const doc = leerXml(xml)
  const env = (doc.Envelope ?? {}) as Record<string, unknown>
  const body = (env.Body ?? {}) as Record<string, unknown>
  const fault = body.Fault as Record<string, unknown> | undefined
  if (fault) throw new ErrorArca(String(fault.faultstring ?? 'Error de ARCA'), String(fault.faultcode ?? ''))
  return body
}

const agenteComun = new https.Agent({ keepAlive: true })
/**
 * El WSFE de producción negocia TLS con una clave DH que OpenSSL 3 rechaza
 * (ERR_SSL_DH_KEY_TOO_SMALL, comprobado el 01/10/2026; homologación no):
 * hay que bajar el nivel de seguridad solo para WSFE. Lo mismo hace la
 * librería abierta LaPyme/facturas.
 */
const agenteWsfe = new https.Agent({ keepAlive: true, ciphers: 'DEFAULT@SECLEVEL=0' })

/**
 * Transporte real: POST con tiempo límite. Distingue si el pedido llegó a
 * salir: un error antes de mandar el cuerpo se puede reintentar; después, no
 * se sabe qué hizo ARCA.
 */
export function transporteHttp(tiempoMs = 30_000): Transporte {
  return (url, accion, cuerpo) =>
    new Promise((resolver, rechazar) => {
      let enviado = false
      const pedido = https.request(
        url,
        {
          method: 'POST',
          agent: url.includes('wsfev1') ? agenteWsfe : agenteComun,
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: `"${accion}"`,
            'Content-Length': Buffer.byteLength(cuerpo),
          },
        },
        (respuesta) => {
          const partes: Buffer[] = []
          respuesta.on('data', (p: Buffer) => partes.push(p))
          respuesta.on('error', () => rechazar(new ErrorIncierto('Se cortó la respuesta de ARCA.')))
          respuesta.on('end', () => {
            const texto = Buffer.concat(partes).toString('utf8')
            // Un Fault viene con 500: lo interpreta quien lee el cuerpo.
            if ((respuesta.statusCode ?? 500) >= 400 && !texto.includes('Fault')) {
              rechazar(new ErrorIncierto(`ARCA respondió ${respuesta.statusCode}.`))
            } else resolver(texto)
          })
        },
      )
      pedido.setTimeout(tiempoMs, () => pedido.destroy(new Error('tiempo agotado')))
      pedido.on('finish', () => (enviado = true))
      pedido.on('error', (e: Error & { code?: string }) => {
        rechazar(
          enviado
            ? new ErrorIncierto('ARCA no respondió a tiempo.')
            : new ErrorSinEnviar(`No se pudo conectar con ARCA (${e.code ?? e.message}).`),
        )
      })
      pedido.end(cuerpo)
    })
}
