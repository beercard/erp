/**
 * Al arrancar el servidor en desarrollo con PGlite, aplica las migraciones
 * pendientes desde el mismo proceso. PGlite no admite dos procesos sobre los
 * mismos archivos: correr `npm run db:migrar` con el servidor levantado puede
 * dañar la base local. En producción (DATABASE_URL) las migraciones se
 * aplican aparte, en el despliegue.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.DATABASE_URL) return
  const { db } = await import('./db/conexion')
  const { migrar } = await import('./db/migrar')
  await migrar(db())
}
