import { migrate as migrarPglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migrarPostgres } from 'drizzle-orm/postgres-js/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import type { BaseDeDatos } from './conexion'

/**
 * Aplica las migraciones de drizzle/ como dueño de las tablas (sin bajar a
 * erp_app). Se usa desde scripts/migrar.ts y desde las pruebas.
 */
export async function migrar(base: BaseDeDatos, carpeta = 'drizzle') {
  if (process.env.DATABASE_URL) {
    await migrarPostgres(base as unknown as PostgresJsDatabase, { migrationsFolder: carpeta })
  } else {
    await migrarPglite(base as unknown as PgliteDatabase, { migrationsFolder: carpeta })
  }
}
