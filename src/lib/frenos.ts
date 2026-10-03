import { createHash } from 'node:crypto'

import { and, count, eq, gt, lt } from 'drizzle-orm'

import { comoPlataforma } from '../db/empresa'
import { frenos } from '../db/schema'

/**
 * Límites de intentos guardados en la base. `superado` mira cuántos hubo en
 * la ventana; `anotar` suma uno. Las IP se guardan resumidas (hash).
 */

export const claveIp = (prefijo: string, ip: string | null) =>
  ip ? `${prefijo}:ip:${createHash('sha256').update(ip).digest('hex').slice(0, 24)}` : null

export async function superado(claves: (string | null)[], maximo: number, ventanaMs: number, ahora = new Date()) {
  const validas = claves.filter((c): c is string => Boolean(c))
  if (!validas.length) return false
  return comoPlataforma(async (tx) => {
    for (const clave of validas) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(frenos)
        .where(and(eq(frenos.clave, clave), gt(frenos.creado, new Date(ahora.getTime() - ventanaMs))))
      if (n >= maximo) return true
    }
    return false
  })
}

export async function anotar(claves: (string | null)[]) {
  const validas = claves.filter((c): c is string => Boolean(c))
  if (!validas.length) return
  await comoPlataforma((tx) => tx.insert(frenos).values(validas.map((clave) => ({ clave }))))
}

export async function olvidar(clave: string) {
  await comoPlataforma((tx) => tx.delete(frenos).where(eq(frenos.clave, clave)))
}

/** Para la tarea periódica: lo de más de un día ya no frena nada. */
export async function limpiarFrenos(ahora = new Date()) {
  await comoPlataforma((tx) => tx.delete(frenos).where(lt(frenos.creado, new Date(ahora.getTime() - 86_400_000))))
}
