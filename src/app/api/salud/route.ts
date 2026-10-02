import { sql } from 'drizzle-orm'

import { comoPlataforma } from '@/db/empresa'

export const dynamic = 'force-dynamic'

/**
 * Para el monitor del hosting: 200 si el servidor responde y llega a la
 * base; 503 si no. No muestra datos ni detalles del error.
 */
export async function GET() {
  try {
    await comoPlataforma((tx) => tx.execute(sql`select 1`))
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
