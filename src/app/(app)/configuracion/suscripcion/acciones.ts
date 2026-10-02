'use server'

import { revalidatePath } from 'next/cache'

import { requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { pedirCambio } from '@/modulos/plataforma/suscripciones'

export type EstadoSuscripcion = { error?: string; ok?: string } | undefined

export async function cambiarSuscripcionAccion(_: EstadoSuscripcion, formData: FormData): Promise<EstadoSuscripcion> {
  const sesion = await requerirEmpresa()
  if (!tienePermiso(sesion.permisos, 'empresa.suscripcion')) {
    return { error: 'Solo quien administra la empresa puede cambiar la suscripción.' }
  }
  const r = await pedirCambio(sesion.empresa.id, sesion.usuario.id, {
    plan: formData.get('plan'),
    ciclo: formData.get('ciclo') || 'mensual',
    aplicaciones: formData.getAll('aplicaciones').map(String),
    usuariosAdicionales: formData.get('usuariosAdicionales') || 0,
  })
  if (!r.ok) return { error: r.error }
  revalidatePath('/', 'layout')
  return {
    ok: r.aplicado
      ? 'Listo: la suscripción ya tiene los cambios.'
      : 'Recibimos el pedido. Te mandamos el enlace de pago y, apenas se acredita, el cambio queda aplicado.',
  }
}
