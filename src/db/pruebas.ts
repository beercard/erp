import { randomBytes } from 'node:crypto'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import postgres from 'postgres'

import { conectarPostgres, usarBase, type BaseDeDatos } from './conexion'
import { migrar } from './migrar'
import * as schema from './schema'

/**
 * Base nueva con todas las migraciones aplicadas, y conectada como la base de
 * la aplicación (db()). Cada archivo de pruebas crea la suya.
 *
 * Por defecto es PGlite en memoria. Con PRUEBAS_POSTGRES (la URL de un
 * Postgres real, con un usuario que pueda crear bases) cada archivo crea su
 * propia base ahí: así se prueba lo mismo que corre en producción.
 */
export async function baseDePrueba(): Promise<BaseDeDatos> {
  const url = process.env.PRUEBAS_POSTGRES
  if (url) {
    const nombre = `erp_prueba_${randomBytes(6).toString('hex')}`
    const admin = postgres(url, { max: 1, onnotice: () => {} })
    await admin.unsafe(`create database ${nombre}`)
    await admin.end()
    const destino = new URL(url)
    destino.pathname = `/${nombre}`
    const base = conectarPostgres(destino.toString(), 4)
    await migrar(base, 'drizzle', 'postgres')
    usarBase(base)
    return base
  }
  const base = drizzle(new PGlite(), { schema }) as unknown as BaseDeDatos
  await migrar(base)
  usarBase(base)
  return base
}
