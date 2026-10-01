import { and, eq } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { arcaConfiguracion, arcaTickets } from '../../db/schema'
import { descifrar } from './certificado'
import { ErrorArca, transporteHttp, type Transporte } from './soap'
import { pedirTicket } from './wsaa'
import { wsfe, type ComprobanteConsultado, type RespuestaCae, type SolicitudCae } from './wsfe'

/**
 * Lo que la facturación necesita de ARCA. La implementación real va contra
 * los servicios web; las pruebas usan una falsa con la misma forma.
 */
export type ClienteArca = {
  ambiente: 'homologacion' | 'produccion'
  ultimoAutorizado(puntoVenta: number, tipo: number): Promise<number>
  solicitarCae(s: SolicitudCae): Promise<RespuestaCae>
  consultar(puntoVenta: number, tipo: number, numero: number): Promise<ComprobanteConsultado | null>
}

export class SinConfiguracionArca extends Error {}

const MARGEN_MS = 5 * 60_000

/** Ticket vigente de la empresa, o uno nuevo si no hay. */
async function credenciales(tx: Transaccion, cuit: string, transporte: Transporte) {
  const [config] = await tx.select().from(arcaConfiguracion)
  if (!config?.certificado || !config.claveCifrada) {
    throw new SinConfiguracionArca('Falta cargar el certificado de ARCA en Configuración → ARCA.')
  }
  const ambiente = config.ambiente as ClienteArca['ambiente']
  const [guardado] = await tx
    .select()
    .from(arcaTickets)
    .where(and(eq(arcaTickets.ambiente, ambiente), eq(arcaTickets.servicio, 'wsfe')))
  if (guardado && guardado.vence.getTime() - Date.now() > MARGEN_MS) {
    return { ambiente, c: { token: guardado.token, firma: guardado.firma, cuit } }
  }
  let ticket
  try {
    ticket = await pedirTicket({
      transporte,
      ambiente,
      servicio: 'wsfe',
      certificado: config.certificado,
      clave: descifrar(config.claveCifrada),
    })
  } catch (e) {
    if (e instanceof ErrorArca && /alreadyAuthenticated|ya posee un TA/i.test(`${e.codigo} ${e.message}`)) {
      throw new ErrorArca(
        'ARCA dice que ya hay un ticket vigente que este sistema no tiene (se pidió desde otro lado con el mismo certificado). Hay que esperar a que venza, hasta 12 horas.',
        e.codigo,
      )
    }
    throw e
  }
  await tx
    .insert(arcaTickets)
    .values({ ambiente, servicio: 'wsfe', token: ticket.token, firma: ticket.firma, vence: ticket.vence })
    .onConflictDoUpdate({
      target: [arcaTickets.empresaId, arcaTickets.ambiente, arcaTickets.servicio],
      set: { token: ticket.token, firma: ticket.firma, vence: ticket.vence },
    })
  return { ambiente, c: { token: ticket.token, firma: ticket.firma, cuit } }
}

/** Cliente de ARCA de la empresa de la transacción. */
export async function clienteArca(
  tx: Transaccion,
  cuit: string,
  transporte: Transporte = transporteHttp(),
): Promise<ClienteArca> {
  const { ambiente, c } = await credenciales(tx, cuit, transporte)
  const ws = wsfe(transporte, ambiente)
  return {
    ambiente,
    ultimoAutorizado: (pv, tipo) => ws.ultimoAutorizado(c, pv, tipo),
    solicitarCae: (s) => ws.solicitarCae(c, s),
    consultar: (pv, tipo, n) => ws.consultar(c, pv, tipo, n),
  }
}

/** Prueba de conexión: estado de los servidores de ARCA (no necesita ticket). */
export async function probarServidores(ambiente: ClienteArca['ambiente'], transporte: Transporte = transporteHttp(10_000)) {
  return wsfe(transporte, ambiente).dummy()
}
