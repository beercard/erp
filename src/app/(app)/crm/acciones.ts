'use server'

import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { terceros } from '@/db/schema'
import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import {
  activarMotivo,
  agendarActividad,
  agregarNota,
  borrarActividad,
  borrarEtapa,
  borrarOportunidad,
  cambiarPrioridad,
  completarActividad,
  crearClienteDesde,
  crearPresupuestoDesde,
  ganarOportunidad,
  guardarEtapa,
  guardarMotivo,
  guardarOportunidad,
  moverEtapa,
  moverOportunidad,
  perderOportunidad,
  reabrirOportunidad,
  vincularCliente,
} from '@/modulos/crm/crm'

export type EstadoCrm = { error?: string; ok?: boolean; valores?: Record<string, string> } | undefined

/** Ejecuta y convierte "sin permiso" en un mensaje para el usuario. */
async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const valores = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>

const ficha = (id: string) => `/crm/${id}`

function refrescar(id?: string) {
  revalidatePath('/crm', 'layout')
  if (id) revalidatePath(ficha(id))
}

/** Si salió mal, vuelve a la ficha con el error a la vista. */
function seguir(id: string, r: { ok: boolean; error?: string }) {
  refrescar(id)
  if (!r.ok) redirect(`${ficha(id)}?error=${encodeURIComponent(r.error ?? 'No se pudo hacer.')}`)
}

// ----------------------------------------------------------- Clientes

export async function buscarClientesCrm(texto: string) {
  const q = String(texto ?? '').trim()
  if (q.length < 2) return []
  return enLaEmpresa('crm.ver', (tx) =>
    tx
      .select({ id: terceros.id, razonSocial: terceros.razonSocial, codigo: terceros.codigo, email: terceros.email })
      .from(terceros)
      .where(
        and(
          eq(terceros.esCliente, true),
          or(ilike(terceros.razonSocial, `%${q}%`), ilike(terceros.codigo, `${q}%`), ilike(terceros.numeroDocumento, `${q}%`)),
        ),
      )
      .orderBy(asc(terceros.razonSocial))
      .limit(8),
  )
}

// ----------------------------------------------------------- Oportunidades

export async function guardarOportunidadAccion(id: string | null, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const entrada = { ...valores(fd), etiquetas: String(fd.get('etiquetas') ?? '') }
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) => guardarOportunidad(tx, s.usuario.id, entrada, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error, valores: valores(fd) }
  refrescar(r.id)
  redirect(`${ficha(r.id)}?guardado=1`)
}

/** Alta rápida desde una columna del embudo: título, cliente o prospecto e ingreso. */
export async function altaRapidaAccion(etapaId: string, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) => guardarOportunidad(tx, s.usuario.id, { ...valores(fd), etapaId })),
  )
  if (!r.ok) return { error: r.error, valores: valores(fd) }
  refrescar()
  return { ok: true }
}

export async function moverAccion(id: string, etapaId: string, antesDe: string | null) {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) => moverOportunidad(tx, s.usuario.id, id, etapaId, antesDe)),
  )
  refrescar(id)
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
}

export async function prioridadAccion(id: string, prioridad: number) {
  await intentar(() => enLaEmpresa('crm.oportunidades', (tx) => cambiarPrioridad(tx, id, prioridad)))
  refrescar(id)
}

export async function ganarAccion(id: string) {
  seguir(id, await intentar(() => enLaEmpresa('crm.oportunidades', (tx, s) => ganarOportunidad(tx, s.usuario.id, id))))
}

export async function reabrirAccion(id: string) {
  seguir(id, await intentar(() => enLaEmpresa('crm.oportunidades', (tx, s) => reabrirOportunidad(tx, s.usuario.id, id))))
}

export async function perderAccion(id: string, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) =>
      perderOportunidad(tx, s.usuario.id, id, { motivoId: fd.get('motivoId'), nota: fd.get('nota') }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: true }
}

export async function moverEnFichaAccion(id: string, etapaId: string) {
  seguir(id, await moverAccion(id, etapaId, null))
}

export async function borrarOportunidadAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('crm.oportunidades', (tx, s) => borrarOportunidad(tx, s.usuario.id, id)))
  if (!r.ok) redirect(`${ficha(id)}?error=${encodeURIComponent(r.error)}`)
  refrescar()
  redirect('/crm')
}

export async function presupuestoAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('ventas.presupuestos', (tx, s) => crearPresupuestoDesde(tx, s.usuario.id, id)))
  seguir(id, r)
  if (r.ok) redirect(`/presupuestos/${r.id}`)
}

export async function clienteAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('maestros.terceros', (tx, s) => crearClienteDesde(tx, s.usuario.id, id)))
  seguir(id, r)
  redirect(`${ficha(id)}?guardado=1`)
}

export async function vincularAccion(id: string, terceroId: string) {
  seguir(id, await intentar(() => enLaEmpresa('crm.oportunidades', (tx, s) => vincularCliente(tx, s.usuario.id, id, terceroId))))
}

// ----------------------------------------------------------- Actividades y notas

export async function agendarAccion(oportunidadId: string, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) => agendarActividad(tx, s.usuario.id, oportunidadId, valores(fd))),
  )
  if (!r.ok) return { error: r.error, valores: valores(fd) }
  refrescar(oportunidadId)
  return { ok: true }
}

export async function completarAccion(id: string, oportunidadId: string, fd: FormData) {
  await intentar(() => enLaEmpresa('crm.oportunidades', (tx, s) => completarActividad(tx, s.usuario.id, id, fd.get('resultado'))))
  refrescar(oportunidadId)
  revalidatePath('/crm/actividades')
}

export async function borrarActividadAccion(id: string, oportunidadId: string) {
  await intentar(() => enLaEmpresa('crm.oportunidades', (tx) => borrarActividad(tx, id)))
  refrescar(oportunidadId)
}

export async function notaAccion(oportunidadId: string, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) => agregarNota(tx, s.usuario.id, oportunidadId, fd.get('nota'))),
  )
  if (!r.ok) return { error: r.error }
  refrescar(oportunidadId)
  return { ok: true }
}

// ----------------------------------------------------------- Configuración

export async function guardarEtapaAccion(id: string | null, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.configurar', (tx, s) =>
      guardarEtapa(
        tx,
        s.usuario.id,
        {
          nombre: fd.get('nombre'),
          probabilidad: fd.get('probabilidad'),
          ganada: fd.get('ganada') === 'on',
          diasAlerta: fd.get('diasAlerta'),
        },
        id ?? undefined,
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar()
  return { ok: true }
}

export async function moverEtapaAccion(id: string, sentido: -1 | 1) {
  await intentar(() => enLaEmpresa('crm.configurar', (tx) => moverEtapa(tx, id, sentido)))
  refrescar()
}

export async function borrarEtapaAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('crm.configurar', (tx, s) => borrarEtapa(tx, s.usuario.id, id)))
  refrescar()
  if (!r.ok) redirect(`/crm/configuracion?error=${encodeURIComponent(r.error)}`)
}

export async function guardarMotivoAccion(_: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() => enLaEmpresa('crm.configurar', (tx, s) => guardarMotivo(tx, s.usuario.id, fd.get('nombre'))))
  if (!r.ok) return { error: r.error }
  refrescar()
  return { ok: true }
}

export async function activarMotivoAccion(id: string, activo: boolean) {
  await intentar(() => enLaEmpresa('crm.configurar', (tx) => activarMotivo(tx, id, activo)))
  refrescar()
}
