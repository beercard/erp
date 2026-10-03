/**
 * Migraciones en producción, sin herramientas de desarrollo (solo
 * drizzle-orm y postgres, que ya son dependencias). Se corre en cada
 * despliegue, antes de levantar el servidor:
 *   DATABASE_URL=postgres://… npm run db:migrar:produccion
 *
 * El usuario de DATABASE_URL tiene que ser dueño de la base y poder crear
 * roles (CREATEROLE): la primera migración crea el rol erp_app, con el que
 * trabaja la aplicación bajo RLS.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL.')
  process.exit(1)
}
const cliente = postgres(url, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(cliente), { migrationsFolder: 'drizzle' })
  console.log('Migraciones aplicadas.')
} catch (e) {
  console.error('No se pudieron aplicar las migraciones:', e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await cliente.end()
}
