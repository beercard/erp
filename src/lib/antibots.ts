/**
 * Defensas de los formularios públicos (registro, contacto, recuperar la
 * clave) contra bots y altas falsas, en capas:
 *
 * 1. Cloudflare Turnstile (si están TURNSTILE_SITE_KEY y TURNSTILE_SECRET):
 *    el desafío invisible de Cloudflare; el token se verifica acá, en el
 *    servidor, contra su API. Sin las claves, se saltea (desarrollo).
 * 2. Trampa: un campo oculto que una persona no completa y un bot sí.
 * 3. Tiempo mínimo: un formulario enviado en menos de 3 segundos desde que se
 *    abrió no lo llenó una persona.
 * 4. Correos descartables (mailinator y similares): no sirven para recuperar
 *    la cuenta ni para recibir facturas.
 *
 * Los frenos por IP y por email (src/lib/frenos.ts) siguen aparte.
 */

type Fetch = typeof fetch

export const CAMPO_TRAMPA = 'sitio_web'
export const CAMPO_TIEMPO = 'abierto'
const SEGUNDOS_MINIMOS = 3

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || null

/** Verifica el token del widget de Turnstile. Sin clave secreta configurada, no exige nada. */
export async function verificarTurnstile(token: string | null, ip: string | null, f: Fetch = fetch): Promise<boolean> {
  const secreto = process.env.TURNSTILE_SECRET
  if (!secreto) return true
  if (!token) return false
  const cuerpo = new URLSearchParams({ secret: secreto, response: token })
  if (ip) cuerpo.set('remoteip', ip)
  try {
    const r = await f('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: cuerpo,
      signal: AbortSignal.timeout(10_000),
    })
    const d = (await r.json()) as { success?: boolean }
    return d.success === true
  } catch {
    // Si Cloudflare no responde, mejor dejar pasar que bloquear a todos (quedan los demás frenos).
    return true
  }
}

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

/**
 * Controla lo que manda el formulario. Devuelve el motivo del rechazo (para el
 * registro interno) o null si pasa. A la persona se le muestra un mensaje genérico.
 */
export async function controlarEnvio(
  fd: FormData,
  ip: string | null,
  ahora = Date.now(),
  f: Fetch = fetch,
): Promise<string | null> {
  if (String(fd.get(CAMPO_TRAMPA) ?? '').trim()) return 'trampa'
  const abierto = Number(fd.get(CAMPO_TIEMPO) ?? 0)
  if (!abierto || ahora - abierto < SEGUNDOS_MINIMOS * 1000 || ahora - abierto > 24 * 3600_000) return 'tiempo'
  const token = String(fd.get('cf-turnstile-response') ?? '') || null
  if (!(await verificarTurnstile(token, ip, f))) return 'turnstile'
  return null
}

export const MENSAJE_BOT = 'No pudimos verificar que seas una persona. Recargá la página y probá de nuevo.'

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
