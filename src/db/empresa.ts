import { sql } from 'drizzle-orm'

import { db, type Transaccion } from './conexion'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Todo acceso a datos de una empresa pasa por acá. Abre una transacción,
 * fija la empresa (app.empresa_id) y baja al rol erp_app: desde ese momento
 * Postgres solo deja ver y escribir filas de esa empresa (RLS forzado, ver
 * drizzle/0001_seguridad.sql), aunque una consulta se olvide de filtrar.
 */
export async function conEmpresa<T>(empresaId: string, trabajo: (tx: Transaccion) => Promise<T>): Promise<T> {
  if (!UUID.test(empresaId)) throw new Error('Empresa inválida')
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.empresa_id', ${empresaId}, true)`)
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
