/**
 * Defensas de los formularios públicos (registro, contacto, recuperar la
 * clave) contra bots y altas falsas, en capas:
 *
 * 1. Cloudflare Turnstile (si están TURNSTILE_SITE_KEY y TURNSTILE_SECRET):
 *    el desafío invisible de Cloudflare; el token se verifica acá, en el
 *    servidor, contra su API. Sin las claves, se saltea (desarrollo).
 * 2. Trampa: un campo oculto que una persona no completa y un bot sí.
 * 3. Tiempo mínimo: un formulario enviado en menos de 3 segundos desde que se
 *    abrió no lo llenó una persona. La hora la firma el servidor (el reloj de
 *    la computadora de la persona puede estar adelantado o atrasado).
 * 4. Correos descartables (mailinator y similares): no sirven para recuperar
 *    la cuenta ni para recibir facturas.
 *
 * Los frenos por IP y por email (src/lib/frenos.ts) siguen aparte. Lo que
 * corre solo en el servidor está en antibotsServidor.ts; esto lo usa también
 * el navegador.
 */

// Un nombre que ningún navegador autocompleta (con "sitio web" algunos lo llenaban solos).
export const CAMPO_TRAMPA = 'zz_dejar_vacio'
export const CAMPO_TIEMPO = 'abierto'

/** Dominios de correo descartable más usados. */
const DESCARTABLES = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  '10minutemail.com',
  '10minutemail.net',
  'tempmail.com',
  'temp-mail.org',
  'tempmailo.com',
  'yopmail.com',
  'yopmail.net',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'mintemail.com',
  'throwawaymail.com',
  'fakeinbox.com',
  'mohmal.com',
  'emailondeck.com',
  'mailnesia.com',
  'tempinbox.com',
  'spamgourmet.com',
  'moakt.com',
  'burnermail.io',
])

export function correoDescartable(email: string) {
  const dominio = email.trim().toLowerCase().split('@')[1] ?? ''
  return DESCARTABLES.has(dominio) || [...DESCARTABLES].some((d) => dominio.endsWith(`.${d}`))
}

export type MotivoBot = 'trampa' | 'rapido' | 'vencido' | 'turnstile'

export const MENSAJE_BOT = 'No pudimos verificar que seas una persona. Recargá la página y probá de nuevo.'

/** Qué decirle a una persona según qué control no pasó (a un bot le da lo mismo). */
export function mensajeBot(motivo: MotivoBot) {
  if (motivo === 'rapido') return 'Se envió demasiado rápido. Esperá unos segundos y volvé a tocar el botón.'
  if (motivo === 'vencido') return 'El formulario estuvo abierto mucho tiempo. Recargá la página y completalo de nuevo.'
  if (motivo === 'turnstile')
    return 'Falta la verificación de Cloudflare: esperá a que aparezca el tilde verde arriba del botón y volvé a enviar.'
  return MENSAJE_BOT
}

/** Contraseña segura al azar (en el navegador o en el servidor). */
export function generarClave(largo = 18) {
  // Sin caracteres que se confunden (0/O, 1/l/I).
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const numeros = '23456789'
  const simbolos = '!#$%&*+-=?@_'
  const todos = letras + numeros + simbolos
  const azar = new Uint32Array(largo)
  crypto.getRandomValues(azar)
  const clave = [...azar].map((n) => todos[n % todos.length])
  // Al menos un número y un símbolo.
  clave[azar[0] % largo] = numeros[azar[1] % numeros.length]
  clave[(azar[0] + 1) % largo] = simbolos[azar[2] % simbolos.length]
  return clave.join('')
}
