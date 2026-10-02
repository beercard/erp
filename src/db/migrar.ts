import { readFileSync } from 'node:fs'

import { sql } from 'drizzle-orm'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate as migrarPglite } from 'drizzle-orm/pglite/migrator'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate as migrarPostgres } from 'drizzle-orm/postgres-js/migrator'

import { mensajeDeBase } from '../lib/errores'
import { filas, type BaseDeDatos } from './conexion'

/**
 * Aplica las migraciones de drizzle/ como dueño de las tablas (sin bajar a
 * erp_app). Se usa desde scripts/migrar.ts y desde las pruebas.
 */
export async function migrar(
  base: BaseDeDatos,
  carpeta = 'drizzle',
  motor: 'postgres' | 'pglite' = process.env.DATABASE_URL ? 'postgres' : 'pglite',
) {
  if (motor === 'postgres') {
    await migrarPostgres(base as unknown as PostgresJsDatabase, { migrationsFolder: carpeta })
  } else {
    await migrarPglite(base as unknown as PgliteDatabase, { migrationsFolder: carpeta })
  }
}

/** Migraciones de drizzle/ que la base todavía no tiene (por su marca de tiempo). */
export async function migracionesPendientes(base: BaseDeDatos, carpeta = 'drizzle'): Promise<string[]> {
  const diario = JSON.parse(readFileSync(`${carpeta}/meta/_journal.json`, 'utf8')) as {
    entries: { tag: string; when: number }[]
  }
  let ultima = 0
  try {
    const r = await base.execute(sql`select max(created_at)::bigint as ultima from drizzle.__drizzle_migrations`)
    ultima = Number(filas<{ ultima: string | null }>(r)[0]?.ultima ?? 0)
  } catch (e) {
    // Sin la tabla de migraciones no se aplicó ninguna; cualquier otro error (sin conexión) sigue.
    if (!/does not exist|no existe/.test(mensajeDeBase(e))) throw e
  }
  return diario.entries.filter((e) => e.when > ultima).map((e) => e.tag)
}
