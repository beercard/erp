import { and, eq } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { archivosServicio, ordenesServicio } from '../../db/schema'
import { estaAbierta } from './tipos'

/**
 * Fotos y firmas de las órdenes. El celular las achica antes de subirlas
 * (lado mayor de 1600 px, JPEG); acá se controla el tipo y el tamaño real
 * mirando los primeros bytes, no lo que dice el navegador.
 */

export const TAMANO_MAXIMO = 2_500_000

function tipoReal(datos: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return 'image/jpeg'
  if (datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (datos.subarray(0, 4).toString('ascii') === 'RIFF' && datos.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

export async function guardarArchivo(
  tx: Transaccion,
  usuarioId: string,
  ordenId: string,
  clase: 'foto' | 'firma',
  datos: Buffer,
) {
  if (!datos.length) return { ok: false as const, error: 'El archivo está vacío.' }
  if (datos.length > TAMANO_MAXIMO) return { ok: false as const, error: 'La imagen es muy grande (hasta 2,5 MB).' }
  const tipoMime = tipoReal(datos)
  if (!tipoMime) return { ok: false as const, error: 'Solo se aceptan imágenes JPEG, PNG o WebP.' }
  const [o] = await tx.select({ estado: ordenesServicio.estado }).from(ordenesServicio).where(eq(ordenesServicio.id, ordenId))
  if (!o) return { ok: false as const, error: 'Esa orden de servicio ya no existe.' }
  if (!estaAbierta(o.estado)) return { ok: false as const, error: 'La orden ya se informó: no se le agregan fotos.' }
  const [a] = await tx
    .insert(archivosServicio)
    .values({ ordenId, clase, tipoMime, tamano: datos.length, datos, usuarioId })
    .returning({ id: archivosServicio.id })
  return { ok: true as const, id: a.id }
}

export async function leerArchivo(tx: Transaccion, id: string) {
  const [a] = await tx
    .select({ datos: archivosServicio.datos, tipoMime: archivosServicio.tipoMime, ordenId: archivosServicio.ordenId })
    .from(archivosServicio)
    .where(eq(archivosServicio.id, id))
  return a ?? null
}

/** Quita una foto mientras la orden no se informó. */
export async function quitarArchivo(tx: Transaccion, ordenId: string, id: string) {
  const [o] = await tx.select({ estado: ordenesServicio.estado }).from(ordenesServicio).where(eq(ordenesServicio.id, ordenId))
  if (!o || !estaAbierta(o.estado)) return { ok: false as const, error: 'La orden ya se informó.' }
  await tx.delete(archivosServicio).where(and(eq(archivosServicio.id, id), eq(archivosServicio.ordenId, ordenId)))
  return { ok: true as const }
}
