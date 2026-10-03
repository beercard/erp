import { createHash } from 'node:crypto'

import { desc, eq, sql } from 'drizzle-orm'

import { comoPlataforma } from '../../db/empresa'
import { erroresServidor, latidos, usuarios } from '../../db/schema'
import { enviarDePlataforma } from '../comunicaciones/correo'

/**
 * Monitoreo sin servicios externos:
 * - Errores del servidor agrupados por huella (mensaje sin números ni ids, y
 *   ruta), con un aviso por correo a quienes administran la plataforma como
 *   mucho cada 6 horas por error.
 * - Latidos: cada tarea periódica deja su último paso; /api/salud?cron=1
 *   contesta 503 si la tarea no corre hace más de 45 minutos, para un
 *   monitor externo (UptimeRobot, Uptime Kuma).
 */

const AVISO_CADA_MS = 6 * 3_600_000
/** La tarea corre cada 15 minutos: con 45 sin noticias, algo pasa. */
export const CRON_ATRASADO_MS = 45 * 60_000

/** Mensaje sin lo que cambia entre repeticiones (ids, números, fechas). */
export function normalizarMensaje(mensaje: string) {
  return mensaje
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300)
}

export const huellaError = (mensaje: string, ruta: string | null) =>
  createHash('sha1')
    .update(`${normalizarMensaje(mensaje)}|${ruta ?? ''}`)
    .digest('hex')
    .slice(0, 20)

type Error = { mensaje: string; ruta?: string | null; tipo?: string | null; digest?: string | null }

/** Registra un error (nunca falla: si la base no responde, queda solo en el registro). */
export async function registrarError(e: Error, ahora = new Date(), avisar = avisarError) {
  const ruta = e.ruta ?? null
  const huella = huellaError(e.mensaje, ruta)
  try {
    const [fila] = await comoPlataforma((tx) =>
      tx
        .insert(erroresServidor)
        .values({
          huella,
          mensaje: e.mensaje.slice(0, 2000),
          ruta,
          tipo: e.tipo ?? null,
          digest: e.digest ?? null,
          primero: ahora,
          ultimo: ahora,
        })
        .onConflictDoUpdate({
          target: erroresServidor.huella,
          set: { cantidad: sql`${erroresServidor.cantidad} + 1`, ultimo: ahora, digest: e.digest ?? null },
        })
        .returning(),
    )
    if (!fila.avisado || ahora.getTime() - fila.avisado.getTime() > AVISO_CADA_MS) {
      await comoPlataforma((tx) => tx.update(erroresServidor).set({ avisado: ahora }).where(eq(erroresServidor.huella, huella)))
      await avisar(fila)
    }
    return huella
  } catch (falla) {
    console.error('[monitoreo] no se pudo registrar el error', falla instanceof Error ? falla.message : falla)
    return null
  }
}

/** A quién avisar: AVISOS_ADMIN (separados por coma) o quienes administran la plataforma. */
async function destinatarios() {
  const env = (process.env.AVISOS_ADMIN ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  if (env.length) return env
  const admins = await comoPlataforma((tx) =>
    tx.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.adminPlataforma, true)),
  )
  return admins.map((a) => a.email)
}

async function avisarError(f: typeof erroresServidor.$inferSelect) {
  const texto = [
    `Error en el servidor${f.ruta ? ` (${f.ruta})` : ''}:`,
    '',
    f.mensaje,
    '',
    `Veces: ${f.cantidad} · primera: ${f.primero.toISOString()} · última: ${f.ultimo.toISOString()}${f.digest ? ` · digest ${f.digest}` : ''}`,
    'Los detalles completos están en el registro del servidor. No se vuelve a avisar este mismo error hasta dentro de 6 horas.',
  ].join('\n')
  for (const para of await destinatarios()) await enviarDePlataforma(para, `[Vektra] Error: ${f.mensaje.slice(0, 80)}`, texto)
}

/** Deja el último paso de una tarea. */
export async function latido(nombre: string, detalle: Record<string, unknown>, ok = true, ahora = new Date()) {
  await comoPlataforma((tx) =>
    tx
      .insert(latidos)
      .values({ nombre, ultimo: ahora, ok, detalle })
      .onConflictDoUpdate({ target: latidos.nombre, set: { ultimo: ahora, ok, detalle } }),
  )
}

/** Estado de la tarea periódica: null si nunca corrió. */
export async function estadoCron(ahora = new Date()) {
  const [l] = await comoPlataforma((tx) => tx.select().from(latidos).where(eq(latidos.nombre, 'cron')))
  if (!l) return null
  return { ...l, atrasado: ahora.getTime() - l.ultimo.getTime() > CRON_ATRASADO_MS }
}

export async function erroresRecientes(limite = 30) {
  return comoPlataforma((tx) => tx.select().from(erroresServidor).orderBy(desc(erroresServidor.ultimo)).limit(limite))
}
