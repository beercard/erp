import { eq } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { empresaMarca } from '../../db/schema'

/**
 * Logo y diseño de los comprobantes de la empresa. El logo se valida por su
 * contenido (la firma del archivo), no por el nombre: PNG, JPG o WebP de
 * hasta 500 KB. SVG no, porque puede llevar código.
 */

export const DISENOS = {
  clasico: { nombre: 'Clásico', detalle: 'Cuadros con borde, en blanco y negro: el de toda la vida.' },
  moderno: { nombre: 'Moderno', detalle: 'Franja de color con el logo grande y la tabla con encabezado de color.' },
  compacto: { nombre: 'Compacto', detalle: 'Letra más chica y sin cuadros: entra más en una hoja.' },
} as const
export type Diseno = keyof typeof DISENOS

export const LOGO_MAXIMO = 500 * 1024

export type Marca = { diseno: Diseno; color: string; logo: string | null }

/** Tipo de imagen por la firma del archivo, o null si no es PNG, JPG ni WebP. */
export function tipoDeImagen(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP')
    return 'image/webp'
  return null
}

/** Lo que usan las hojas de impresión: el diseño, el color y el logo como data URL. */
export async function obtenerMarca(tx: Transaccion): Promise<Marca> {
  const [m] = await tx.select().from(empresaMarca)
  return {
    diseno: (m?.diseno as Diseno) ?? 'clasico',
    color: m?.color ?? '#0f766e',
    logo: m?.logo && m.logoTipo ? `data:${m.logoTipo};base64,${m.logo.toString('base64')}` : null,
  }
}

async function guardar(tx: Transaccion, valores: Partial<typeof empresaMarca.$inferInsert>) {
  const [actual] = await tx.select({ id: empresaMarca.id }).from(empresaMarca)
  if (actual)
    await tx
      .update(empresaMarca)
      .set({ ...valores, actualizado: new Date() })
      .where(eq(empresaMarca.id, actual.id))
  else await tx.insert(empresaMarca).values(valores)
}

export async function guardarDiseno(tx: Transaccion, diseno: string, color: string) {
  if (!(diseno in DISENOS)) return { ok: false as const, error: 'Elegí uno de los diseños.' }
  const c = color.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(c)) return { ok: false as const, error: 'El color no es válido.' }
  await guardar(tx, { diseno, color: c })
  return { ok: true as const }
}

export async function guardarLogo(tx: Transaccion, archivo: Uint8Array) {
  if (!archivo.length) return { ok: false as const, error: 'Elegí la imagen del logo.' }
  if (archivo.length > LOGO_MAXIMO) return { ok: false as const, error: 'El logo pesa más de 500 KB: achicalo antes de subirlo.' }
  const tipo = tipoDeImagen(archivo)
  if (!tipo) return { ok: false as const, error: 'El logo tiene que ser PNG, JPG o WebP.' }
  await guardar(tx, { logo: Buffer.from(archivo), logoTipo: tipo })
  return { ok: true as const }
}

export async function quitarLogo(tx: Transaccion) {
  await guardar(tx, { logo: null, logoTipo: null })
  return { ok: true as const }
}
