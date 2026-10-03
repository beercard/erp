import { sql } from 'drizzle-orm'

import { db, type Transaccion } from './conexion'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Una sesión: además de la empresa fija al usuario, que limita qué clientes ve (grupos de clientes). */
type Quien = { empresa: { id: string }; usuario: { id: string } }

/**
 * Todo acceso a datos de una empresa pasa por acá. Abre una transacción,
 * fija la empresa (app.empresa_id) y baja al rol erp_app: desde ese momento
 * Postgres solo deja ver y escribir filas de esa empresa (RLS forzado, ver
 * drizzle/0001_seguridad.sql), aunque una consulta se olvide de filtrar.
 * Con una sesión, además, los grupos de clientes del usuario
 * (drizzle/0048_grupos_clientes_seguridad.sql).
 */
export async function conEmpresa<T>(empresa: string | Quien, trabajo: (tx: Transaccion) => Promise<T>): Promise<T> {
  const empresaId = typeof empresa === 'string' ? empresa : empresa.empresa.id
  const usuarioId = typeof empresa === 'string' ? null : empresa.usuario.id
  if (!UUID.test(empresaId)) throw new Error('Empresa inválida')
  if (usuarioId !== null && !UUID.test(usuarioId)) throw new Error('Usuario inválido')
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.empresa_id', ${empresaId}, true)`)
    if (usuarioId) await tx.execute(sql`select set_config('app.usuario_id', ${usuarioId}, true)`)
    await tx.execute(sql`set local role erp_app`)
    return trabajo(tx)
  })
}

/**
 * Acceso a las tablas de plataforma (usuarios, sesiones, membresías,
 * empresas) sin empresa fijada. Con el mismo rol erp_app, así que las tablas
 * de empresa devuelven cero filas: no hay forma de leer datos de negocio desde
 * acá.
 */
export async function comoPlataforma<T>(trabajo: (tx: Transaccion) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`set local role erp_app`)
    return trabajo(tx)
  })
}
