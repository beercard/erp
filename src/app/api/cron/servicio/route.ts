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
import { latido, registrarError } from '@/modulos/plataforma/monitoreo'
import { revisarPendientes } from '@/modulos/cobros/cobros'
import { recordatoriosDelDia } from '@/modulos/facturacion/cobranza'
import { resumenDiario } from '@/modulos/crm/extras'
import { enviarResumenDueno } from '@/modulos/informes/resumenDueno'
import { facturarPedidosPagados } from '@/modulos/tiendas/facturar'
import { sincronizarEmpresa } from '@/modulos/tiendas/sincronizar'
import { clienteArca } from '@/modulos/arca/cliente'
import { avanzarLotes, facturarRecurrentes } from '@/modulos/facturacion/automatica'
import { emitirFacturasSuscripcion } from '@/modulos/plataforma/facturasSuscripcion'

/**
 * Tarea programada del servicio técnico (llamarla cada 15 a 60 minutos desde
 * el programador del servidor, con Authorization: Bearer CRON_SECRET): pone al
 * día vencimientos, preventivos, avisos, alertas de SLA y recordatorios de
 * todas las empresas, avisa los vencimientos impositivos que se acercan o
 * se pasaron, asienta las operaciones nuevas (si la contabilidad está en
 * marcha), arma el resumen diario del CRM y el del dueño, manda los correos y los webhooks, sincroniza las tiendas online y
 * emite las facturas automáticas (recurrentes, lotes y las de las suscripciones de Vektra).
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
    facturasTiendas: 0,
    recordatoriosDeuda: 0,
    resumenesDueno: 0,
    facturasRecurrentes: 0,
    facturasLotes: 0,
    facturasSuscripcion: 0,
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
      // Resumen para el dueño (diario o semanal), desde las 7 (hora argentina).
      if (horaArgentina() >= 7) resultado.resumenesDueno += (await enviarResumenDueno(e.id)).enviados
      // Recordatorios de deuda: una vuelta por día, desde las 9 (hora argentina).
      if (horaArgentina() >= 9) resultado.recordatoriosDeuda += (await recordatoriosDelDia(e.id)).clientes
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
      // Pedidos pagados de tiendas con "facturar solo": remito, factura en ARCA y recibo.
      resultado.facturasTiendas += (await facturarPedidosPagados(e.id, (tx, cuit) => clienteArca(tx, cuit))).facturados
      // Facturas recurrentes (abonos) que tocan hoy, desde las 7, y lotes que quedaron a medias.
      if (horaArgentina() >= 7) {
        const r = await facturarRecurrentes(e.id, (tx, cuit) => clienteArca(tx, cuit))
        resultado.facturasRecurrentes += r.emitidas
        resultado.errores += r.errores
      }
      resultado.facturasLotes += (await avanzarLotes(e.id, (tx, cuit) => clienteArca(tx, cuit))).procesadas
    } catch (falla) {
      resultado.errores++
      await registrarError({
        mensaje: `Tarea periódica, empresa ${e.id}: ${falla instanceof Error ? falla.message : String(falla)}`,
        ruta: '/api/cron/servicio',
        tipo: 'cron',
      })
    }
  }
  // Vektra se factura sola los pagos de las suscripciones (si está VEKTRA_EMPRESA_ID).
  try {
    resultado.facturasSuscripcion = (await emitirFacturasSuscripcion((tx, cuit) => clienteArca(tx, cuit))).emitidas
  } catch (falla) {
    resultado.errores++
    await registrarError({
      mensaje: `Facturas de suscripciones: ${falla instanceof Error ? falla.message : String(falla)}`,
      ruta: '/api/cron/servicio',
      tipo: 'cron',
    })
  }
  // Latido: si deja de llegar, /api/salud?cron=1 lo avisa al monitor externo.
  await latido('cron', resultado, resultado.errores === 0).catch(() => undefined)
  return Response.json(resultado)
}
