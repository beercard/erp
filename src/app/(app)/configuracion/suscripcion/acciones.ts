'use server'

import { revalidatePath } from 'next/cache'

import { codigoDelPedido, requerirEmpresa } from '@/lib/auth/servidor'
import { urlDeEmpresa } from '@/lib/subdominio'
import { tienePermiso } from '@/lib/permisos'
import { crearDebito, mpConfigurado } from '@/modulos/plataforma/mercadopago'
import { anularBaja, pedirBaja } from '@/modulos/plataforma/baja'
import { historial, pedirCambio, suscripcionDe } from '@/modulos/plataforma/suscripciones'

/** irA: dirección externa a la que va el navegador (Mercado Pago). */
export type EstadoSuscripcion = { error?: string; ok?: string; irA?: string } | undefined

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
      ? 'Listo: la suscripción ya tiene los cambios. Si tenés débito automático, los próximos cobros ya son por el importe nuevo.'
      : 'Listo. Tocá "Pagar con Mercado Pago" para autorizar el débito: el plan se activa apenas se acredita el primer pago.',
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
  // La vuelta, a la dirección de la empresa (su subdominio, si los hay): ahí está su sesión.
  const codigo = await codigoDelPedido()
  const vuelta = codigo
    ? urlDeEmpresa(codigo, '/configuracion/suscripcion?mp=1')
    : `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/configuracion/suscripcion?mp=1`
  let url: string
  try {
    url = (
      await crearDebito(fetch, {
        empresaId: sesion.empresa.id,
        email: sesion.usuario.email,
        suscripcion: objetivo,
        vuelta,
      })
    ).url
  } catch (e) {
    console.error('[mercadopago] crear débito', e instanceof Error ? e.message : e)
    return { error: 'No se pudo iniciar el pago con Mercado Pago. Probá de nuevo en un momento.' }
  }
  // Va el navegador (otro sitio): una redirección desde la acción no siempre la sigue.
  return { irA: url }
}

/** Botón de baja: corta el débito automático y deja el sistema en consulta al terminar el período pagado. */
export async function pedirBajaAccion(_: EstadoSuscripcion, formData: FormData): Promise<EstadoSuscripcion> {
  const sesion = await requerirEmpresa()
  if (!tienePermiso(sesion.permisos, 'empresa.suscripcion')) {
    return { error: 'Solo quien administra la empresa puede dar de baja la suscripción.' }
  }
  if (formData.get('confirmo') !== 'si') return { error: 'Marcá que entendés lo que pasa con la baja.' }
  const r = await pedirBaja(sesion.empresa.id, sesion.usuario, String(formData.get('motivo') ?? ''))
  if (!r.ok) return { error: r.error }
  revalidatePath('/', 'layout')
  return { ok: `Baja pedida. Te mandamos la confirmación por email; rige desde el ${r.desde.split('-').reverse().join('/')}.` }
}

export async function anularBajaAccion(): Promise<EstadoSuscripcion> {
  const sesion = await requerirEmpresa()
  if (!tienePermiso(sesion.permisos, 'empresa.suscripcion')) return { error: 'Solo quien administra la empresa puede hacerlo.' }
  const r = await anularBaja(sesion.empresa.id, sesion.usuario.id)
  if (!r.ok) return { error: r.error }
  revalidatePath('/', 'layout')
  return { ok: 'Listo: la baja quedó sin efecto. Si pagabas con débito automático, volvé a activarlo arriba.' }
}
