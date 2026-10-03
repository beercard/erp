'use server'

import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { terceros } from '@/db/schema'
import type { Transaccion } from '@/db/conexion'
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
  responsables,
  vincularCliente,
} from '@/modulos/crm/crm'
import {
  activarFormulario,
  actualizarCampo,
  asignarVarias,
  borrarPlantilla,
  desactivarFormulario,
  enviarEmail,
  guardarAjustes,
  guardarPlantilla,
  moverVarias,
  registrarLlamada,
  registrarWhatsapp,
} from '@/modulos/crm/extras'

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

/** El responsable tiene que ser alguien de la empresa. */
async function esDeLaEmpresa(tx: Transaccion, empresaId: string, usuarioId: unknown) {
  if (!usuarioId) return true
  return (await responsables(tx, empresaId)).some((p) => p.id === usuarioId)
}

const NO_ES_DEL_EQUIPO = { ok: false as const, error: 'Esa persona no es de la empresa.' }

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
  const entrada: Record<string, string> = { ...valores(fd), etiquetas: String(fd.get('etiquetas') ?? '') }
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', async (tx, s) =>
      (await esDeLaEmpresa(tx, s.empresa.id, entrada.responsableId))
        ? guardarOportunidad(tx, s.usuario.id, entrada, id ?? undefined)
        : NO_ES_DEL_EQUIPO,
    ),
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

/** Edición en línea de un dato (ficha y vista rápida). */
export async function campoAccion(id: string, campo: string, valor: string) {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', async (tx, s) =>
      campo === 'responsableId' && !(await esDeLaEmpresa(tx, s.empresa.id, valor))
        ? NO_ES_DEL_EQUIPO
        : actualizarCampo(tx, s.usuario.id, id, campo, campo === 'responsableId' ? valor || null : valor),
    ),
  )
  refrescar(id)
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
}

/** Acciones sobre varias oportunidades de la lista. */
export async function moverVariasAccion(ids: string[], etapaId: string) {
  const r = await intentar(() => enLaEmpresa('crm.oportunidades', (tx, s) => moverVarias(tx, s.usuario.id, ids, etapaId)))
  refrescar()
  return r.ok ? { ok: true as const, cantidad: r.movidas } : { ok: false as const, error: r.error }
}

export async function asignarVariasAccion(ids: string[], responsableId: string) {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', async (tx, s) =>
      (await esDeLaEmpresa(tx, s.empresa.id, responsableId))
        ? asignarVarias(tx, s.usuario.id, ids, responsableId || null)
        : NO_ES_DEL_EQUIPO,
    ),
  )
  refrescar()
  return r.ok ? { ok: true as const, cantidad: r.asignadas } : { ok: false as const, error: r.error }
}

// ----------------------------------------------------------- Actividades y notas

export async function llamadaAccion(oportunidadId: string, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) =>
      registrarLlamada(tx, s.usuario.id, oportunidadId, { desenlace: fd.get('desenlace'), nota: fd.get('nota') }),
    ),
  )
  if (!r.ok) return { error: r.error, valores: valores(fd) }
  refrescar(oportunidadId)
  return { ok: true }
}

export async function whatsappAccion(oportunidadId: string, texto: string) {
  const t = String(texto ?? '').trim()
  if (!t) return
  await intentar(() => enLaEmpresa('crm.oportunidades', (tx, s) => registrarWhatsapp(tx, s.usuario.id, oportunidadId, t)))
  refrescar(oportunidadId)
}

export async function emailAccion(oportunidadId: string, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.oportunidades', (tx, s) =>
      enviarEmail(tx, s.usuario.id, oportunidadId, { para: fd.get('para'), asunto: fd.get('asunto'), texto: fd.get('texto') }),
    ),
  )
  if (!r.ok) return { error: r.error, valores: valores(fd) }
  refrescar(oportunidadId)
  return { ok: true }
}

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

export async function guardarPlantillaAccion(id: string | null, _: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() => enLaEmpresa('crm.configurar', (tx) => guardarPlantilla(tx, valores(fd), id ?? undefined)))
  if (!r.ok) return { error: r.error, valores: valores(fd) }
  refrescar()
  return { ok: true }
}

export async function borrarPlantillaAccion(id: string) {
  await intentar(() => enLaEmpresa('crm.configurar', (tx) => borrarPlantilla(tx, id)))
  refrescar()
}

export async function ajustesAccion(_: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const r = await intentar(() =>
    enLaEmpresa('crm.configurar', async (tx, s) => {
      const vendedores = fd.getAll('vendedores').map(String)
      const equipo = new Set((await responsables(tx, s.empresa.id)).map((p) => p.id))
      return guardarAjustes(tx, {
        asignacion: fd.get('asignacion'),
        vendedores: vendedores.filter((v) => equipo.has(v)),
        resumenDiario: fd.get('resumenDiario') === 'on',
      })
    }),
  )
  if (!r.ok) return { error: r.error }
  refrescar()
  return { ok: true }
}

/** Formulario web: activar, cambiar la dirección (la anterior deja de andar) o apagar. */
export async function formularioAccion(que: 'activar' | 'regenerar' | 'desactivar') {
  // El permiso se revisa en la empresa; el token vive en una tabla de la plataforma (fuera de esa transacción).
  const empresaId = await intentar(() => enLaEmpresa('crm.configurar', async (_tx, s) => s.empresa.id))
  if (typeof empresaId !== 'string') return
  if (que === 'desactivar') await desactivarFormulario(empresaId)
  else await activarFormulario(empresaId, que === 'regenerar')
  revalidatePath('/crm/configuracion')
}
