'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { pagosOnline, terceros } from '@/db/schema'
import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { cancelarPago, crearPago, guardarPasarela, quitarPasarela, urlPago } from '@/modulos/cobros/cobros'
import { encolarCorreo } from '@/modulos/comunicaciones/correo'

export type EstadoCobro = { error?: string; ok?: string } | undefined

async function intentar<T>(f: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const refrescar = () => revalidatePath('/cobros-online', 'layout')

/** Nuevo link: por las facturas marcadas, por un importe o por todo el saldo. */
export async function crearPagoAccion(_: EstadoCobro, fd: FormData): Promise<EstadoCobro> {
  const r = await intentar(() =>
    enLaEmpresa('ventas.cobrar', (tx, s) =>
      crearPago(tx, s.usuario.id, {
        terceroId: fd.get('terceroId'),
        comprobanteIds: fd.getAll('comprobanteIds').map(String),
        importe: fd.get('importe') ?? '',
        concepto: fd.get('concepto') ?? '',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar()
  redirect(`/cobros-online?nuevo=${r.id}`)
}

/** Desde una factura: link por su saldo. */
export async function linkDeFacturaAccion(terceroId: string, comprobanteId: string) {
  const r = await intentar(() =>
    enLaEmpresa('ventas.cobrar', (tx, s) => crearPago(tx, s.usuario.id, { terceroId, comprobanteIds: [comprobanteId] })),
  )
  if (!r.ok) redirect(`/facturas/${comprobanteId}?error=${encodeURIComponent(r.error)}`)
  refrescar()
  redirect(`/cobros-online?nuevo=${r.id}`)
}

export async function cancelarPagoAccion(id: string) {
  await intentar(() => enLaEmpresa('ventas.cobrar', (tx, s) => cancelarPago(tx, s.usuario.id, id)))
  refrescar()
}

/** Manda el link por email al cliente (sale por la bandeja de correos de la empresa). */
export async function enviarPorEmailAccion(id: string): Promise<EstadoCobro> {
  const r = await intentar(() =>
    enLaEmpresa('ventas.cobrar', async (tx, s) => {
      const [p] = await tx
        .select({ pago: pagosOnline, email: terceros.email, cliente: terceros.razonSocial })
        .from(pagosOnline)
        .innerJoin(terceros, eq(terceros.id, pagosOnline.terceroId))
        .where(eq(pagosOnline.id, id))
      if (!p || p.pago.estado !== 'pendiente') return { ok: false as const, error: 'Ese link ya no está pendiente.' }
      if (!p.email) return { ok: false as const, error: 'El cliente no tiene email cargado.' }
      const importe = Number(p.pago.importe).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
      const enviado = await encolarCorreo(tx, {
        para: p.email,
        asunto: `${s.empresa.razonSocial}: link de pago (${importe})`,
        texto: `Hola:\n\nTe mandamos el link para pagar ${p.pago.concepto} por ${importe}:\n\n${urlPago(p.pago.clave)}\n\nPodés pagar con los medios que aparecen en la página.\n\nSaludos,\n${s.empresa.razonSocial}`,
        entidad: 'pago_online',
        entidadId: id,
        usuarioId: s.usuario.id,
      })
      return enviado ? { ok: true as const, email: p.email } : { ok: false as const, error: 'El email del cliente no es válido.' }
    }),
  )
  return r.ok ? { ok: `Enviado a ${(r as { email: string }).email}.` } : { error: r.error }
}

export async function guardarPasarelaAccion(proveedor: string, _: EstadoCobro, fd: FormData): Promise<EstadoCobro> {
  const entrada: Record<string, unknown> = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string'))
  entrada.activa = fd.has('activa')
  entrada.prueba = fd.has('prueba')
  const r = await intentar(() =>
    enLaEmpresa('ventas.pasarelas', (tx, s) => guardarPasarela(tx, s.usuario.id, proveedor, entrada)),
  )
  if (!r.ok) return { error: r.error }
  refrescar()
  return { ok: 'Guardado.' }
}

export async function quitarPasarelaAccion(id: string) {
  await intentar(() => enLaEmpresa('ventas.pasarelas', (tx, s) => quitarPasarela(tx, s.usuario.id, id)))
  refrescar()
}
