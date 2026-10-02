import { and, eq } from 'drizzle-orm'

import { equipos } from '@/db/schema'
import { hoyArgentina } from '@/lib/fechas'
import { registrarLectura } from '@/modulos/contratos/contratos'
import { emitir } from '@/modulos/integraciones/webhooks'

import { conApi, cuerpo, ErrorApi } from '../_lib/api'

/**
 * POST /api/v1/lecturas: contadores de los equipos (por ejemplo, desde MPS
 * Monitor u otro sistema de lecturas). Cuerpo: { lecturas: [{ serie, contador,
 * fecha?, creditos? }] } (o una sola lectura suelta). Devuelve cuántas se
 * cargaron y el problema de cada una que no.
 */
export async function POST(request: Request) {
  return conApi(request, { escribe: true, funciones: ['contratos'] }, async (tx, acceso) => {
    const c = await cuerpo(request)
    const lista = (Array.isArray(c.lecturas) ? c.lecturas : [c]) as Record<string, unknown>[]
    if (!lista.length || lista.length > 1000) throw new ErrorApi(422, 'Mandá entre 1 y 1000 lecturas.')
    let cargadas = 0
    const errores: { serie: string; error: string }[] = []
    for (const l of lista) {
      const serie = String(l.serie ?? '')
        .trim()
        .toUpperCase()
      const [e] = await tx
        .select({ id: equipos.id })
        .from(equipos)
        .where(and(eq(equipos.serie, serie), eq(equipos.estado, 'instalado')))
      if (!e) {
        errores.push({ serie, error: 'No hay un equipo instalado con esa serie.' })
        continue
      }
      const fecha = String(l.fecha ?? hoyArgentina())
      const r = await registrarLectura(
        tx,
        acceso.claveId,
        { equipoId: e.id, fecha, contador: l.contador, creditos: l.creditos ?? 0 },
        'api',
      )
      if (!r.ok) {
        errores.push({ serie, error: r.error })
        continue
      }
      await emitir(tx, 'lectura.registrada', { equipoId: e.id, serie, fecha, contador: Number(l.contador), origen: 'api' })
      cargadas++
    }
    return Response.json({ cargadas, errores })
  })
}
