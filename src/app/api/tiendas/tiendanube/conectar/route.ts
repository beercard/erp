import { cookies } from 'next/headers'

import { crearFlujo } from '@/modulos/tiendas/flujo'
import { tnConfigurado, urlAutorizacion } from '@/modulos/tiendas/tiendanube'

import { COOKIE_TN, quienConecta, volverConError } from '../../_lib/comun'

/** Lleva a Tienda Nube para instalar la aplicación del ERP en la tienda. */
export async function GET() {
  const s = await quienConecta()
  if (!s) return volverConError('No tenés permiso para conectar tiendas o el plan no incluye Tiendas online.')
  if (!tnConfigurado()) return volverConError('La conexión con Tienda Nube todavía no está habilitada en este servidor.')
  const state = crearFlujo({ tipo: 'tiendanube', empresaId: s.empresa.id, usuarioId: s.usuario.id })
  // Por si Tienda Nube no devuelve el state: queda también en una cookie de la sesión.
  ;(await cookies()).set(COOKIE_TN, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/tiendas/tiendanube',
    maxAge: 15 * 60,
  })
  return Response.redirect(urlAutorizacion(state), 303)
}
