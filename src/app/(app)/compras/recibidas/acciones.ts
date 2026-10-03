'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { descartarRecibida, procesarRecibida, registrarRecibida } from '@/modulos/compras/recibidas'
import { iaConfigurada } from '@/modulos/ia/claude'

export type EstadoRecibida = { error?: string; datos?: Record<string, unknown> } | undefined

async function intentar<T>(f: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const numero = (v: FormDataEntryValue | null) => {
  const t = String(v ?? '').trim()
  if (!t) return 0
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}
const entero = (v: FormDataEntryValue | null) => (String(v ?? '').trim() ? Math.trunc(Number(v)) : null)
const texto = (v: FormDataEntryValue | null) => String(v ?? '').trim() || null

/** Registra la compra con los datos revisados en la pantalla. */
export async function registrarAccion(id: string, _: EstadoRecibida, fd: FormData): Promise<EstadoRecibida> {
  const alicuotas = fd.getAll('alicuota')
  const bases = fd.getAll('base')
  const ivas = fd.getAll('importeIva')
  const tipos = fd.getAll('tributoTipo')
  const provincias = fd.getAll('tributoProvincia')
  const importes = fd.getAll('tributoImporte')
  const entrada = {
    esComprobante: true,
    letra: texto(fd.get('letra')),
    clase: texto(fd.get('clase')),
    fce: fd.has('fce'),
    puntoVenta: entero(fd.get('puntoVenta')),
    numero: entero(fd.get('numero')),
    fecha: texto(fd.get('fecha')),
    cae: texto(fd.get('cae')),
    cuitEmisor: texto(fd.get('cuitEmisor')),
    razonSocialEmisor: texto(fd.get('razonSocialEmisor')),
    cuitReceptor: null,
    moneda: fd.get('moneda') === 'DOL' ? 'DOL' : 'PES',
    cotizacion: numero(fd.get('cotizacion')) || null,
    iva: alicuotas
      .map((a, n) => ({ alicuota: numero(a), base: numero(bases[n]), importe: numero(ivas[n]) }))
      .filter((x) => x.base || x.importe),
    noGravado: numero(fd.get('noGravado')),
    exento: numero(fd.get('exento')),
    tributos: tipos
      .map((t, n) => ({ tipo: String(t), provincia: texto(provincias[n]), importe: numero(importes[n]) }))
      .filter((x) => x.importe > 0),
    total: numero(fd.get('total')),
    observaciones: null,
  }
  const r = await intentar(() => enLaEmpresa('compras.cargar', (tx, s) => registrarRecibida(tx, s.usuario.id, id, entrada)))
  // Con el error vuelve lo escrito, para no tener que cargarlo de nuevo.
  if (!r.ok) return { error: r.error, datos: entrada }
  revalidatePath('/compras', 'layout')
  redirect(`/compras/${r.id}`)
}

export async function descartarAccion(id: string) {
  await intentar(() => enLaEmpresa('compras.cargar', (tx, s) => descartarRecibida(tx, s.usuario.id, id)))
  revalidatePath('/compras/recibidas')
  redirect('/compras/recibidas')
}

export async function releerAccion(id: string) {
  const r = await intentar(() =>
    enLaEmpresa('compras.cargar', async (_tx, s) => ({ ok: true as const, empresaId: s.empresa.id, cuit: s.empresa.cuit })),
  )
  if (r.ok && iaConfigurada()) await procesarRecibida(r.empresaId, id, r.cuit)
  revalidatePath(`/compras/recibidas/${id}`)
}
