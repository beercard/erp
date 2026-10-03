import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Enlaces públicos firmados (por ejemplo, la factura que se manda por
 * WhatsApp): llevan la empresa y el documento, firmados con
 * ERP_CLAVE_MAESTRA, así nadie puede armar uno de otro documento.
 */

function clave() {
  const s = process.env.ERP_CLAVE_MAESTRA
  if (!s || s.length < 32) throw new Error('Falta ERP_CLAVE_MAESTRA en el servidor.')
  return createHmac('sha256', s).update('enlaces-publicos').digest()
}

const firmar = (cuerpo: string) => createHmac('sha256', clave()).update(cuerpo).digest('base64url').slice(0, 32)

export function firmarEnlace(tipo: string, empresaId: string, id: string, dias = 180, ahora = Date.now()) {
  const cuerpo = Buffer.from(JSON.stringify([tipo, empresaId, id, Math.floor(ahora / 1000) + dias * 86_400])).toString(
    'base64url',
  )
  return `${cuerpo}.${firmar(cuerpo)}`
}

export function leerEnlace(token: string, tipo: string, ahora = Date.now()) {
  const [cuerpo, firma] = token.split('.')
  if (!cuerpo || !firma) return null
  const esperada = Buffer.from(firmar(cuerpo))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  try {
    const [t, empresaId, id, vence] = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as [
      string,
      string,
      string,
      number,
    ]
    return t === tipo && vence * 1000 > ahora ? { empresaId, id } : null
  } catch {
    return null
  }
}

/** Dirección pública de una factura (para el email al cliente): vale un año. */
export const enlaceDeComprobante = (empresaId: string, id: string) =>
  `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/comprobante/${firmarEnlace('factura', empresaId, id, 365)}`
