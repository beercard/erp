'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { conEmpresa } from '@/db/empresa'
import { enviarPendientes } from '@/modulos/comunicaciones/correo'
import { entregarPendientes } from '@/modulos/integraciones/webhooks'
import {
  aceptarInvitacion,
  cargarContadores,
  cerrarSesionPortal,
  empresaDelPortal,
  ingresarAlPortal,
  pedirServicio,
  recuperarClavePortal,
} from '@/modulos/portal/portal'

import { borrarCookiePortal, guardarCookiePortal, requerirPortal, tokenPortal } from './sesion'

export type EstadoPortal = { error?: string; ok?: string } | undefined

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

async function origen() {
  const h = await headers()
  return process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

/** Después de responder: los emails y los webhooks que quedaron en cola. */
const despachar = (empresaId: string) =>
  after(async () => {
    await enviarPendientes(empresaId).catch(() => undefined)
    await entregarPendientes(empresaId).catch(() => undefined)
  })

export async function ingresarAccion(_: EstadoPortal, fd: FormData): Promise<EstadoPortal> {
  const cuit = texto(fd, 'empresa')
  if (fd.get('olvide') === '1') {
    const empresa = await empresaDelPortal(cuit)
    if (!empresa) return { error: 'Esta empresa no tiene el portal de clientes habilitado.' }
    await recuperarClavePortal(cuit, texto(fd, 'email'), await origen())
    despachar(empresa.id)
    return { ok: 'Si el email tiene usuario en el portal, te llega un enlace para elegir una contraseña nueva.' }
  }
  const r = await ingresarAlPortal(cuit, texto(fd, 'email'), String(fd.get('clave') ?? ''))
  if (!r.ok) return { error: r.error }
  await guardarCookiePortal(r.token, r.vence)
  redirect('/portal')
}

export async function aceptarAccion(token: string, _: EstadoPortal, fd: FormData): Promise<EstadoPortal> {
  const clave = String(fd.get('clave') ?? '')
  if (clave !== String(fd.get('repetir') ?? '')) return { error: 'Las contraseñas no coinciden.' }
  const r = await aceptarInvitacion(token, clave)
  if (!r.ok) return { error: r.error }
  await guardarCookiePortal(r.token, r.vence)
  redirect('/portal')
}

export async function salirAccion() {
  await cerrarSesionPortal(await tokenPortal()).catch(() => undefined)
  await borrarCookiePortal()
  redirect('/portal/ingresar')
}

export async function pedirAccion(_: EstadoPortal, fd: FormData): Promise<EstadoPortal> {
  const s = await requerirPortal()
  let instrucciones: unknown = {}
  try {
    instrucciones = JSON.parse(String(fd.get('instrucciones') || '{}'))
  } catch {
    return { error: 'No se pudo leer el formulario.' }
  }
  const r = await conEmpresa(s.empresaId, (tx) =>
    pedirServicio(tx, s, {
      equipoId: texto(fd, 'equipoId'),
      tipoOrdenId: texto(fd, 'tipoOrdenId'),
      falla: texto(fd, 'falla'),
      contacto: texto(fd, 'contacto'),
      telefono: texto(fd, 'telefono'),
      instrucciones,
    }),
  )
  if (!r.ok) return { error: r.error }
  despachar(s.empresaId)
  redirect(`/portal/ordenes/${r.id}?pedida=1`)
}

export async function contadoresAccion(_: EstadoPortal, fd: FormData): Promise<EstadoPortal> {
  const s = await requerirPortal()
  const lecturas = [...fd.entries()]
    .filter(([k]) => k.startsWith('contador:'))
    .map(([k, v]) => ({ equipoId: k.slice('contador:'.length), contador: String(v) }))
  const r = await conEmpresa(s.empresaId, (tx) => cargarContadores(tx, s, lecturas))
  if (!r.ok) return { error: r.error }
  despachar(s.empresaId)
  revalidatePath('/portal')
  if (r.errores.length) return { error: r.errores.map((e) => `${e.serie ? `${e.serie}: ` : ''}${e.error}`).join(' ') }
  if (!r.cargadas) return { error: 'Escribí al menos un contador.' }
  return { ok: r.cargadas === 1 ? 'Contador cargado. ¡Gracias!' : `${r.cargadas} contadores cargados. ¡Gracias!` }
}
