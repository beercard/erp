import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * El "state" de las conexiones (OAuth de Mercado Libre y Tienda Nube, alta
 * de claves de WooCommerce): quién pidió conectar qué, firmado con
 * ERP_CLAVE_MAESTRA y con vencimiento. Así la vuelta de la plataforma no
 * puede traer otra empresa ni reusarse más tarde.
 */

export type Flujo = {
  tipo: 'mercadolibre' | 'tiendanube' | 'woocommerce'
  empresaId: string
  usuarioId: string
  /** WooCommerce: la dirección de la tienda. */
  tienda?: string
  /** Mercado Libre: el verificador PKCE. */
  verificador?: string
  vence: number
  n: string
}

const MINUTOS = 15

function clave() {
  const s = process.env.ERP_CLAVE_MAESTRA
  if (!s || s.length < 32) throw new Error('Falta ERP_CLAVE_MAESTRA en el servidor.')
  return createHmac('sha256', s).update('flujo-canales').digest()
}

const firmar = (cuerpo: string) => createHmac('sha256', clave()).update(cuerpo).digest('base64url')

export function crearFlujo(d: Omit<Flujo, 'vence' | 'n'>, ahora = Date.now()): string {
  const cuerpo = Buffer.from(
    JSON.stringify({ ...d, vence: ahora + MINUTOS * 60_000, n: randomBytes(8).toString('hex') }),
  ).toString('base64url')
  return `${cuerpo}.${firmar(cuerpo)}`
}

export function leerFlujo(token: string | null | undefined, ahora = Date.now()): Flujo | null {
  if (!token) return null
  const [cuerpo, firma] = token.split('.')
  if (!cuerpo || !firma) return null
  const esperada = Buffer.from(firmar(cuerpo))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  try {
    const f = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Flujo
    return f.vence > ahora ? f : null
  } catch {
    return null
  }
}
