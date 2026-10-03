import { createHash, randomBytes } from 'node:crypto'

import { and, desc, eq, isNull, lt, or } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { apiClaves, empresas, membresias } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { primerError } from '../comercial/documentos'

/**
 * Claves de la API. Formato: erp_<empresa sin guiones>_<secreto>. La empresa
 * va en la clave para poder buscarla dentro del aislamiento de esa empresa;
 * el secreto (32 bytes aleatorios) es lo que la hace imposible de adivinar.
 */

const hash = (clave: string) => createHash('sha256').update(clave).digest('hex')
const FORMATO = /^erp_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/

const Esquema = z.object({
  nombre: z.string().trim().min(3, { error: 'Poné un nombre para reconocerla (por ejemplo, Tienda online).' }).max(60),
  acceso: z.enum(['lectura', 'total']),
})

export async function crearClave(tx: Transaccion, usuarioId: string, empresaId: string, entrada: unknown) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const clave = `erp_${empresaId.replace(/-/g, '')}_${randomBytes(32).toString('base64url')}`
  const [c] = await tx
    .insert(apiClaves)
    .values({ ...p.data, prefijo: `${clave.slice(0, 8)}…${clave.slice(-4)}`, hash: hash(clave), usuarioId })
    .returning({ id: apiClaves.id })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'api_clave', entidadId: c.id, despues: p.data })
  return { ok: true as const, id: c.id, clave }
}

export async function revocarClave(tx: Transaccion, usuarioId: string, id: string) {
  const [c] = await tx
    .update(apiClaves)
    .set({ revocada: new Date() })
    .where(and(eq(apiClaves.id, id), isNull(apiClaves.revocada)))
    .returning({ id: apiClaves.id })
  if (!c) return { ok: false as const, error: 'Esa clave no existe o ya estaba revocada.' }
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'api_clave', entidadId: id })
  return { ok: true as const }
}

export async function listarClaves(tx: Transaccion) {
  return tx
    .select({
      id: apiClaves.id,
      nombre: apiClaves.nombre,
      prefijo: apiClaves.prefijo,
      acceso: apiClaves.acceso,
      creado: apiClaves.creado,
      ultimoUso: apiClaves.ultimoUso,
      revocada: apiClaves.revocada,
    })
    .from(apiClaves)
    .orderBy(desc(apiClaves.creado))
}

export type Acceso = { empresaId: string; claveId: string; acceso: 'lectura' | 'total'; usuarioId: string | null }

/** Valida una clave (del encabezado Authorization: Bearer …). Null si no sirve. */
export async function autenticarClave(clave: string): Promise<Acceso | null> {
  const m = FORMATO.exec(clave.trim())
  if (!m) return null
  const h = m[1]
  const empresaId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  return conEmpresa(empresaId, async (tx) => {
    const [c] = await tx
      .select()
      .from(apiClaves)
      .where(and(eq(apiClaves.hash, hash(clave.trim())), isNull(apiClaves.revocada)))
    if (!c) return null
    // La clave deja de servir si la plataforma suspendió la empresa o si quien
    // la creó ya no tiene acceso a ella.
    const [e] = await tx.select({ activa: empresas.activa }).from(empresas).where(eq(empresas.id, empresaId))
    if (!e?.activa) return null
    if (c.usuarioId) {
      const [m] = await tx
        .select({ id: membresias.id })
        .from(membresias)
        .where(and(eq(membresias.usuarioId, c.usuarioId), eq(membresias.empresaId, empresaId), eq(membresias.activa, true)))
      if (!m) return null
    }
    // Último uso, como mucho una vez por minuto (no escribir en cada pedido).
    const haceUnMinuto = new Date(Date.now() - 60_000)
    await tx
      .update(apiClaves)
      .set({ ultimoUso: new Date() })
      .where(and(eq(apiClaves.id, c.id), or(isNull(apiClaves.ultimoUso), lt(apiClaves.ultimoUso, haceUnMinuto))))
    return { empresaId, claveId: c.id, acceso: c.acceso as 'lectura' | 'total', usuarioId: c.usuarioId }
  })
}
