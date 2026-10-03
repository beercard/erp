import { createHash, randomBytes } from 'node:crypto'

import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { comoPlataforma } from '../../db/empresa'
import { recuperacionesClave, sesiones, usuarios } from '../../db/schema'
import { enviarDePlataforma } from '../../modulos/comunicaciones/correo'
import { MARCA } from '../marca'
import { hashearClave, problemaDeClave } from './clave'

/**
 * "Olvidé mi contraseña" de los usuarios del sistema. El enlace va por email,
 * sirve una sola vez y vence en una hora. Al cambiar la clave se cierran todas
 * las sesiones abiertas de esa cuenta.
 */

const HORA = 60 * 60_000
const hashDe = (token: string) => createHash('sha256').update(token).digest('hex')

/** Siempre responde lo mismo: no revela si el email tiene cuenta. */
export async function pedirRecuperacion(email: string, base: string, ahora = new Date()) {
  const limpio = email.trim().toLowerCase()
  const [u] = await comoPlataforma((tx) =>
    tx
      .select({ id: usuarios.id, nombre: usuarios.nombre, activo: usuarios.activo })
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${limpio}`),
  )
  if (!u?.activo) return
  const token = randomBytes(32).toString('base64url')
  await comoPlataforma((tx) =>
    tx.insert(recuperacionesClave).values({ usuarioId: u.id, hashToken: hashDe(token), vence: new Date(ahora.getTime() + HORA) }),
  )
  await enviarDePlataforma(
    limpio,
    `Elegí una contraseña nueva para ${MARCA.producto}`,
    [
      `Hola ${u.nombre.split(' ')[0]}:`,
      '',
      `Pediste cambiar la contraseña de ${MARCA.producto}. Elegí una nueva desde este enlace (vale una hora y una sola vez):`,
      '',
      `${base}/ingresar/recuperar/${token}`,
      '',
      'Si no fuiste vos, ignorá este correo: tu contraseña sigue igual.',
    ].join('\n'),
  )
  return token
}

async function vigente(token: string, ahora: Date) {
  const [r] = await comoPlataforma((tx) =>
    tx
      .select({ id: recuperacionesClave.id, usuarioId: recuperacionesClave.usuarioId, email: usuarios.email })
      .from(recuperacionesClave)
      .innerJoin(usuarios, eq(usuarios.id, recuperacionesClave.usuarioId))
      .where(
        and(
          eq(recuperacionesClave.hashToken, hashDe(token)),
          isNull(recuperacionesClave.usada),
          gt(recuperacionesClave.vence, ahora),
        ),
      ),
  )
  return r ?? null
}

export async function leerRecuperacion(token: string, ahora = new Date()) {
  const r = await vigente(token, ahora)
  return r ? { email: r.email } : null
}

export async function usarRecuperacion(token: string, clave: string, repetir: string, ahora = new Date()) {
  const r = await vigente(token, ahora)
  if (!r) return { ok: false as const, error: 'El enlace venció o ya se usó. Pedí uno nuevo.' }
  const problema = problemaDeClave(clave)
  if (problema) return { ok: false as const, error: problema }
  if (clave !== repetir) return { ok: false as const, error: 'Las dos contraseñas no coinciden.' }
  const hash = await hashearClave(clave)
  const usado = await comoPlataforma(async (tx) => {
    const marcadas = await tx
      .update(recuperacionesClave)
      .set({ usada: ahora })
      .where(and(eq(recuperacionesClave.id, r.id), isNull(recuperacionesClave.usada)))
      .returning({ id: recuperacionesClave.id })
    if (!marcadas.length) return false
    await tx.update(usuarios).set({ hashClave: hash, actualizado: ahora }).where(eq(usuarios.id, r.usuarioId))
    // Quien tuviera la clave vieja (o una sesión robada) queda afuera.
    await tx.delete(sesiones).where(eq(sesiones.usuarioId, r.usuarioId))
    // Los demás enlaces pendientes de esa cuenta dejan de servir.
    await tx
      .update(recuperacionesClave)
      .set({ usada: ahora })
      .where(and(eq(recuperacionesClave.usuarioId, r.usuarioId), isNull(recuperacionesClave.usada)))
    return true
  })
  return usado ? { ok: true as const, email: r.email } : { ok: false as const, error: 'El enlace ya se usó.' }
}
