/**
 * Un subdominio por empresa: komsa.erp.vektra.digital. Se activa con
 * DOMINIO_EMPRESAS (el dominio base, por ejemplo erp.vektra.digital); sin
 * esa variable, todo funciona en un solo dominio, como en desarrollo.
 *
 * El dominio base sigue siendo el sitio comercial, el ingreso con el código
 * de empresa y el panel de la plataforma. Cada subdominio es el ingreso y el
 * sistema de una sola empresa, con su propia sesión (la cookie no tiene
 * Domain: queda atada a ese subdominio).
 */

/** Códigos que no puede tener una empresa (servicios, nombres engañosos). */
export const CODIGOS_RESERVADOS = new Set([
  'www',
  'erp',
  'app',
  'api',
  'admin',
  'administrador',
  'plataforma',
  'panel',
  'mail',
  'correo',
  'smtp',
  'imap',
  'pop',
  'ftp',
  'ssh',
  'vpn',
  'ns1',
  'ns2',
  'dns',
  'cdn',
  'static',
  'assets',
  'img',
  'media',
  'blog',
  'ayuda',
  'soporte',
  'help',
  'support',
  'status',
  'estado',
  'demo',
  'test',
  'prueba',
  'pruebas',
  'dev',
  'staging',
  'beta',
  'vektra',
  'ingresar',
  'registro',
  'login',
  'cuenta',
  'pago',
  'pagos',
  'facturacion',
  'arca',
  'afip',
  'seguridad',
  'root',
])

const FORMA = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/

export const dominioEmpresas = () =>
  (process.env.DOMINIO_EMPRESAS ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '') || null

/** Si el host es <codigo>.<dominio base>, el código; si no, null. */
export function codigoDelHost(host: string | null | undefined, base = dominioEmpresas()): string | null {
  if (!base || !host) return null
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (!h.endsWith(`.${base}`)) return null
  const codigo = h.slice(0, -(base.length + 1))
  return FORMA.test(codigo) && !codigo.includes('--') ? codigo : null
}

/** El host del dominio base (sin subdominio de empresa). */
export function esDominioBase(host: string | null | undefined, base = dominioEmpresas()): boolean {
  if (!base || !host) return false
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '') === base
}

/** Dirección de una empresa: https://komsa.erp.vektra.digital (en desarrollo, con el protocolo y puerto de APP_URL). */
export function urlDeEmpresa(codigo: string, ruta = '/', base = dominioEmpresas()): string {
  const app = new URL(process.env.APP_URL || 'https://localhost')
  if (!base) return `${app.origin}${ruta}`
  return `${app.protocol}//${codigo}.${base}${app.port ? `:${app.port}` : ''}${ruta}`
}

export function validarCodigo(v: string): { ok: true; codigo: string } | { ok: false; error: string } {
  const codigo = v.trim().toLowerCase()
  if (!FORMA.test(codigo) || codigo.includes('--')) {
    return {
      ok: false,
      error: 'El código va con letras minúsculas, números y guiones (de 1 a 30), sin guiones al principio ni al final.',
    }
  }
  if (CODIGOS_RESERVADOS.has(codigo)) return { ok: false, error: `"${codigo}" está reservado: elegí otro.` }
  return { ok: true, codigo }
}

/** Código propuesto a partir del nombre: "Estudio García S.R.L." → "estudio-garcia". */
export function sugerirCodigo(nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(s\.?\s?a\.?\s?s?|s\.?\s?r\.?\s?l|s\.?\s?a\.?\s?u|s\.?\s?h|s\.?\s?c\.?\s?a)\.?$/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '')
  const codigo = base || 'empresa'
  return CODIGOS_RESERVADOS.has(codigo) ? `${codigo}-empresa` : codigo
}
