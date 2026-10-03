'use server'

import { revalidatePath } from 'next/cache'

import { marcarAtendida } from '@/modulos/plataforma/consultas'
import { actualizarSuscripcion, registrarPago, resolverPedido } from '@/modulos/plataforma/suscripciones'

import { exigirAdmin } from './admin'

export type EstadoAdmin = { error?: string; ok?: string } | undefined

const valor = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

export async function guardarSuscripcionAccion(empresaId: string, _: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const sesion = await exigirAdmin()
  const r = await actualizarSuscripcion(sesion.usuario.id, empresaId, {
    plan: valor(formData, 'plan'),
    estado: valor(formData, 'estado'),
    ciclo: valor(formData, 'ciclo'),
    aplicaciones: formData.getAll('aplicaciones').map(String),
    usuariosAdicionales: valor(formData, 'usuariosAdicionales') || '0',
    pruebaHasta: valor(formData, 'pruebaHasta') || null,
    pagadoHasta: valor(formData, 'pagadoHasta') || null,
    precioAcordado: valor(formData, 'precioAcordado') || null,
    observaciones: valor(formData, 'observaciones') || null,
  })
  if (!r.ok) return { error: r.error }
  revalidatePath('/plataforma')
  return { ok: 'Suscripción guardada.' }
}

export async function registrarPagoAccion(empresaId: string, _: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const sesion = await exigirAdmin()
  const importe = valor(formData, 'importe')
  if (!importe) return { error: 'Escribí el importe cobrado.' }
  const r = await registrarPago(sesion.usuario.id, empresaId, {
    importe,
    medio: valor(formData, 'medio') || 'transferencia',
    referencia: valor(formData, 'referencia'),
  })
  if (!r.ok) return { error: r.error }
  revalidatePath('/plataforma')
  return { ok: 'Pago registrado: la suscripción quedó activa.' }
}

export async function resolverPedidoAccion(pedidoId: string, aceptar: boolean) {
  const sesion = await exigirAdmin()
  await resolverPedido(sesion.usuario.id, pedidoId, aceptar)
  revalidatePath('/plataforma')
}

export async function atenderConsultaAccion(id: string) {
  await exigirAdmin()
  await marcarAtendida(id)
  revalidatePath('/plataforma')
}
