'use server'

import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { terceros } from '@/db/schema'
import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { normalizarNumero } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { cotizacionVigente } from '@/modulos/comercial/cotizacion'
import {
  agregarItem,
  articulosParaOrden,
  asignarOrden,
  cancelarOrden,
  equiposDelCliente,
  facturarOrden,
  guardarOrden,
  quitarItem,
  reabrirOrden,
  registrarVisita,
  resolverOrden,
} from '@/modulos/servicio/servicio'

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
  revalidatePath('/servicio')
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
  if (typeof texto !== 'string' || texto.length > 80) return []
  return enLaEmpresa('servicio.ver', async (tx) => {
    const dolar = await cotizacionVigente(tx, 'DOL', hoyArgentina())
    return articulosParaOrden(tx, ordenId, texto, dolar?.valor ?? null)
  })
}

// ---------------------------------------------------------------- Órdenes

export async function guardarOrdenAccion(id: string | null, _: Estado, formData: FormData): Promise<Estado> {
  const datos = Object.fromEntries(
    [
      'fecha',
      'terceroId',
      'equipoId',
      'tipo',
      'prioridad',
      'falla',
      'contacto',
      'telefono',
      'domicilio',
      'tecnicoId',
      'programada',
      'cobertura',
      'observaciones',
    ].map((k) => [k, valor(formData, k)]),
  )
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) => guardarOrden(tx, s.usuario.id, datos, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error }
  refrescar(r.id)
  redirect(`/servicio/${r.id}${id ? '?guardada=1' : ''}`)
}

export async function asignarAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) =>
      asignarOrden(tx, s.usuario.id, id, { tecnicoId: valor(formData, 'tecnicoId'), programada: valor(formData, 'programada') }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: 'Asignación guardada.' }
}

export async function visitaAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.trabajar', (tx, s) =>
      registrarVisita(tx, s.usuario.id, id, {
        fecha: valor(formData, 'fecha'),
        tecnicoId: valor(formData, 'tecnicoId'),
        horas: valor(formData, 'horas') || '0',
        detalle: valor(formData, 'detalle'),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: 'Visita cargada.' }
}

export async function itemAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.trabajar', (tx, s) =>
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
  const r = await intentar(() => enLaEmpresa('servicio.trabajar', (tx, s) => quitarItem(tx, s.usuario.id, itemId)))
  refrescar(ordenId)
  if (!r.ok) redirect(`/servicio/${ordenId}?error=${encodeURIComponent(r.error)}`)
}

export async function resolverAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.trabajar', (tx, s) =>
      resolverOrden(tx, s.usuario.id, id, {
        fecha: valor(formData, 'fecha'),
        solucion: valor(formData, 'solucion'),
        contador: valor(formData, 'contador'),
        creditos: valor(formData, 'creditos') || '0',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  refrescar(id)
  return { ok: 'Orden resuelta.' }
}

export async function reabrirAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('servicio.trabajar', (tx, s) => reabrirOrden(tx, s.usuario.id, id)))
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
