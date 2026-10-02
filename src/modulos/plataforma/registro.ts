import { sql } from 'drizzle-orm'
import * as z from 'zod'

import { comoPlataforma } from '../../db/empresa'
import { usuarios } from '../../db/schema'
import { hashearClave, problemaDeClave } from '../../lib/auth/clave'
import { crearEmpresa } from './suscripciones'

/**
 * Alta de una cuenta nueva desde la web: la persona y su empresa, con la
 * prueba gratis. Quien ya tiene cuenta (un contador con otras empresas)
 * ingresa y crea la empresa desde "Elegir empresa", así nadie suma empresas
 * a una cuenta ajena.
 */

const EsquemaRegistro = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí tu nombre.' }),
  email: z.email({ error: 'Escribí un email válido.' }).trim().toLowerCase(),
  clave: z.string(),
  repetir: z.string(),
  razonSocial: z.string(),
  cuit: z.string(),
  condicionIva: z.string(),
  acepta: z.literal('on', { error: 'Para seguir tenés que aceptar los términos del servicio.' }),
})

export async function registrarCuenta(
  entrada: unknown,
): Promise<{ ok: true; email: string; empresaId: string } | { ok: false; error: string }> {
  const p = EsquemaRegistro.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const problema = problemaDeClave(d.clave)
  if (problema) return { ok: false, error: problema }
  if (d.clave !== d.repetir) return { ok: false, error: 'Las dos contraseñas no coinciden.' }

  const [existente] = await comoPlataforma((tx) =>
    tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${d.email}`),
  )
  if (existente) {
    return { ok: false, error: 'Ese email ya tiene una cuenta: ingresá y creá la empresa desde "Elegir empresa".' }
  }
  const [usuario] = await comoPlataforma(async (tx) =>
    tx
      .insert(usuarios)
      .values({ email: d.email, nombre: d.nombre, hashClave: await hashearClave(d.clave) })
      .returning(),
  )
  const empresa = await crearEmpresa(usuario.id, { razonSocial: d.razonSocial, cuit: d.cuit, condicionIva: d.condicionIva })
  if (!empresa.ok) {
    // Sin empresa la cuenta no sirve: se borra para que pueda volver a intentar con el mismo email.
    await comoPlataforma((tx) => tx.delete(usuarios).where(sql`${usuarios.id} = ${usuario.id}`))
    return empresa
  }
  return { ok: true, email: d.email, empresaId: empresa.empresaId }
}
