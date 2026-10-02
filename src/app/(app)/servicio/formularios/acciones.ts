'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'

import type { Transaccion } from '@/db/conexion'
import { enLaEmpresa, SinPermiso, type SesionConEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { entregarPendientes } from '@/modulos/integraciones/webhooks'
import { guardarArchivoEnvio, quitarArchivoEnvio } from '@/modulos/servicio/archivos'
import { tecnicoDeUsuario } from '@/modulos/servicio/servicio'
import {
  borrarEstado,
  cambiarEstadoEnvio,
  crearModelosSueltos,
  descartarBorrador,
  empezarEnvio,
  enviarFormulario,
  guardarBorrador,
  guardarEstado,
  guardarFormulario,
  type Autor,
} from '@/modulos/servicio/sueltos'
import { enviosFormulario } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type Estado = { error?: string; ok?: string } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const valor = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const marcado = (fd: FormData, k: string) => fd.get(k) === 'on'

function revalidar() {
  revalidatePath('/servicio/formularios')
  revalidatePath('/servicio/bandeja')
  revalidatePath('/tecnico/formularios')
}

// ---------------------------------------------------------------- Definiciones (configurar)

export async function guardarFormularioAccion(id: string | null, _: Estado, fd: FormData): Promise<Estado> {
  let campos: unknown
  try {
    campos = JSON.parse(valor(fd, 'campos') || '[]')
  } catch {
    return { error: 'No se pudo leer el formulario.' }
  }
  const r = await intentar(() =>
    enLaEmpresa('servicio.configurar', (tx, s) =>
      guardarFormulario(
        tx,
        s.usuario.id,
        {
          codigo: valor(fd, 'codigo'),
          nombre: valor(fd, 'nombre'),
          descripcion: valor(fd, 'descripcion'),
          color: valor(fd, 'color') || undefined,
          pideCliente: marcado(fd, 'pideCliente'),
          tecnico: marcado(fd, 'tecnico'),
          portal: marcado(fd, 'portal'),
          activo: fd.get('activo') === null ? true : marcado(fd, 'activo'),
          campos,
        },
        id ?? undefined,
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidar()
  if (!id) redirect(`/servicio/formularios/${r.id}?creado=1`)
  return { ok: r.version > 1 ? `Guardado (versión ${r.version}).` : 'Guardado.' }
}

export async function crearModelosSueltosAccion() {
  await intentar(() => enLaEmpresa('servicio.configurar', (tx, s) => crearModelosSueltos(tx, s.usuario.id)))
  revalidar()
}

export async function guardarEstadoAccion(id: string | null, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.configurar', (tx, s) =>
      guardarEstado(
        tx,
        s.usuario.id,
        {
          nombre: valor(fd, 'nombre'),
          color: valor(fd, 'color'),
          orden: valor(fd, 'orden') || 0,
          final: marcado(fd, 'final'),
          inicial: marcado(fd, 'inicial'),
        },
        id ?? undefined,
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidar()
  return { ok: 'Guardado.' }
}

export async function borrarEstadoAccion(id: string): Promise<Estado> {
  const r = await intentar(() => enLaEmpresa('servicio.configurar', (tx, s) => borrarEstado(tx, s.usuario.id, id)))
  revalidar()
  return r.ok ? { ok: 'Borrado.' } : { error: r.error }
}

// ---------------------------------------------------------------- Completar (oficina o técnico)

/** Quién completa: el técnico (si lo pidió desde Mi agenda) o la oficina. */
async function autor(tx: Transaccion, s: SesionConEmpresa, quien: 'oficina' | 'tecnico'): Promise<Autor | null> {
  if (quien === 'tecnico') {
    const t = await tecnicoDeUsuario(tx, s.usuario)
    return t ? { quien: 'tecnico', usuarioId: s.usuario.id, tecnicoId: t.id } : null
  }
  return tienePermiso(s.permisos, 'servicio.cargar') ? { quien: 'oficina', usuarioId: s.usuario.id } : null
}

/** El autor de un borrador, según desde dónde se empezó. */
async function autorDelBorrador(tx: Transaccion, s: SesionConEmpresa, envioId: string) {
  const [e] = await tx.select({ origen: enviosFormulario.origen }).from(enviosFormulario).where(eq(enviosFormulario.id, envioId))
  if (!e || e.origen === 'portal') return null
  return autor(tx, s, e.origen as 'oficina' | 'tecnico')
}

export async function empezarAccion(formularioId: string, quien: 'oficina' | 'tecnico', ordenId?: string) {
  const r = await intentar(() =>
    enLaEmpresa('servicio.ver', async (tx, s) => {
      const a = await autor(tx, s, quien)
      if (!a) return { ok: false as const, error: 'No podés completar formularios.' }
      return empezarEnvio(tx, formularioId, a, { ordenId: ordenId ?? null })
    }),
  )
  if (!r.ok)
    redirect(`${quien === 'tecnico' ? '/tecnico/formularios' : '/servicio/formularios'}?error=${encodeURIComponent(r.error)}`)
  redirect(`/servicio/envios/${r.id}`)
}

export async function guardarBorradorAccion(id: string, valores: unknown, terceroId?: string | null) {
  return intentar(() =>
    enLaEmpresa('servicio.ver', async (tx, s) => {
      const a = await autorDelBorrador(tx, s, id)
      return a ? guardarBorrador(tx, id, a, valores, terceroId) : { ok: false as const, error: 'Sin permiso.' }
    }),
  )
}

export async function subirArchivoEnvioAccion(id: string, clase: 'foto' | 'firma', fd: FormData) {
  const archivo = fd.get('archivo')
  if (!(archivo instanceof File)) return { ok: false as const, error: 'Elegí la imagen.' }
  if (clase !== 'foto' && clase !== 'firma') return { ok: false as const, error: 'Archivo inválido.' }
  const datos = Buffer.from(await archivo.arrayBuffer())
  return intentar(() =>
    enLaEmpresa('servicio.ver', async (tx, s) => {
      const a = await autorDelBorrador(tx, s, id)
      return a ? guardarArchivoEnvio(tx, s.usuario.id, id, clase, datos) : { ok: false as const, error: 'Sin permiso.' }
    }),
  )
}

export async function quitarArchivoEnvioAccion(id: string, archivoId: string) {
  return intentar(() =>
    enLaEmpresa('servicio.ver', async (tx, s) => {
      const a = await autorDelBorrador(tx, s, id)
      return a ? quitarArchivoEnvio(tx, id, archivoId) : { ok: false as const, error: 'Sin permiso.' }
    }),
  )
}

export async function enviarAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  let valores: unknown = {}
  try {
    valores = JSON.parse(valor(fd, 'valores') || '{}')
  } catch {
    return { error: 'No se pudo leer el formulario.' }
  }
  const lat = valor(fd, 'lat')
  const lng = valor(fd, 'lng')
  const r = await intentar(() =>
    enLaEmpresa('servicio.ver', async (tx, s) => {
      const a = await autorDelBorrador(tx, s, id)
      if (!a) return { ok: false as const, error: 'Ese formulario ya se envió o no es tuyo.' }
      const e = await enviarFormulario(tx, id, a, {
        terceroId: valor(fd, 'terceroId'),
        valores,
        lat: lat || null,
        lng: lng || null,
      })
      return e.ok ? { ...e, quien: a.quien, empresaId: s.empresa.id } : e
    }),
  )
  if (!r.ok) return { error: r.error }
  after(() => entregarPendientes(r.empresaId).catch(() => undefined))
  revalidar()
  redirect(r.quien === 'tecnico' ? `/tecnico/formularios?enviado=${r.numero}` : `/servicio/bandeja/${id}?enviado=1`)
}

export async function descartarAccion(id: string) {
  const r = await intentar(() =>
    enLaEmpresa('servicio.ver', async (tx, s) => {
      const a = await autorDelBorrador(tx, s, id)
      if (!a) return { ok: false as const, error: 'Sin permiso.' }
      const d = await descartarBorrador(tx, id, a)
      return d.ok ? { ...d, quien: a.quien } : d
    }),
  )
  redirect(r.ok && r.quien === 'tecnico' ? '/tecnico/formularios' : '/servicio/formularios')
}

// ---------------------------------------------------------------- Bandeja

export async function cambiarEstadoAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) =>
      cambiarEstadoEnvio(tx, s.usuario.id, id, { estadoId: valor(fd, 'estadoId'), nota: valor(fd, 'nota') }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidar()
  revalidatePath(`/servicio/bandeja/${id}`)
  return { ok: 'Guardado.' }
}
