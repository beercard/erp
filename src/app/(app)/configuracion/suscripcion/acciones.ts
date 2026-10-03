'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { crearDebito, mpConfigurado } from '@/modulos/plataforma/mercadopago'
import { historial, pedirCambio, suscripcionDe } from '@/modulos/plataforma/suscripciones'

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

/**
 * Débito automático con Mercado Pago: por el plan pedido (si hay un cambio
 * esperando el pago) o por el actual. Lleva a Mercado Pago a autorizarlo.
 */
export async function pagarConMercadoPagoAccion(): Promise<EstadoSuscripcion> {
  const sesion = await requerirEmpresa()
  if (!tienePermiso(sesion.permisos, 'empresa.suscripcion')) {
    return { error: 'Solo quien administra la empresa puede pagar la suscripción.' }
  }
  if (!mpConfigurado()) return { error: 'El pago con Mercado Pago todavía no está habilitado.' }
  const s = await suscripcionDe(sesion.empresa.id)
  const pedido = (await historial(sesion.empresa.id)).find((e) => e.tipo === 'pedido' && e.estado === 'pendiente')
  const d = pedido?.detalle as { plan: string; ciclo: string; aplicaciones: string[]; usuariosAdicionales: number } | undefined
  const objetivo = d
    ? { ...d, precioAcordado: d.plan === s.plan ? s.precioAcordado : null }
    : {
        plan: s.plan,
        ciclo: s.ciclo,
        aplicaciones: s.aplicaciones,
        usuariosAdicionales: s.usuariosAdicionales,
        precioAcordado: s.precioAcordado,
      }
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  let url: string
  try {
    url = (
      await crearDebito(fetch, {
        empresaId: sesion.empresa.id,
        email: sesion.usuario.email,
        suscripcion: objetivo,
        vuelta: `${base}/configuracion/suscripcion?mp=1`,
      })
    ).url
  } catch (e) {
    console.error('[mercadopago] crear débito', e instanceof Error ? e.message : e)
    return { error: 'No se pudo iniciar el pago con Mercado Pago. Probá de nuevo en un momento.' }
  }
  redirect(url)
}
