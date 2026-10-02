import 'server-only'

import { notFound } from 'next/navigation'

import { requerirSesion } from '@/lib/auth/servidor'

/**
 * El panel de la plataforma es solo para sus administradores. A cualquier
 * otro usuario le responde "no existe", sin revelar que el panel está.
 */
export async function exigirAdmin() {
  const sesion = await requerirSesion()
  if (!sesion.usuario.adminPlataforma) notFound()
  return sesion
}
