import { timingSafeEqual } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { comoPlataforma, conEmpresa } from '@/db/empresa'
import { empresas } from '@/db/schema'
import { enviarPendientes } from '@/modulos/comunicaciones/correo'
import { entregarPendientes } from '@/modulos/integraciones/webhooks'
import { contabilizar } from '@/modulos/contabilidad/automaticos'
import { liquidarPendientes } from '@/modulos/contabilidad/cierre'
import { avisarVencimientos } from '@/modulos/impuestos/vencimientos'
import { ponerAlDia } from '@/modulos/servicio/avisos'

/**
 * Tarea programada del servicio técnico (llamarla cada 15 a 60 minutos desde
 * el programador del servidor, con Authorization: Bearer CRON_SECRET): pone al
 * día vencimientos, preventivos, avisos, alertas de SLA y recordatorios de
 * todas las empresas, avisa los vencimientos impositivos que se acercan o
 * se pasaron, asienta las operaciones nuevas (si la contabilidad está en
 * marcha) y manda los correos y los webhooks. Sin CRON_SECRET no hace nada.
 */
export async function POST(request: Request) {
  const secreto = process.env.CRON_SECRET
  const recibido = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!secreto || recibido.length !== secreto.length || !timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto))) {
    return new Response('No autorizado.', { status: 401 })
  }
  const activas = await comoPlataforma((tx) => tx.select({ id: empresas.id }).from(empresas).where(eq(empresas.activa, true)))
  const resultado = {
    empresas: activas.length,
    vencidas: 0,
    preventivos: 0,
    avisos: 0,
    vencimientosImpuestos: 0,
    asientos: 0,
    enviados: 0,
    webhooks: 0,
    errores: 0,
  }
  for (const e of activas) {
    try {
      const r = await conEmpresa(e.id, (tx) => ponerAlDia(tx))
      resultado.vencidas += r.vencidas
      resultado.preventivos += r.preventivos
      resultado.avisos += r.avisos
      resultado.vencimientosImpuestos += (await conEmpresa(e.id, (tx) => avisarVencimientos(tx, e.id))).avisos
      resultado.asientos += await conEmpresa(e.id, async (tx) => {
        const c = await contabilizar(tx, null)
        return c.generados + (await liquidarPendientes(tx, null)).liquidados
      })
      resultado.enviados += (await enviarPendientes(e.id, 100)).enviados
      resultado.webhooks += (await entregarPendientes(e.id, 200)).entregados
    } catch {
      resultado.errores++
    }
  }
  return Response.json(resultado)
}
