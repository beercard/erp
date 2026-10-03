'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { abrirSoporte, cerrarSoporte } from '@/lib/auth/sesiones'
import { datosDelPedido, tokenDeSesion } from '@/lib/auth/servidor'
import {
  agregarNota,
  archivarError,
  cambiarActivoUsuario,
  cambiarBajaEmpresa,
  cambiarSuspension,
  cerrarSesionesDe,
  extenderPrueba,
  registrarAccion,
  type Admin,
} from '@/modulos/plataforma/consola'
import { cambiarCodigo } from '@/modulos/plataforma/codigos'
import { marcarAtendida } from '@/modulos/plataforma/consultas'
import { actualizarSuscripcion, registrarPago, resolverPedido } from '@/modulos/plataforma/suscripciones'

import { exigirAdmin } from './admin'

export type EstadoAdmin = { error?: string; ok?: string } | undefined

const valor = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/** Quien administra, con la IP para la auditoría de la plataforma. */
async function quienAdministra(): Promise<Admin> {
  const sesion = await exigirAdmin()
  return { id: sesion.usuario.id, ip: (await datosDelPedido()).ip }
}

/** Toda la consola depende de los mismos datos: se revalida entera. */
const revalidar = () => revalidatePath('/plataforma', 'layout')

const estado = (r: { ok: true } | { ok: false; error: string }, ok: string): EstadoAdmin => {
  if (!r.ok) return { error: r.error }
  revalidar()
  return { ok }
}

// ---------------------------------------------------------------- Suscripción

export async function guardarSuscripcionAccion(empresaId: string, _: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  const entrada = {
    plan: valor(formData, 'plan'),
    estado: valor(formData, 'estado'),
    ciclo: valor(formData, 'ciclo'),
    aplicaciones: formData.getAll('aplicaciones').map(String),
    usuariosAdicionales: valor(formData, 'usuariosAdicionales') || '0',
    pruebaHasta: valor(formData, 'pruebaHasta') || null,
    pagadoHasta: valor(formData, 'pagadoHasta') || null,
    precioAcordado: valor(formData, 'precioAcordado') || null,
    observaciones: valor(formData, 'observaciones') || null,
  }
  const r = await actualizarSuscripcion(admin.id, empresaId, entrada)
  if (r.ok) await registrarAccion(admin, 'suscripcion.cambio', { empresaId, detalle: entrada })
  return estado(r, 'Suscripción guardada.')
}

export async function registrarPagoAccion(empresaId: string, _: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  const importe = valor(formData, 'importe')
  if (!importe) return { error: 'Escribí el importe cobrado.' }
  const pago = { importe, medio: valor(formData, 'medio') || 'transferencia', referencia: valor(formData, 'referencia') }
  const r = await registrarPago(admin.id, empresaId, pago)
  if (r.ok) await registrarAccion(admin, 'suscripcion.pago', { empresaId, detalle: pago })
  return estado(r, 'Pago registrado: la suscripción quedó activa.')
}

export async function resolverPedidoAccion(pedidoId: string, aceptar: boolean) {
  const admin = await quienAdministra()
  const r = await resolverPedido(admin.id, pedidoId, aceptar)
  if (r.ok)
    await registrarAccion(admin, 'suscripcion.pedido', { empresaId: r.empresaId, detalle: { pedidoId, aceptado: aceptar } })
  revalidar()
}

export async function suspenderAccion(empresaId: string, suspender: boolean): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  return estado(
    await cambiarSuspension(admin, empresaId, suspender),
    suspender ? 'Suscripción suspendida: la empresa quedó en solo lectura.' : 'Suscripción reactivada.',
  )
}

export async function extenderPruebaAccion(empresaId: string, _: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  return estado(await extenderPrueba(admin, empresaId, valor(formData, 'dias')), 'Prueba extendida.')
}

// ---------------------------------------------------------------- Empresa

export async function agregarNotaAccion(empresaId: string, _: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  return estado(await agregarNota(admin, empresaId, valor(formData, 'texto')), 'Nota guardada.')
}

export async function bajaEmpresaAccion(empresaId: string, activa: boolean): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  return estado(
    await cambiarBajaEmpresa(admin, empresaId, activa),
    activa ? 'La empresa volvió a estar habilitada.' : 'Empresa dada de baja: nadie puede entrar. Los datos quedan.',
  )
}

/** Entra a la empresa en modo soporte (solo lectura, una hora). */
export async function entrarSoporteAccion(empresaId: string) {
  const admin = await quienAdministra()
  const token = await tokenDeSesion()
  if (!token) redirect('/ingresar')
  const r = await abrirSoporte(token, empresaId, { ip: admin.ip })
  if (!r.ok) redirect(`/plataforma/empresas/${empresaId}?error=${encodeURIComponent(r.error)}`)
  await registrarAccion(admin, 'empresa.soporte', { empresaId, detalle: { hasta: r.hasta.toISOString() } })
  redirect('/')
}

/** Sale del modo soporte y vuelve a la ficha de la empresa en la consola. */
export async function salirSoporteAccion(empresaId: string) {
  await exigirAdmin()
  const token = await tokenDeSesion()
  if (token) await cerrarSoporte(token)
  redirect(`/plataforma/empresas/${empresaId}`)
}

// ---------------------------------------------------------------- Usuarios

export async function activarUsuarioAccion(usuarioId: string, activo: boolean): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  return estado(
    await cambiarActivoUsuario(admin, usuarioId, activo),
    activo ? 'Usuario activado.' : 'Usuario desactivado: se cerraron sus sesiones.',
  )
}

export async function cerrarSesionesAccion(usuarioId: string): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  const r = await cerrarSesionesDe(admin, usuarioId)
  return estado(r, r.ok ? `Sesiones cerradas: ${r.cerradas}.` : '')
}

// ---------------------------------------------------------------- Operación y consultas

export async function archivarErrorAccion(huella: string) {
  const admin = await quienAdministra()
  await archivarError(admin, huella)
  revalidar()
}

export async function atenderConsultaAccion(id: string) {
  const admin = await quienAdministra()
  await marcarAtendida(id)
  await registrarAccion(admin, 'consulta.atendida', { detalle: { consultaId: id } })
  revalidar()
}

export async function cambiarCodigoAccion(empresaId: string, _: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const admin = await quienAdministra()
  const r = await cambiarCodigo(empresaId, valor(formData, 'codigo'))
  if (!r.ok) return { error: r.error }
  await registrarAccion(admin, 'empresa.codigo', { empresaId, detalle: { codigo: r.codigo } })
  revalidar()
  return { ok: `Código guardado: ${r.codigo}. La empresa entra ahora por su nueva dirección.` }
}
