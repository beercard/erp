import { and, eq, like, ne } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma } from '../../db/empresa'
import { empresas } from '../../db/schema'
import { sugerirCodigo, validarCodigo } from '../../lib/subdominio'

/**
 * Códigos de ingreso de las empresas (el subdominio): únicos, se proponen
 * del nombre al darla de alta y solo los cambia quien administra la
 * plataforma (cambiarlo cambia la dirección con la que entran todos).
 */

/** Un código libre a partir del nombre: "estudio-garcia", y si está, "estudio-garcia-2"… */
export async function codigoLibre(tx: Transaccion, nombre: string) {
  const base = sugerirCodigo(nombre)
  const usados = new Set(
    (
      await tx
        .select({ c: empresas.codigo })
        .from(empresas)
        .where(like(empresas.codigo, `${base}%`))
    ).map((f) => f.c),
  )
  if (!usados.has(base)) return base
  for (let n = 2; ; n++) {
    const c = `${base.slice(0, 30 - String(n).length - 1)}-${n}`
    if (!usados.has(c)) return c
  }
}

/** La empresa (activa) de un código, para la pantalla de ingreso y los certificados. */
export async function empresaPorCodigo(codigo: string) {
  if (!validarCodigo(codigo).ok) return null
  const [e] = await comoPlataforma((tx) =>
    tx
      .select({
        id: empresas.id,
        codigo: empresas.codigo,
        razonSocial: empresas.razonSocial,
        nombreFantasia: empresas.nombreFantasia,
      })
      .from(empresas)
      .where(and(eq(empresas.codigo, codigo.toLowerCase()), eq(empresas.activa, true))),
  )
  return e ? { ...e, nombre: e.nombreFantasia || e.razonSocial } : null
}

export async function cambiarCodigo(empresaId: string, entrada: string) {
  const v = validarCodigo(entrada)
  if (!v.ok) return { ok: false as const, error: v.error }
  return comoPlataforma(async (tx) => {
    const [otra] = await tx
      .select({ id: empresas.id })
      .from(empresas)
      .where(and(eq(empresas.codigo, v.codigo), ne(empresas.id, empresaId)))
    if (otra) return { ok: false as const, error: 'Ese código ya lo usa otra empresa.' }
    await tx.update(empresas).set({ codigo: v.codigo, actualizado: new Date() }).where(eq(empresas.id, empresaId))
    return { ok: true as const, codigo: v.codigo }
  })
}
