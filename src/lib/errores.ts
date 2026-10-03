/**
 * Mensaje de Postgres detrás de un error de una consulta. Drizzle lo envuelve
 * (cause) con PGlite; con postgres-js a veces llega el PostgresError tal cual.
 */
export function mensajeDeBase(e: unknown): string {
  const error = e as { message?: string; cause?: { message?: string } } | null
  return error?.cause?.message ?? error?.message ?? ''
}
