import { eq } from 'drizzle-orm'

import { comoPlataforma } from '../../db/empresa'
import { eventosSuscripcion, suscripciones } from '../../db/schema'
import { hoyArgentina, sumarDias } from '../../lib/fechas'
import { MARCA } from '../../lib/marca'
import { enviarDePlataforma } from '../comunicaciones/correo'
import { cancelarDebito } from './debito'

/**
 * Baja de la suscripción pedida por la propia empresa ("botón de baja"): se
 * corta en el acto el débito automático de Mercado Pago, el sistema sigue
 * funcionando hasta el final del período pagado y desde ahí queda en modo
 * consulta (se ve y se exporta todo). Antes de esa fecha se puede deshacer.
 */

type Fetch = typeof fetch
const dma = (f: string) => f.split('-').reverse().join('/')

export async function pedirBaja(
  empresaId: string,
  usuario: { id: string; email: string },
  motivo: string,
  hoy = hoyArgentina(),
  f: Fetch = fetch,
): Promise<{ ok: true; desde: string } | { ok: false; error: string }> {
  const [s] = await comoPlataforma((tx) => tx.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId)))
  if (!s) return { ok: false, error: 'La empresa no tiene suscripción.' }
  if (s.bajaDesde) return { ok: false, error: `La baja ya está pedida: rige desde el ${dma(s.bajaDesde)}.` }
  // Sigue funcionando hasta el último día pagado; en prueba o vencida, desde hoy.
  const desde = s.estado !== 'prueba' && s.pagadoHasta && s.pagadoHasta >= hoy ? sumarDias(s.pagadoHasta, 1) : hoy
  let mpEstado = s.mpEstado
  if (s.mpSuscripcion && s.mpEstado && s.mpEstado !== 'cancelled') {
    if (!process.env.MP_ACCESS_TOKEN) {
      return { ok: false, error: 'No se pudo cancelar el débito automático: escribinos desde Ayuda y lo hacemos a mano.' }
    }
    try {
      await cancelarDebito(f, s.mpSuscripcion)
      mpEstado = 'cancelled'
    } catch {
      return { ok: false, error: 'Mercado Pago no respondió al cancelar el débito automático. Probá de nuevo en unos minutos.' }
    }
  }
  const texto = `Baja pedida: rige desde el ${dma(desde)}.${motivo.trim() ? ` Motivo: ${motivo.trim().slice(0, 500)}` : ''}${
    mpEstado === 'cancelled' && s.mpEstado !== 'cancelled' ? ' Débito automático de Mercado Pago cancelado.' : ''
  }`
  await comoPlataforma(async (tx) => {
    await tx
      .update(suscripciones)
      .set({ bajaDesde: desde, mpEstado, actualizado: new Date() })
      .where(eq(suscripciones.empresaId, empresaId))
    await tx.insert(eventosSuscripcion).values({ empresaId, tipo: 'nota', detalle: { texto }, usuarioId: usuario.id })
  })
  await enviarDePlataforma(
    usuario.email,
    `Confirmación de baja de ${MARCA.producto}`,
    `Recibimos tu pedido de baja.\n\n` +
      `- El sistema funciona normalmente hasta el ${dma(sumarDias(desde, -1))}.\n` +
      `- Desde el ${dma(desde)} queda en modo consulta: vas a poder ver y exportar todos tus datos durante 12 meses.\n` +
      (mpEstado === 'cancelled' ? '- Cancelamos el débito automático de Mercado Pago: no se te va a cobrar más.\n' : '') +
      `\nSi cambiás de idea antes de esa fecha, deshacé la baja desde Configuración → Suscripción.\n\n${MARCA.producto}`,
  ).catch(() => false)
  return { ok: true, desde }
}

export async function anularBaja(empresaId: string, usuarioId: string, hoy = hoyArgentina()) {
  const [s] = await comoPlataforma((tx) => tx.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId)))
  if (!s?.bajaDesde) return { ok: false as const, error: 'No hay una baja pedida.' }
  if (hoy >= s.bajaDesde) return { ok: false as const, error: 'La baja ya rige: para volver, elegí un plan.' }
  await comoPlataforma(async (tx) => {
    await tx.update(suscripciones).set({ bajaDesde: null, actualizado: new Date() }).where(eq(suscripciones.empresaId, empresaId))
    await tx.insert(eventosSuscripcion).values({ empresaId, tipo: 'nota', detalle: { texto: 'Baja deshecha.' }, usuarioId })
  })
  return { ok: true as const }
}
