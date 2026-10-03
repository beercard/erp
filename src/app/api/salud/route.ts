import { sql } from 'drizzle-orm'

import { comoPlataforma } from '@/db/empresa'
import { estadoCron } from '@/modulos/plataforma/monitoreo'

export const dynamic = 'force-dynamic'

/**
 * Para el monitor del hosting: 200 si el servidor responde y llega a la
 * base; 503 si no. No muestra datos ni detalles del error.
 *
 * Con ?cron=1 también controla la tarea periódica: 503 si no corre hace más
 * de 45 minutos (o nunca corrió). Para un monitor externo aparte del del
 * hosting, así una tarea caída no reinicia el servidor.
 */
export async function GET(request: Request) {
  try {
    await comoPlataforma((tx) => tx.execute(sql`select 1`))
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
  if (new URL(request.url).searchParams.get('cron') !== '1') return Response.json({ ok: true })
  const cron = await estadoCron().catch(() => null)
  const ok = !!cron && !cron.atrasado
  return Response.json({ ok, cron: cron ? { ultimo: cron.ultimo, ok: cron.ok } : null }, { status: ok ? 200 : 503 })
}
