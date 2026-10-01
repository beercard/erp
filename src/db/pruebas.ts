import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { usarBase, type BaseDeDatos } from './conexion'
import { migrar } from './migrar'
import * as schema from './schema'

/**
 * Base nueva en memoria con todas las migraciones aplicadas, y conectada como
 * la base de la aplicación (db()). Cada archivo de pruebas crea la suya.
 */
export async function baseDePrueba(): Promise<BaseDeDatos> {
  const base = drizzle(new PGlite(), { schema }) as unknown as BaseDeDatos
  await migrar(base)
  usarBase(base)
  return base
}
