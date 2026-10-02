'use server'

import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { Transaccion } from '@/db/conexion'
import { ordenesServicio, terceros } from '@/db/schema'
import { enLaEmpresa, SinPermiso, type SesionConEmpresa } from '@/lib/auth/servidor'
import { normalizarNumero } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { cotizacionVigente } from '@/modulos/comercial/cotizacion'
import { buscarHuecos } from '@/modulos/servicio/agenda'
import { guardarArchivo, quitarArchivo } from '@/modulos/servicio/archivos'
import { generarPreventivos, guardarRegla, pausarRegla } from '@/modulos/servicio/preventivo'
import {
  agregarItem,
  articulosParaOrden,
  cancelarOrden,
  cerrarOrden,
  equiposDelCliente,
  facturarOrden,
  guardarOrden,
  informarOrden,
  programarOrden,
  quitarItem,
  reabrirOrden,
  registrarLlegada,
  registrarVisita,
  tecnicoDeUsuario,
} from '@/modulos/servicio/servicio'
import { crearModelos, guardarTipo } from '@/modulos/servicio/tiposOrden'

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const valor = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/** aviso: se hizo, pero hay algo para mirar (por ejemplo, stock negativo). */
export type Estado = { error?: string; ok?: string; aviso?: string } | undefined

const refrescar = (id: string) => {
  revalidatePath(`/servicio/${id}`)
  revalidatePath(`/tecnico/${id}`)
  revalidatePath('/servicio')
  revalidatePath('/servicio/calendario')
  revalidatePath('/tecnico')
}

const json = (f: FormData, k: string): unknown => {
  try {
    return JSON.parse(valor(f, k) || '{}')
  } catch {
    return {}
  }
}

/**
 * Quien trabaja órdenes sin poder administrarlas (el técnico) solo toca las
 * suyas: las asignadas a su ficha de técnico.
 */
async function ajena(tx: Transaccion, s: SesionConEmpresa, ordenId: string) {
  if (tienePermiso(s.permisos, 'servicio.cargar')) return null
  const t = await tecnicoDeUsuario(tx, s.usuario)
  const [o] = await tx
    .select({ tecnicoId: ordenesServicio.tecnicoId })
    .from(ordenesServicio)
    .where(eq(ordenesServicio.id, ordenId))
  return t && o && o.tecnicoId === t.id ? null : { ok: false as const, error: 'Esa orden no está asignada a vos.' }
}

// ------------------------------------------------------------- Búsquedas

/** Clientes para abrir una orden (sin pedir permisos de ventas). */
export async function buscarClientesServicio(texto: string) {
  const q = String(texto ?? '').trim()
  if (q.length < 2 || q.length > 80) return []
  return enLaEmpresa('servicio.ver', (tx) =>
    tx
      .select({ id: terceros.id, codigo: terceros.codigo, razonSocial: terceros.razonSocial })
      .from(terceros)
      .where(
        and(
          eq(terceros.esCliente, true),
          eq(terceros.activo, true),
          or(
            ilike(terceros.razonSocial, `%${q}%`),
            ilike(terceros.codigo, `%${q}%`),
            ilike(terceros.numeroDocumento, `%${q.replace(/\D/g, '') || q}%`),
          ),
        ),
      )
      .orderBy(asc(terceros.razonSocial))
      .limit(12),
  )
}

export async function equiposDelClienteAccion(terceroId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(terceroId)) return []
  return enLaEmpresa('servicio.ver', (tx) => equiposDelCliente(tx, terceroId))
}

export async function buscarArticulosOrden(ordenId: string, texto: string) {
  if (typeof texto !== 'string' || texto.length > 80 || !/^[0-9a-f-]{36}$/i.test(ordenId)) return []
  return enLaEmpresa('servicio.ver', async (tx) => {
    const dolar = await cotizacionVigente(tx, 'DOL', hoyArgentina())
    return articulosParaOrden(tx, ordenId, texto, dolar?.valor ?? null)
  })
}

// ---------------------------------------------------------------- Órdenes

export async function guardarOrdenAccion(id: string | null, _: Estado, formData: FormData): Promise<Estado> {
  const datos: Record<string, unknown> = {
    ...Object.fromEntries(
      [
        'fecha',
        'terceroId',
        'equipoId',
        'tipoOrdenId',
        'tipo',
        'prioridad',
        'falla',
        'contacto',
        'telefono',
        'domicilio',
        'tecnicoId',
        'programada',
        'hora',
        'cobertura',
        'observaciones',
      ].map((k) => [k, valor(formData, k)]),
    ),
    duracion: valor(formData, 'duracion') || null,
    instrucciones: json(formData, 'instrucciones'),
  }
  // Sin clase elegida (la orden tiene tipo): la toma del tipo.
  if (!datos.tipo) delete datos.tipo
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) => guardarOrden(tx, s.usuario.id, datos, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error }
  refrescar(r.id)
  redirect(`/servicio/${r.id}${id ? '?guardada=1' : ''}`)
}

/** Programa la visita: técnico, día, hora y duración (también desde el calendario). */
export async function programarAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) =>
      programarOrden(tx, s.usuario.id, id, {
        tecnicoId: valor(formData, 'tecnicoId'),
        programada: valor(formData, 'programada'),
        hora: valor(formData, 'hora'),
        duracion: valor(formData, 'duracion') || undefined,
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: 'Programada.' }
}

/** Arrastrar en el calendario: nuevo técnico y día (y hora, si se soltó en una). */
export async function moverEnCalendario(
  id: string,
  destino: { tecnicoId: string | null; programada: string | null; hora?: string | null },
) {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', async (tx, s) => {
      const [o] = await tx.select({ hora: ordenesServicio.hora }).from(ordenesServicio).where(eq(ordenesServicio.id, id))
      return programarOrden(tx, s.usuario.id, id, {
        tecnicoId: destino.tecnicoId,
        programada: destino.programada,
        hora: destino.programada ? (destino.hora ?? o?.hora ?? null) : null,
      })
    }),
  )
  refrescar(id)
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
}

export async function buscarHuecosAccion(id: string, desde: string) {
  return intentar(() =>
    enLaEmpresa('servicio.cargar', async (tx) => {
      const [o] = await tx.select({ duracion: ordenesServicio.duracion }).from(ordenesServicio).where(eq(ordenesServicio.id, id))
      if (!o) return { ok: false as const, error: 'Esa orden ya no existe.' }
      return {
        ok: true as const,
        huecos: await buscarHuecos(tx, {
          duracion: o.duracion,
          desde: /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : undefined,
          excluirOrdenId: id,
        }),
      }
    }),
  )
}

export async function visitaAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.trabajar', async (tx, s) => {
      const no = await ajena(tx, s, id)
      if (no) return no
      return registrarVisita(tx, s.usuario.id, id, {
        fecha: valor(formData, 'fecha'),
        tecnicoId: valor(formData, 'tecnicoId'),
        horas: valor(formData, 'horas') || '0',
        detalle: valor(formData, 'detalle'),
      })
    }),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: 'Visita cargada.' }
}

export async function itemAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) =>
      agregarItem(tx, s.usuario.id, id, {
        articuloId: valor(formData, 'articuloId'),
        descripcion: valor(formData, 'descripcion'),
        cantidad: valor(formData, 'cantidad'),
        depositoId: valor(formData, 'depositoId'),
        precioUnitario: normalizarNumero(valor(formData, 'precioUnitario') || '0'),
        alicuotaIva: valor(formData, 'alicuotaIva') || undefined,
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return r.avisos.length ? { aviso: `Cargado. ${r.avisos.join(' ')}` } : { ok: 'Cargado.' }
}

export async function quitarItemAccion(ordenId: string, itemId: string) {
  const r = await intentar(() => enLaEmpresa('servicio.cargar', (tx, s) => quitarItem(tx, s.usuario.id, itemId)))
  refrescar(ordenId)
  if (!r.ok) redirect(`/servicio/${ordenId}?error=${encodeURIComponent(r.error)}`)
}

// ------------------------------------------------------- Técnico en campo

export async function llegadaAccion(id: string, ubicacion: { lat: number | null; lng: number | null }) {
  const r = await intentar(() =>
    enLaEmpresa('servicio.trabajar', async (tx, s) => {
      const no = await ajena(tx, s, id)
      if (no) return no
      return registrarLlegada(tx, s.usuario.id, id, ubicacion)
    }),
  )
  refrescar(id)
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
}

export async function subirArchivoAccion(ordenId: string, clase: 'foto' | 'firma', formData: FormData) {
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return { ok: false as const, error: 'Elegí la imagen.' }
  if (clase !== 'foto' && clase !== 'firma') return { ok: false as const, error: 'Archivo inválido.' }
  const datos = Buffer.from(await archivo.arrayBuffer())
  const r = await intentar(() =>
    enLaEmpresa('servicio.trabajar', async (tx, s) => {
      const no = await ajena(tx, s, ordenId)
      if (no) return no
      return guardarArchivo(tx, s.usuario.id, ordenId, clase, datos)
    }),
  )
  return r.ok ? { ok: true as const, id: r.id } : { ok: false as const, error: r.error }
}

export async function quitarArchivoAccion(ordenId: string, archivoId: string) {
  return intentar(() =>
    enLaEmpresa('servicio.trabajar', async (tx, s) => {
      const no = await ajena(tx, s, ordenId)
      if (no) return no
      return quitarArchivo(tx, ordenId, archivoId)
    }),
  )
}

/** Devolución del técnico: el formulario del tipo de orden, el resumen y cómo quedó. */
export async function informarAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.trabajar', async (tx, s) => {
      const no = await ajena(tx, s, id)
      if (no) return no
      return informarOrden(tx, s.usuario.id, id, {
        fecha: valor(formData, 'fecha') || hoyArgentina(),
        solucion: valor(formData, 'solucion'),
        cierre: valor(formData, 'cierre'),
        resultados: json(formData, 'resultados'),
      })
    }),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  redirect(`/tecnico?enviada=${id}`)
}

// ------------------------------------------------------ Supervisor y cierre

export async function cerrarAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) =>
      cerrarOrden(tx, s.usuario.id, id, {
        fecha: valor(formData, 'fecha'),
        cierre: valor(formData, 'cierre'),
        nota: valor(formData, 'nota'),
        contador: valor(formData, 'contador'),
        creditos: valor(formData, 'creditos') || '0',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: 'Orden cerrada.' }
}

export async function reabrirAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('servicio.cargar', (tx, s) => reabrirOrden(tx, s.usuario.id, id)))
  refrescar(id)
  if (!r.ok) redirect(`/servicio/${id}?error=${encodeURIComponent(r.error)}`)
}

export async function cancelarAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) => cancelarOrden(tx, s.usuario.id, id, valor(formData, 'motivo'))),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: 'Orden cancelada.' }
}

export async function facturarAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.facturar', async (tx, s) => {
      // Quien factura la orden tiene que poder facturar.
      if (!tienePermiso(s.permisos, 'ventas.facturar')) {
        return { ok: false as const, error: 'Para facturar la orden hace falta el permiso de emitir facturas.' }
      }
      return facturarOrden(tx, s.usuario.id, id, { puntoVenta: valor(formData, 'puntoVenta'), fecha: valor(formData, 'fecha') })
    }),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  redirect(`/facturas/${r.comprobanteId}`)
}

// ------------------------------------------------- Tipos de orden y preventivo

export async function guardarTipoAccion(id: string | null, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.configurar', (tx, s) =>
      guardarTipo(
        tx,
        s.usuario.id,
        {
          codigo: valor(formData, 'codigo'),
          nombre: valor(formData, 'nombre'),
          clase: valor(formData, 'clase'),
          color: valor(formData, 'color') || undefined,
          duracion: valor(formData, 'duracion'),
          plazoHoras: valor(formData, 'plazoHoras'),
          activo: formData.get('activo') !== null ? formData.get('activo') === 'on' : true,
          instrucciones: json(formData, 'instruccionesDef'),
          devolucion: json(formData, 'devolucionDef'),
        },
        id ?? undefined,
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/servicio/tipos')
  return { ok: `Guardado (formularios en la versión ${r.version}).` }
}

export async function crearModelosAccion() {
  const r = await intentar(() =>
    enLaEmpresa('servicio.configurar', async (tx, s) => ({ ok: true as const, creados: await crearModelos(tx, s.usuario.id) })),
  )
  revalidatePath('/servicio/tipos')
  if (!r.ok) redirect(`/servicio/tipos?error=${encodeURIComponent(r.error)}`)
  redirect(`/servicio/tipos?creados=${r.creados.length}`)
}

export async function guardarReglaAccion(id: string | null, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) =>
      guardarRegla(
        tx,
        s.usuario.id,
        {
          ...Object.fromEntries(
            ['terceroId', 'equipoId', 'tipoOrdenId', 'frecuencia', 'cada', 'desde', 'hora', 'tecnicoId', 'observaciones'].map(
              (k) => [k, valor(formData, k)],
            ),
          ),
          cada: valor(formData, 'cada').replace(/\./g, ''),
          activa: formData.get('activa') !== null ? formData.get('activa') === 'on' : true,
        },
        id ?? undefined,
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/servicio/preventivos')
  return { ok: 'Regla guardada.' }
}

export async function generarPreventivosAccion() {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', async (tx, s) => ({ ok: true as const, ...(await generarPreventivos(tx, s.usuario.id)) })),
  )
  revalidatePath('/servicio')
  revalidatePath('/servicio/calendario')
  if (!r.ok) redirect(`/servicio/preventivos?error=${encodeURIComponent(r.error)}`)
  redirect(
    `/servicio/preventivos?generadas=${r.creadas}${r.errores.length ? `&error=${encodeURIComponent(r.errores.join(' '))}` : ''}`,
  )
}

export async function pausarReglaAccion(id: string, activa: boolean) {
  await intentar(() => enLaEmpresa('servicio.cargar', (tx, s) => pausarRegla(tx, s.usuario.id, id, activa)))
  revalidatePath('/servicio/preventivos')
}
