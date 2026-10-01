import forge from 'node-forge'

import { cuerpoSoap, ErrorArca, escapar, leerXml, sobre, type Transporte } from './soap'

/**
 * WSAA: autenticación ante ARCA. Se arma un pedido de ticket (TRA), se firma
 * con el certificado de la empresa (CMS / PKCS#7 con el contenido adentro) y
 * ARCA devuelve un token y una firma que valen unas 12 horas.
 */

export const URL_WSAA = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
} as const

export type Ticket = { token: string; firma: string; vence: Date }

/** Fecha con zona horaria explícita, como la pide el TRA. */
function isoConZona(fecha: Date): string {
  return fecha.toISOString().replace(/\.\d{3}Z$/, '-00:00')
}

export function crearTra(servicio: string, ahora: Date = new Date()): string {
  const desde = new Date(ahora.getTime() - 10 * 60_000)
  const hasta = new Date(ahora.getTime() + 10 * 60_000)
  return (
    '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${isoConZona(desde)}</generationTime>` +
    `<expirationTime>${isoConZona(hasta)}</expirationTime>` +
    `</header><service>${escapar(servicio)}</service></loginTicketRequest>`
  )
}

/** Firma el TRA y lo devuelve en base64, listo para LoginCms. */
export function firmarTra(tra: string, certificadoPem: string, clavePem: string): string {
  const certificado = forge.pki.certificateFromPem(certificadoPem)
  const clave = forge.pki.privateKeyFromPem(clavePem)
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, 'utf8')
  p7.addCertificate(certificado)
  p7.addSigner({
    key: clave,
    certificate: certificado,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  })
  p7.sign()
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
}

export function pedidoLoginCms(cms: string): string {
  return sobre(`<wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms>`, {
    wsaa: 'http://wsaa.view.sua.dvadac.desein.afip.gov',
  })
}

/** Lee la respuesta de LoginCms. El ticket viene como XML escapado adentro. */
export function leerLoginCms(xml: string): Ticket {
  const body = cuerpoSoap(xml)
  const ret = (body.loginCmsResponse as Record<string, unknown> | undefined)?.loginCmsReturn
  if (typeof ret !== 'string') throw new ErrorArca('ARCA no devolvió el ticket de acceso.')
  const ticket = leerXml(ret).loginTicketResponse as Record<string, Record<string, string>> | undefined
  const token = ticket?.credentials?.token
  const firma = ticket?.credentials?.sign
  const vence = ticket?.header?.expirationTime
  if (!token || !firma || !vence) throw new ErrorArca('El ticket de acceso de ARCA vino incompleto.')
  return { token, firma, vence: new Date(vence) }
}

export async function pedirTicket(opciones: {
  transporte: Transporte
  ambiente: keyof typeof URL_WSAA
  servicio: string
  certificado: string
  clave: string
  ahora?: Date
}): Promise<Ticket> {
  const cms = firmarTra(crearTra(opciones.servicio, opciones.ahora), opciones.certificado, opciones.clave)
  const xml = await opciones.transporte(URL_WSAA[opciones.ambiente], '', pedidoLoginCms(cms))
  return leerLoginCms(xml)
}
