/**
 * Aplica las migraciones de drizzle/ a la base configurada:
 * DATABASE_URL (Postgres) o, sin ella, PGlite en DATA_DIR (.data/pglite).
 *   npm run db:migrar
 */
import { db } from '../src/db/conexion'
import { migrar } from '../src/db/migrar'

await migrar(db())
console.log('Migraciones aplicadas.')
process.exit(0)
