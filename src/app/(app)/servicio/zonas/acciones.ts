'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { geocodificar } from '@/modulos/servicio/mapa'
import { asignarZonas, borrarZona, guardarZona } from '@/modulos/servicio/zonas'

export type Estado = { ok?: string; error?: string } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const v = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const num = (s: string) => Number(s.replace(',', '.'))

/** Alta de una zona: con latitud y longitud, o buscando la dirección del centro en el mapa. */
export async function guardarZonaAccion(_: Estado, fd: FormData): Promise<Estado> {
  let lat = num(v(fd, 'lat'))
  let lng = num(v(fd, 'lng'))
  if (!v(fd, 'lat') || !v(fd, 'lng')) {
    if (!v(fd, 'direccion')) return { error: 'Escribí la dirección del centro o su latitud y longitud.' }
    const p = await geocodificar(v(fd, 'direccion')).catch(() => null)
    if (!p) return { error: 'No encontré esa dirección: probá con calle, número y ciudad, o pegá la latitud y la longitud.' }
    ;({ lat, lng } = p)
  }
  const r = await intentar(() =>
    enLaEmpresa('servicio.configurar', (tx, s) =>
      guardarZona(tx, s.usuario.id, { nombre: v(fd, 'nombre'), lat, lng, radioKm: num(v(fd, 'radioKm')) }),
    ),
  )
  revalidatePath('/servicio/zonas')
  return r.ok ? { ok: 'Zona agregada.' } : { error: r.error }
}

export async function borrarZonaAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('servicio.configurar', (tx, s) => borrarZona(tx, s.usuario.id, id)))
  revalidatePath('/servicio/zonas')
  return r
}

export async function zonasTecnicoAccion(tecnicoId: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.configurar', (tx, s) => asignarZonas(tx, s.usuario.id, tecnicoId, fd.getAll('zona').map(String))),
  )
  revalidatePath('/servicio/zonas')
  return r.ok ? { ok: 'Guardado.' } : { error: r.error }
}
