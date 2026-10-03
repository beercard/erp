'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { conEmpresa } from '@/db/empresa'
import { ipDe } from '@/lib/auth/servidor'
import { anotar, claveIp, superado } from '@/lib/frenos'
import { crearPago, hayPasarelas } from '@/modulos/cobros/cobros'
import { enviarPendientes } from '@/modulos/comunicaciones/correo'
import { entregarPendientes } from '@/modulos/integraciones/webhooks'
import {
  aceptarInvitacion,
  cargarContadores,
  cerrarSesionPortal,
  empresaDelPortal,
  equiposDelCliente,
  ingresarAlPortal,
  pedirServicio,
  recuperarClavePortal,
} from '@/modulos/portal/portal'
import { guardarArchivoEnvio, quitarArchivoEnvio } from '@/modulos/servicio/archivos'
import {
  borradorDe,
  descartarBorrador,
  empezarEnvio,
  enviarFormulario,
  guardarBorrador,
  type Autor,
} from '@/modulos/servicio/sueltos'

import { borrarCookiePortal, guardarCookiePortal, requerirPortal, tokenPortal } from './sesion'

export type EstadoPortal = { error?: string; ok?: string } | undefined

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

async function origen() {
  // En producción APP_URL es obligatoria (el arranque lo controla): el Host lo
  // manda el cliente y no puede decidir adónde apuntan los enlaces de los correos.
  if (process.env.APP_URL) return process.env.APP_URL
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

const VENTANA = 15 * 60_000

/** Después de responder: los emails y los webhooks que quedaron en cola. */
const despachar = (empresaId: string) =>
  after(async () => {
    await enviarPendientes(empresaId).catch(() => undefined)
    await entregarPendientes(empresaId).catch(() => undefined)
  })

export async function ingresarAccion(_: EstadoPortal, fd: FormData): Promise<EstadoPortal> {
  const cuit = texto(fd, 'empresa')
  const email = texto(fd, 'email').toLowerCase()
  const ip = claveIp('portal', ipDe(await headers()))
  if (fd.get('olvide') === '1') {
    // Un correo de recuperación por email cada 15 minutos, y pocos por conexión.
    const porEmail = `portal:recuperar:${cuit}:${email}`
    if ((await superado([porEmail], 1, VENTANA)) || (await superado([ip], 10, VENTANA))) {
      return { ok: 'Si el email tiene usuario en el portal, te llega un enlace para elegir una contraseña nueva.' }
    }
    await anotar([porEmail, ip])
    const empresa = await empresaDelPortal(cuit)
    if (!empresa) return { error: 'Esta empresa no tiene el portal de clientes habilitado.' }
    await recuperarClavePortal(cuit, email, await origen())
    despachar(empresa.id)
    return { ok: 'Si el email tiene usuario en el portal, te llega un enlace para elegir una contraseña nueva.' }
  }
  const porCuenta = `portal:ingreso:${cuit}:${email}`
  if ((await superado([porCuenta], 8, VENTANA)) || (await superado([ip], 30, VENTANA))) {
    return { error: 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.' }
  }
  const r = await ingresarAlPortal(cuit, email, String(fd.get('clave') ?? ''))
  if (!r.ok) {
    await anotar([porCuenta, ip])
    return { error: r.error }
  }
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

// ---------------------------------------------------------------- Formularios sueltos

const autorPortal = (s: Awaited<ReturnType<typeof requerirPortal>>): Autor => ({
  quien: 'portal',
  usuarioPortalId: s.usuario.id,
  terceroId: s.cliente.id,
})

export async function empezarFormularioAccion(formularioId: string) {
  const s = await requerirPortal()
  const r = await conEmpresa(s.empresaId, (tx) => empezarEnvio(tx, formularioId, autorPortal(s)))
  if (!r.ok) redirect(`/portal/formularios?error=${encodeURIComponent(r.error)}`)
  redirect(`/portal/formularios/${r.id}`)
}

export async function guardarFormularioPortalAccion(id: string, valores: unknown) {
  const s = await requerirPortal()
  return conEmpresa(s.empresaId, (tx) => guardarBorrador(tx, id, autorPortal(s), valores))
}

export async function subirArchivoPortalAccion(id: string, clase: 'foto' | 'firma', fd: FormData) {
  const s = await requerirPortal()
  const archivo = fd.get('archivo')
  if (!(archivo instanceof File)) return { ok: false as const, error: 'Elegí la imagen.' }
  if (clase !== 'foto' && clase !== 'firma') return { ok: false as const, error: 'Archivo inválido.' }
  const datos = Buffer.from(await archivo.arrayBuffer())
  return conEmpresa(s.empresaId, async (tx) =>
    (await borradorDe(tx, id, autorPortal(s)))
      ? guardarArchivoEnvio(tx, null, id, clase, datos)
      : { ok: false as const, error: 'Ese formulario ya se envió.' },
  )
}

export async function quitarArchivoPortalAccion(id: string, archivoId: string) {
  const s = await requerirPortal()
  return conEmpresa(s.empresaId, async (tx) =>
    (await borradorDe(tx, id, autorPortal(s)))
      ? quitarArchivoEnvio(tx, id, archivoId)
      : { ok: false as const, error: 'Sin permiso.' },
  )
}

export async function enviarFormularioPortalAccion(id: string, _: EstadoPortal, fd: FormData): Promise<EstadoPortal> {
  const s = await requerirPortal()
  let valores: unknown = {}
  try {
    valores = JSON.parse(String(fd.get('valores') || '{}'))
  } catch {
    return { error: 'No se pudo leer el formulario.' }
  }
  const r = await conEmpresa(s.empresaId, (tx) => enviarFormulario(tx, id, autorPortal(s), { valores }))
  if (!r.ok) return { error: r.error }
  despachar(s.empresaId)
  redirect(`/portal/formularios?enviado=${r.numero}`)
}

export async function descartarFormularioPortalAccion(id: string) {
  const s = await requerirPortal()
  await conEmpresa(s.empresaId, (tx) => descartarBorrador(tx, id, autorPortal(s)))
  redirect('/portal/formularios')
}

/** Los equipos del cliente de la sesión (el formulario no puede pedir los de otro). */
export async function equiposPortalAccion() {
  const s = await requerirPortal()
  return conEmpresa(s.empresaId, async (tx) =>
    (await equiposDelCliente(tx, s.cliente.id)).map((e) => ({ id: e.id, serie: e.serie, modelo: e.modelo, sector: e.sector })),
  )
}

/**
 * "Pagar" desde Mi cuenta: arma un link de pago por una factura o por todo
 * el saldo y lleva a elegir con qué pagar. Solo con la cuenta corriente
 * habilitada y alguna pasarela conectada.
 */
export async function pagarDesdePortalAccion(comprobanteId: string | null) {
  const s = await requerirPortal()
  if (!s.cuenta) redirect('/portal')
  const r = await conEmpresa(s.empresaId, async (tx) => {
    if (!(await hayPasarelas(tx))) return { ok: false as const, error: 'Por ahora no hay medios de pago online.' }
    return crearPago(tx, null, {
      terceroId: s.cliente.id,
      comprobanteIds: comprobanteId ? [comprobanteId] : [],
      origen: 'portal',
    })
  })
  if (!r.ok) redirect(`/portal/cuenta?error=${encodeURIComponent(r.error)}`)
  redirect(`/pago/${r.clave}`)
}
