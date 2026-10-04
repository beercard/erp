import { MESES_COBRADOS_EN_ANUAL, precioDeLista, type DatosSuscripcion } from '../../lib/planes'
import { pedirJson } from '../tiendas/http'
import type { Fetch } from '../tiendas/tipos'

/**
 * Operaciones sobre el débito automático de Mercado Pago (preapproval) que no
 * dependen del registro de pagos: el importe, cambiarlo y cancelarlo. Aparte
 * de mercadopago.ts para que suscripciones.ts y baja.ts los usen sin
 * importarse en círculo.
 */

const API = 'https://api.mercadopago.com'
const IVA = 1.21

export const cabecerasMp = () => ({
  authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  'content-type': 'application/json',
  accept: 'application/json',
})

/** Lo que se debita cada vez, con IVA: un mes, o en el anual diez meses por año. */
export function importeDebito(
  s: Pick<DatosSuscripcion, 'plan' | 'aplicaciones' | 'usuariosAdicionales'> & { ciclo: string; precioAcordado: string | null },
) {
  const mensual = s.precioAcordado ? Number(s.precioAcordado) : precioDeLista(s)
  const neto = s.ciclo === 'anual' ? mensual * MESES_COBRADOS_EN_ANUAL : mensual
  return Math.round(neto * IVA * 100) / 100
}

/** Cancela un débito: Mercado Pago no vuelve a cobrarlo. */
export async function cancelarDebito(f: Fetch, id: string) {
  await pedirJson(f, `${API}/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: cabecerasMp(),
    body: JSON.stringify({ status: 'cancelled' }),
  })
}

/** Cambia el importe de los próximos cobros de un débito autorizado (la frecuencia no se puede cambiar). */
export async function cambiarImporteDebito(f: Fetch, id: string, importe: number) {
  await pedirJson(f, `${API}/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: cabecerasMp(),
    body: JSON.stringify({ auto_recurring: { transaction_amount: importe, currency_id: 'ARS' } }),
  })
}
