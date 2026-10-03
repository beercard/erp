import { crearFlujo } from '@/modulos/tiendas/flujo'
import { mlConfigurado, nuevoVerificador, urlAutorizacion } from '@/modulos/tiendas/mercadolibre'

import { base, quienConecta, volverConError } from '../../_lib/comun'

/** Lleva a Mercado Libre para que el vendedor autorice al ERP. */
export async function GET() {
  const s = await quienConecta()
  if (!s) return volverConError('No tenés permiso para conectar tiendas o el plan no incluye Tiendas online.')
  if (!mlConfigurado()) return volverConError('La conexión con Mercado Libre todavía no está habilitada en este servidor.')
  const verificador = nuevoVerificador()
  const state = crearFlujo({ tipo: 'mercadolibre', empresaId: s.empresa.id, usuarioId: s.usuario.id, verificador })
  return Response.redirect(urlAutorizacion(state, verificador, `${base()}/api/tiendas/mercadolibre/vuelta`), 303)
}
