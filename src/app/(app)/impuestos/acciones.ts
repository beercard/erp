'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { leerMisComprobantes, registrarFaltantes, type FilaArca } from '@/modulos/compras/misComprobantes'
import { cruceCompras, type ResultadoCruce } from '@/modulos/impuestos/cruceArca'
import { guardarSaldosIniciales } from '@/modulos/impuestos/posicionIva'
import { marcarPresentada, reabrirPeriodo } from '@/modulos/impuestos/presentaciones'

export type Estado = { error?: string; ok?: string } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

export async function presentadaAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('impuestos.libros', (tx, s) =>
      marcarPresentada(tx, s.usuario.id, id, { transaccion: String(fd.get('transaccion') ?? '') }),
    ),
  )
  revalidatePath('/impuestos', 'layout')
  return r.ok ? { ok: 'Marcada como presentada: el período quedó cerrado.' } : { error: r.error }
}

export async function reabrirAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('impuestos.libros', (tx, s) => reabrirPeriodo(tx, s.usuario.id, id, String(fd.get('motivo') ?? ''))),
  )
  revalidatePath('/impuestos', 'layout')
  return r.ok ? { ok: 'Período reabierto. La próxima descarga es la rectificativa.' } : { error: r.error }
}

const importe = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim()
  if (!s) return 0
  // "1.234,56" o "1234.56"
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : NaN
}

export async function saldosInicialesAccion(periodo: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('impuestos.libros', (tx, s) =>
      guardarSaldosIniciales(tx, s.usuario.id, periodo, importe(fd.get('tecnico')), importe(fd.get('libre'))),
    ),
  )
  revalidatePath('/impuestos/iva')
  return r.ok ? { ok: 'Saldos guardados.' } : { error: r.error }
}

// ---------------------------------------------------------------- Cruce con Mis Comprobantes

export type EstadoCruce =
  { error: string } | { filas: FilaArca[]; cruce: ResultadoCruce; avisos: string[]; registrados?: number } | undefined

export async function cruzarArcaAccion(periodo: string, _: EstadoCruce, fd: FormData): Promise<EstadoCruce> {
  const archivo = fd.get('archivo')
  if (!(archivo instanceof File) || !archivo.size)
    return { error: 'Elegí el archivo que bajaste de Mis Comprobantes (recibidos).' }
  if (archivo.size > 15 * 1024 * 1024) return { error: 'El archivo es demasiado grande (más de 15 MB).' }
  let lectura: Awaited<ReturnType<typeof leerMisComprobantes>>
  try {
    lectura = await leerMisComprobantes(new Uint8Array(await archivo.arrayBuffer()))
  } catch (e) {
    return { error: `No se pudo leer el archivo: ${(e as Error).message}` }
  }
  if (!lectura.filas.length) return { error: lectura.errores[0] ?? 'El archivo no tiene comprobantes.' }
  const r = await intentar(() => enLaEmpresa('impuestos.libros', (tx) => cruceCompras(tx, periodo, lectura.filas)))
  if ('ok' in r) return { error: r.error }
  return { filas: lectura.filas, cruce: r, avisos: lectura.errores }
}

/** Registra los comprobantes que ARCA tiene y faltan (como en Compras › Importar). */
export async function registrarFaltantesIvaAccion(periodo: string, filas: FilaArca[]): Promise<EstadoCruce> {
  if (!Array.isArray(filas) || !filas.length) return { error: 'No hay comprobantes para registrar.' }
  const r = await intentar(() =>
    enLaEmpresa('compras.cargar', async (tx, s) => {
      const faltan = (await cruceCompras(tx, periodo, filas)).faltan
      const resultado = await registrarFaltantes(tx, s.usuario.id, faltan)
      return { ok: true as const, ...resultado, cruce: await cruceCompras(tx, periodo, filas) }
    }),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/impuestos/iva')
  revalidatePath('/compras')
  return { filas, cruce: r.cruce, registrados: r.registrados, avisos: r.errores }
}
