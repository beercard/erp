import { createHash } from 'node:crypto'

import { and, count, desc, eq, gt } from 'drizzle-orm'
import * as z from 'zod'

import { comoPlataforma } from '../../db/empresa'
import { consultasSitio } from '../../db/schema'
import { enviarDePlataforma } from '../comunicaciones/correo'

/** Consultas del sitio comercial: se guardan y, si hay correo configurado, se avisan a Vektra. */

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const Esquema = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí tu nombre.' }).max(100),
  email: z.email({ error: 'Ese email no es válido.' }).max(200),
  telefono: opcional(40),
  empresa: opcional(120),
  rubro: opcional(80),
  mensaje: z.string().trim().min(10, { error: 'Contanos un poco más (al menos 10 letras).' }).max(4000),
  origen: opcional(200),
})

/** Tope por IP: suficiente para una persona, poco para un robot. */
const POR_HORA = 5

export async function registrarConsulta(entrada: unknown, ip: string | null, ahora = new Date()) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const ipHash = ip ? createHash('sha256').update(`consulta:${ip}`).digest('hex').slice(0, 32) : null
  const r = await comoPlataforma(async (tx) => {
    // Tope general, por si llegan desde muchas conexiones a la vez.
    const [{ total }] = await tx
      .select({ total: count() })
      .from(consultasSitio)
      .where(gt(consultasSitio.creado, new Date(ahora.getTime() - 3_600_000)))
    if (total >= 200) return null
    if (ipHash) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(consultasSitio)
        .where(and(eq(consultasSitio.ipHash, ipHash), gt(consultasSitio.creado, new Date(ahora.getTime() - 3_600_000))))
      if (n >= POR_HORA) return null
    }
    const [c] = await tx
      .insert(consultasSitio)
      .values({ ...p.data, ipHash })
      .returning({ id: consultasSitio.id })
    return c
  })
  if (!r)
    return { ok: false as const, error: 'Recibimos varias consultas seguidas desde tu conexión. Probá de nuevo en un rato.' }
  const destino = process.env.CONTACTO_EMAIL
  if (destino) {
    const d = p.data
    await enviarDePlataforma(
      destino,
      `Consulta del sitio: ${d.nombre}${d.empresa ? ` (${d.empresa})` : ''}`,
      [
        `Nombre: ${d.nombre}`,
        `Email: ${d.email}`,
        d.telefono && `Teléfono: ${d.telefono}`,
        d.empresa && `Empresa: ${d.empresa}`,
        d.rubro && `Rubro: ${d.rubro}`,
        d.origen && `Desde: ${d.origen}`,
        '',
        d.mensaje,
      ]
        .filter((l) => l !== null && l !== undefined)
        .join('\n'),
      d.email,
    )
  }
  return { ok: true as const, id: r.id }
}

export async function listarConsultas(limite = 100) {
  return comoPlataforma((tx) => tx.select().from(consultasSitio).orderBy(desc(consultasSitio.creado)).limit(limite))
}

export async function marcarAtendida(id: string) {
  await comoPlataforma((tx) => tx.update(consultasSitio).set({ estado: 'atendida' }).where(eq(consultasSitio.id, id)))
}
