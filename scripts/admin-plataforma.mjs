/**
 * Da (o quita) el permiso de administrar la plataforma a un usuario que ya
 * existe (se registra primero en /registro). En producción no hay otra forma:
 * la semilla de la demo no se usa ahí.
 *   DATABASE_URL=postgres://… npm run plataforma:admin -- persona@empresa.com
 *   DATABASE_URL=postgres://… npm run plataforma:admin -- persona@empresa.com --quitar
 */
import postgres from 'postgres'

const [email, opcion] = process.argv.slice(2)
if (!process.env.DATABASE_URL || !email) {
  console.error('Uso: DATABASE_URL=… npm run plataforma:admin -- email [--quitar]')
  process.exit(1)
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  const filas = await sql`
    update usuarios set admin_plataforma = ${opcion !== '--quitar'}
    where lower(email) = lower(${email}) returning email`
  console.log(
    filas.length ? `Listo: ${filas[0].email}.` : `No hay ningún usuario con el email ${email}: que se registre primero.`,
  )
  if (!filas.length) process.exitCode = 1
} finally {
  await sql.end()
}
