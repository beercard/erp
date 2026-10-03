import { and, eq, max } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { arcaConfiguracion, arcaTickets, comprobantes } from '../../db/schema'
import { hoyArgentina, sumarDias } from '../../lib/fechas'
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
export async function credenciales(tx: Transaccion, cuit: string, transporte: Transporte, servicio = 'wsfe') {
  const [config] = await tx.select().from(arcaConfiguracion)
  if (!config?.certificado || !config.claveCifrada) {
    throw new SinConfiguracionArca('Falta cargar el certificado de ARCA en Configuración → ARCA.')
  }
  const ambiente = config.ambiente as ClienteArca['ambiente']
  const [guardado] = await tx
    .select()
    .from(arcaTickets)
    .where(and(eq(arcaTickets.ambiente, ambiente), eq(arcaTickets.servicio, servicio)))
  if (guardado && guardado.vence.getTime() - Date.now() > MARGEN_MS) {
    return { ambiente, c: { token: guardado.token, firma: guardado.firma, cuit } }
  }
  let ticket
  try {
    ticket = await pedirTicket({
      transporte,
      ambiente,
      servicio,
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

    .values({ ambiente, servicio, token: ticket.token, firma: ticket.firma, vence: ticket.vence })
    .onConflictDoUpdate({
      target: [arcaTickets.empresaId, arcaTickets.ambiente, arcaTickets.servicio],
      set: { token: ticket.token, firma: ticket.firma, vence: ticket.vence },
    })
  return { ambiente, c: { token: ticket.token, firma: ticket.firma, cuit } }
}

/**
 * ARCA simulado, solo fuera de producción (ARCA_SIMULADO=1): autoriza todo con
 * un CAE inventado. Sirve para la demo y las pruebas en navegador sin
 * certificado. En producción se ignora.
 */
export const arcaSimulado = () => process.env.ARCA_SIMULADO === '1' && process.env.NODE_ENV !== 'production'

function clienteSimulado(tx: Transaccion): ClienteArca {
  return {
    ambiente: 'homologacion',
    ultimoAutorizado: async (puntoVenta, tipo) => {
      const [u] = await tx
        .select({ n: max(comprobantes.numero) })
        .from(comprobantes)
        .where(and(eq(comprobantes.puntoVenta, puntoVenta), eq(comprobantes.tipo, tipo), eq(comprobantes.estado, 'autorizado')))
      return u?.n ?? 0
    },
    solicitarCae: async () => ({
      resultado: 'A',
      cae: String(70_000_000_000_000 + Math.floor(Math.random() * 9_999_999_999_999)),
      caeVence: sumarDias(hoyArgentina(), 10),
      observaciones: [],
      errores: [],
    }),
    consultar: async () => null,
  }
}

/** Cliente de ARCA de la empresa de la transacción. */
export async function clienteArca(
  tx: Transaccion,
  cuit: string,
  transporte: Transporte = transporteHttp(),
): Promise<ClienteArca> {
  if (arcaSimulado()) return clienteSimulado(tx)
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
