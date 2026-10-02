/**
 * Solo Node (lo importa src/instrumentation.ts). Al arrancar el servidor:
 *
 * - En producción controla la configuración y que la base tenga todas las
 *   migraciones; si falta algo, no arranca y dice qué (las migraciones se
 *   aplican aparte, en el despliegue: npm run db:migrar:produccion).
 * - En desarrollo con PGlite aplica las migraciones pendientes desde el mismo
 *   proceso. PGlite no admite dos procesos sobre los mismos archivos: correr
 *   `npm run db:migrar` con el servidor levantado puede dañar la base local.
 */
export async function arrancar() {
  if (process.env.NODE_ENV === 'production') {
    // Si algo falta, se dice qué y se corta el proceso: un servidor arriba
    // que contesta error en cada página es peor (el hosting lo da por sano).
    const problema = await controlarProduccion()
    if (problema) {
      console.error(`\n[arranque] ${problema}\n`)
      process.exit(1)
    }
    return
  }
  if (process.env.DATABASE_URL) return
  const { db } = await import('./db/conexion')
  const { migrar } = await import('./db/migrar')
  await migrar(db())
}

async function controlarProduccion(): Promise<string | null> {
  const { problemasDeConfiguracion } = await import('./lib/arranque')
  const { faltan, avisos } = problemasDeConfiguracion()
  for (const a of avisos) console.warn(`[configuración] ${a}`)
  if (faltan.length) return `Falta configurar el servidor:\n- ${faltan.join('\n- ')}`
  const { mensajeDeBase } = await import('./lib/errores')
  try {
    const { migracionesPendientes } = await import('./db/migrar')
    const { db } = await import('./db/conexion')
    const pendientes = await migracionesPendientes(db())
    if (pendientes.length) {
      return `La base no está al día: faltan ${pendientes.length} migraciones (desde ${pendientes[0]}). Corré npm run db:migrar:produccion.`
    }
  } catch (e) {
    return `No se pudo conectar a la base (DATABASE_URL): ${mensajeDeBase(e) || String(e)}`
  }
  return null
}
