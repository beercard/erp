'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { comprobantes, terceros } from '@/db/schema'
import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { firmarEnlace } from '@/lib/enlaces'
import { tienePermiso } from '@/lib/permisos'
import { base as urlBase, crearPago, hayPasarelas, urlPago } from '@/modulos/cobros/cobros'
import { formatearNumero } from '@/modulos/comercial/formato'
import { enPesos, pendientes } from '@/modulos/facturacion/cuentas'
import { nombreComprobante } from '@/modulos/facturacion/tipos'
import { ErrorWhatsapp, probarNumero } from '@/modulos/whatsapp/api'
import {
  autorizar,
  cambiarConversacion,
  credencialesDe,
  desconectarCuenta,
  enviarAConversacion,
  enviarATelefono,
  guardarCuenta,
  quitarAutorizado,
} from '@/modulos/whatsapp/whatsapp'

export type EstadoWa = { error?: string; ok?: string } | undefined

async function intentar<T>(f: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const refrescar = () => revalidatePath('/whatsapp', 'layout')

export async function enviarAccion(conversacionId: string, _: EstadoWa, fd: FormData): Promise<EstadoWa> {
  const texto = String(fd.get('texto') ?? '')
  const quien = await intentar(() =>
    enLaEmpresa('whatsapp.atender', async (_tx, s) => ({ ok: true as const, empresaId: s.empresa.id, usuarioId: s.usuario.id })),
  )
  if (!quien.ok) return { error: quien.error }
  const r = await enviarAConversacion(quien.empresaId, conversacionId, texto, { tipo: 'usuario', usuarioId: quien.usuarioId })
  refrescar()
  return r.ok ? { ok: 'Enviado.' } : { error: r.error }
}

export async function atenderAccion(id: string, cambio: { atiende?: 'agente' | 'humano'; estado?: 'abierta' | 'cerrada' }) {
  await intentar(() => enLaEmpresa('whatsapp.atender', (tx, s) => cambiarConversacion(tx, s.usuario.id, id, cambio)))
  refrescar()
}

export async function vincularClienteAccion(id: string, fd: FormData) {
  const terceroId = String(fd.get('terceroId') ?? '') || null
  await intentar(() => enLaEmpresa('whatsapp.atender', (tx, s) => cambiarConversacion(tx, s.usuario.id, id, { terceroId })))
  refrescar()
}

/** Conexión del número: se prueba contra Meta antes de guardar (fuera de la transacción). */
export async function guardarCuentaAccion(_: EstadoWa, fd: FormData): Promise<EstadoWa> {
  const quien = await intentar(() =>
    enLaEmpresa('whatsapp.configurar', async (_tx, s) => ({ ok: true as const, empresaId: s.empresa.id })),
  )
  if (!quien.ok) return { error: quien.error }
  const numeroId = String(fd.get('numeroId') ?? '').trim()
  const tokenNuevo = String(fd.get('token') ?? '').trim()
  const actual = await credencialesDe(quien.empresaId).catch(() => null)
  const token = tokenNuevo || actual?.credenciales.token || ''
  let verificado: { numero?: string; nombre?: string } = {}
  if (numeroId && token) {
    try {
      const r = await probarNumero(fetch, { numeroId, token })
      verificado = { numero: r.display_phone_number, nombre: r.verified_name }
    } catch (e) {
      return {
        error: e instanceof ErrorWhatsapp ? `Meta no aceptó el número o el token: ${e.message}` : 'No se pudo conectar con Meta.',
      }
    }
  }
  const r = await intentar(() =>
    enLaEmpresa('whatsapp.configurar', (tx, s) =>
      guardarCuenta(
        tx,
        s.usuario.id,
        s.empresa.id,
        {
          numeroId,
          token: tokenNuevo,
          secretoApp: String(fd.get('secretoApp') ?? ''),
          plantilla: String(fd.get('plantilla') ?? ''),
          idioma: String(fd.get('idioma') ?? 'es_AR') || 'es_AR',
          agente: fd.has('agente'),
          registroFacturas: fd.has('registroFacturas'),
          instrucciones: String(fd.get('instrucciones') ?? ''),
          activa: fd.has('activa'),
        },
        verificado,
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar()
  return {
    ok: verificado.numero ? `Conectado: ${verificado.numero}${verificado.nombre ? ` (${verificado.nombre})` : ''}.` : 'Guardado.',
  }
}

export async function desconectarAccion() {
  await intentar(() => enLaEmpresa('whatsapp.configurar', (tx, s) => desconectarCuenta(tx, s.usuario.id)))
  refrescar()
}

export async function autorizarAccion(_: EstadoWa, fd: FormData): Promise<EstadoWa> {
  const r = await intentar(() =>
    enLaEmpresa('whatsapp.configurar', (tx, s) =>
      autorizar(tx, s.usuario.id, s.empresa.id, { usuarioId: fd.get('usuarioId'), telefono: fd.get('telefono') }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar()
  return { ok: 'Agregado.' }
}

export async function quitarAutorizadoAccion(id: string) {
  await intentar(() => enLaEmpresa('whatsapp.configurar', (tx) => quitarAutorizado(tx, id)))
  refrescar()
}

/**
 * Manda una factura por WhatsApp al cliente: el enlace firmado a la factura
 * y, si tiene saldo y hay medios de pago, un link para pagarla.
 */
export async function mandarFacturaAccion(comprobanteId: string) {
  const r = await intentar(() =>
    enLaEmpresa('whatsapp.atender', async (tx, s) => {
      const [c] = await tx
        .select({ c: comprobantes, telefono: terceros.telefono, cliente: terceros.razonSocial })
        .from(comprobantes)
        .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
        .where(eq(comprobantes.id, comprobanteId))
      if (!c || c.c.estado !== 'autorizado') return { ok: false as const, error: 'Solo se mandan comprobantes autorizados.' }
      if (!c.telefono) return { ok: false as const, error: 'El cliente no tiene teléfono cargado.' }
      const [deuda] = await pendientes(tx, { ids: [c.c.id] })
      let pago: string | null = null
      if (deuda && Number(deuda.saldo) > 0 && tienePermiso(s.permisos, 'ventas.cobrar') && (await hayPasarelas(tx))) {
        const p = await crearPago(tx, s.usuario.id, { terceroId: c.c.terceroId, comprobanteIds: [c.c.id], origen: 'whatsapp' })
        if (p.ok) pago = urlPago(p.clave)
      }
      const nombre = `${nombreComprobante(c.c.tipo)} ${formatearNumero(c.c.puntoVenta, c.c.numero ?? 0)}`
      const total = Number(enPesos(c.c)).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
      const texto = [
        `Hola, ${c.cliente}. Te mandamos la ${nombre} por ${total}:`,
        `${urlBase()}/comprobante/${firmarEnlace('factura', s.empresa.id, c.c.id)}`,
        ...(pago ? ['', `Podés pagarla acá: ${pago}`] : []),
        '',
        s.empresa.razonSocial,
      ].join('\n')
      return {
        ok: true as const,
        empresaId: s.empresa.id,
        usuarioId: s.usuario.id,
        telefono: c.telefono,
        terceroId: c.c.terceroId,
        texto,
      }
    }),
  )
  if (!r.ok) redirect(`/facturas/${comprobanteId}?error=${encodeURIComponent(r.error)}`)
  const e = await enviarATelefono(r.empresaId, r.telefono, r.texto, { tipo: 'usuario', usuarioId: r.usuarioId }, r.terceroId)
  revalidatePath('/whatsapp', 'layout')
  redirect(`/facturas/${comprobanteId}?${e.ok ? 'whatsapp=1' : `error=${encodeURIComponent(e.error)}`}`)
}
