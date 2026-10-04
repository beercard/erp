'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { leerPlanillaSubida } from '@/lib/planillaSubida'
import {
  contarArticulos,
  contarTerceros,
  type ErrorFila,
  importarArticulos,
  importarSaldos,
  importarTerceros,
  leerArticulos,
  leerSaldos,
  leerTerceros,
} from '@/modulos/importacion/planillas'

import { esTipoImportacion, IMPORTACIONES, type TipoImportacion } from './tipos'

export type Vista = {
  error?: string
  nombre?: string
  registros?: Record<string, string>[]
  validas?: number
  altas?: number
  actualizaciones?: number
  errores?: ErrorFila[]
}

async function conPermiso<T>(tipo: TipoImportacion, trabajo: Parameters<typeof enLaEmpresa<T>>[1]) {
  try {
    return { ok: true as const, valor: await enLaEmpresa(IMPORTACIONES[tipo].permiso, trabajo) }
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message }
    throw e
  }
}

/** Lee la planilla y cuenta qué se daría de alta y qué se actualizaría. No guarda nada. */
export async function leerImportacionAccion(tipo: string, _: Vista | undefined, fd: FormData): Promise<Vista> {
  if (!esTipoImportacion(tipo)) return { error: 'Importación desconocida.' }
  const l = await leerPlanillaSubida(fd.get('planilla'))
  if (!l.ok) return { error: l.error }
  const r = await conPermiso(tipo, async (tx) => {
    if (tipo === 'terceros') {
      const lectura = leerTerceros(l.registros)
      return { lectura, ...(await contarTerceros(tx, lectura)) }
    }
    if (tipo === 'articulos') {
      const lectura = leerArticulos(l.registros)
      return { lectura, ...(await contarArticulos(tx, lectura)) }
    }
    const lectura = leerSaldos(l.registros)
    return { lectura, altas: lectura.filas.length, actualizaciones: 0 }
  })
  if (!r.ok) return { error: r.error }
  const { lectura, altas, actualizaciones } = r.valor
  return {
    nombre: l.nombre,
    registros: l.registros,
    validas: lectura.filas.length,
    altas,
    actualizaciones,
    errores: lectura.errores,
  }
}

/** Importa: vuelve a validar todo en el servidor (no se confía en lo que manda el navegador). */
export async function importarAccion(
  tipo: string,
  registros: Record<string, string>[],
): Promise<{ error?: string; altas?: number; actualizados?: number; errores?: ErrorFila[] }> {
  if (!esTipoImportacion(tipo)) return { error: 'Importación desconocida.' }
  if (!Array.isArray(registros) || registros.length > 2000) return { error: 'Van hasta 2.000 filas por planilla.' }
  const r = await conPermiso(tipo, (tx, s) =>
    tipo === 'terceros'
      ? importarTerceros(tx, s.usuario.id, leerTerceros(registros))
      : tipo === 'articulos'
        ? importarArticulos(tx, s.usuario.id, leerArticulos(registros))
        : importarSaldos(tx, s.usuario.id, leerSaldos(registros)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/terceros')
  revalidatePath('/articulos')
  return r.valor
}
