import { asc, count, eq, inArray, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { gruposClientes, terceros, usuariosGruposClientes } from '../../db/schema'
import { auditar } from '../../lib/auditoria'

/**
 * Grupos de clientes. Un usuario con grupos asignados solo ve los clientes
 * de esos grupos y lo que cuelga de ellos (órdenes, contratos, equipos,
 * formularios); sin grupos ve todo. Lo hace cumplir Postgres
 * (drizzle/0048_grupos_clientes_seguridad.sql): acá solo se administran.
 */

const Nombre = z.string().trim().min(2, { error: 'Escribí el nombre del grupo.' }).max(60)

export async function guardarGrupo(tx: Transaccion, usuarioId: string, nombre: unknown, id?: string) {
  const p = Nombre.safeParse(nombre)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const [repetido] = await tx
    .select({ id: gruposClientes.id })
    .from(gruposClientes)
    .where(sql`lower(${gruposClientes.nombre}) = lower(${p.data})`)
  if (repetido && repetido.id !== id) return { ok: false as const, error: 'Ya hay un grupo con ese nombre.' }
  if (id) {
    const [g] = await tx
      .update(gruposClientes)
      .set({ nombre: p.data, actualizado: new Date() })
      .where(eq(gruposClientes.id, id))
      .returning()
    if (!g) return { ok: false as const, error: 'Ese grupo ya no existe.' }
    await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'grupo_clientes', entidadId: id, despues: g })
    return { ok: true as const, id }
  }
  const [g] = await tx.insert(gruposClientes).values({ nombre: p.data }).returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'grupo_clientes', entidadId: g.id, despues: g })
  return { ok: true as const, id: g.id }
}

/** Los clientes del grupo quedan sin grupo (visibles solo para quienes no tienen grupos). */
export async function borrarGrupo(tx: Transaccion, usuarioId: string, id: string) {
  const [g] = await tx.select().from(gruposClientes).where(eq(gruposClientes.id, id))
  if (!g) return { ok: false as const, error: 'Ese grupo ya no existe.' }
  if (await usuarioRestringido(tx)) {
    return { ok: false as const, error: 'Solo puede borrar grupos alguien que ve todos los clientes (sin grupos asignados).' }
  }
  await tx.update(terceros).set({ grupoClienteId: null }).where(eq(terceros.grupoClienteId, id))
  await tx.delete(gruposClientes).where(eq(gruposClientes.id, id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'grupo_clientes', entidadId: id, antes: g })
  return { ok: true as const }
}

/** Grupos con cuántos clientes tienen y qué usuarios los ven. */
export async function listarGrupos(tx: Transaccion) {
  const [grupos, clientes, usuarios] = await Promise.all([
    tx.select().from(gruposClientes).orderBy(asc(gruposClientes.nombre)),
    tx
      .select({ grupoId: terceros.grupoClienteId, n: count() })
      .from(terceros)
      .where(sql`${terceros.grupoClienteId} is not null`)
      .groupBy(terceros.grupoClienteId),
    tx.select().from(usuariosGruposClientes),
  ])
  return grupos.map((g) => ({
    id: g.id,
    nombre: g.nombre,
    clientes: clientes.find((c) => c.grupoId === g.id)?.n ?? 0,
    usuarios: usuarios.filter((u) => u.grupoId === g.id).map((u) => u.usuarioId),
  }))
}

/** Reemplaza los grupos de un usuario. Sin ninguno, ve todos los clientes. */
export async function asignarGruposUsuario(tx: Transaccion, usuarioId: string, de: string, grupoIds: string[]) {
  const ids = [...new Set(grupoIds)]
  if (ids.length) {
    const validos = await tx.select({ id: gruposClientes.id }).from(gruposClientes).where(inArray(gruposClientes.id, ids))
    if (validos.length !== ids.length) return { ok: false as const, error: 'Algún grupo ya no existe.' }
  }
  const antes = (await gruposDelUsuario(tx, de)).sort()
  await tx.delete(usuariosGruposClientes).where(eq(usuariosGruposClientes.usuarioId, de))
  if (ids.length) await tx.insert(usuariosGruposClientes).values(ids.map((grupoId) => ({ usuarioId: de, grupoId })))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'grupos_usuario',
    entidadId: de,
    antes: { grupos: antes },
    despues: { grupos: ids.sort() },
  })
  return { ok: true as const }
}

export async function gruposDelUsuario(tx: Transaccion, usuarioId: string) {
  const filas = await tx
    .select({ grupoId: usuariosGruposClientes.grupoId })
    .from(usuariosGruposClientes)
    .where(eq(usuariosGruposClientes.usuarioId, usuarioId))
  return filas.map((f) => f.grupoId)
}

/** Grupos del usuario de la transacción (vacío: ve todo o no hay usuario). */
export async function gruposDeQuienConsulta(tx: Transaccion) {
  const filas = await tx
    .select({ id: gruposClientes.id, nombre: gruposClientes.nombre })
    .from(usuariosGruposClientes)
    .innerJoin(gruposClientes, eq(gruposClientes.id, usuariosGruposClientes.grupoId))
    .where(sql`${usuariosGruposClientes.usuarioId} = nullif(current_setting('app.usuario_id', true), '')::uuid`)
    .orderBy(asc(gruposClientes.nombre))
  return filas
}

export async function usuarioRestringido(tx: Transaccion) {
  return (await gruposDeQuienConsulta(tx)).length > 0
}
