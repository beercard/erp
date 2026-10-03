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
import { limpiarFrenos } from '@/lib/frenos'
import { revisarPendientes } from '@/modulos/cobros/cobros'
import { resumenDiario } from '@/modulos/crm/extras'
import { sincronizarEmpresa } from '@/modulos/tiendas/sincronizar'

/**
 * Tarea programada del servicio técnico (llamarla cada 15 a 60 minutos desde
 * el programador del servidor, con Authorization: Bearer CRON_SECRET): pone al
 * día vencimientos, preventivos, avisos, alertas de SLA y recordatorios de
 * todas las empresas, avisa los vencimientos impositivos que se acercan o
 * se pasaron, asienta las operaciones nuevas (si la contabilidad está en
 * marcha), arma el resumen diario del CRM, manda los correos y los webhooks, y sincroniza las tiendas online.
 * Sin CRON_SECRET no hace nada.
 */
const horaArgentina = () =>
  Number(
    new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(
      new Date(),
    ),
  )

export async function POST(request: Request) {
  const secreto = process.env.CRON_SECRET
  const recibido = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const a = Buffer.from(recibido)
  const b = Buffer.from(secreto ?? '')
  if (!secreto || a.length !== b.length || !timingSafeEqual(a, b)) {
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
    pedidosTiendas: 0,
    resumenesCrm: 0,
    pagosOnline: 0,
    errores: 0,
  }
  await limpiarFrenos().catch(() => undefined)
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
      // CRM: resumen diario de actividades, desde las 8 de la mañana (hora argentina).
      if (horaArgentina() >= 8) resultado.resumenesCrm += (await conEmpresa(e.id, (tx) => resumenDiario(tx, e.id))).enviados
      // Links de pago: vence los viejos y confirma los que se pagaron sin aviso.
      resultado.pagosOnline += (await revisarPendientes(e.id)).aprobados
      resultado.enviados += (await enviarPendientes(e.id, 100)).enviados
      resultado.webhooks += (await entregarPendientes(e.id, 200)).entregados
      // Tiendas online: pedidos que no avisaron y stock y precios que cambiaron.
      // Con tope de tiempo: una tienda lenta no puede demorar al resto de las empresas.
      const tiendas = await Promise.race([
        sincronizarEmpresa(e.id),
        new Promise<{ importados: number; errores: number }>((ok) => setTimeout(() => ok({ importados: 0, errores: 1 }), 90_000)),
      ])
      resultado.pedidosTiendas += tiendas.importados
      resultado.errores += tiendas.errores
    } catch {
      resultado.errores++
    }
  }
  return Response.json(resultado)
}
