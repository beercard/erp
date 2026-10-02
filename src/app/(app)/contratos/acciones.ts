'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { SinPermiso } from '@/lib/auth/servidor'
import { leerCsv } from '@/lib/csv'
import { normalizarNumero } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import {
  asignarEquipo,
  guardarContrato,
  guardarEquipo,
  importarLecturas,
  interpretarLecturas,
  registrarLectura,
  retirarEquipo,
} from '@/modulos/contratos/contratos'
import { anularFacturacion, generarFacturas, prepararMes } from '@/modulos/contratos/facturacion'
import { cotizacionVigente } from '@/modulos/comercial/cotizacion'

import { enContratos } from './modulo'

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const valor = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const numero = (f: FormData, k: string) => normalizarNumero(valor(f, k) || '0')

export type Estado = { error?: string; ok?: string } | undefined

// ---------------------------------------------------------------- Contratos

export async function guardarContratoAccion(id: string | null, _: Estado, formData: FormData): Promise<Estado> {
  const datos = {
    terceroId: valor(formData, 'terceroId'),
    tipo: valor(formData, 'tipo'),
    modalidad: valor(formData, 'modalidad'),
    facturacion: valor(formData, 'facturacion'),
    moneda: valor(formData, 'moneda'),
    cargoFijo: numero(formData, 'cargoFijo'),
    copiasLibres: valor(formData, 'copiasLibres') || '0',
    precioExcedente: numero(formData, 'precioExcedente'),
    porEquipo: formData.get('porEquipo') === 'on',
    alicuotaIva: valor(formData, 'alicuotaIva') || '5',
    leyenda: valor(formData, 'leyenda'),
    desde: valor(formData, 'desde'),
    hasta: valor(formData, 'hasta'),
    estado: valor(formData, 'estado') || 'activo',
    slaRespuestaHoras: valor(formData, 'slaRespuestaHoras') || null,
    slaResolucionHoras: valor(formData, 'slaResolucionHoras') || null,
    observaciones: valor(formData, 'observaciones'),
  }
  const r = await intentar(() =>
    enContratos('contratos.editar', (tx, s) => guardarContrato(tx, s.usuario.id, datos, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/contratos')
  redirect(`/contratos/${r.id}?guardado=1`)
}

export async function asignarEquipoAccion(contratoId: string, _: Estado, formData: FormData): Promise<Estado> {
  const equipoId = valor(formData, 'equipoId')
  if (!equipoId) return { error: 'Elegí el equipo.' }
  const r = await intentar(() =>
    enContratos('contratos.editar', (tx, s) => asignarEquipo(tx, s.usuario.id, equipoId, contratoId)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/contratos/${contratoId}`)
  return { ok: 'Equipo agregado al contrato.' }
}

export async function quitarEquipoAccion(contratoId: string, equipoId: string) {
  const r = await intentar(() => enContratos('contratos.editar', (tx, s) => asignarEquipo(tx, s.usuario.id, equipoId, null)))
  revalidatePath(`/contratos/${contratoId}`)
  if (!r.ok) redirect(`/contratos/${contratoId}?error=${encodeURIComponent(r.error)}`)
}

// ------------------------------------------------------------------ Equipos

export async function guardarEquipoAccion(id: string | null, _: Estado, formData: FormData): Promise<Estado> {
  const datos = Object.fromEntries(
    [
      'serie',
      'modeloId',
      'terceroId',
      'contratoId',
      'comercializacion',
      'fechaInstalacion',
      'garantiaHasta',
      'domicilio',
      'localidad',
      'sector',
      'contacto',
      'telefono',
      'horario',
      'ip',
      'tecnico',
      'observaciones',
    ].map((k) => [k, valor(formData, k)]),
  )
  const r = await intentar(() =>
    enContratos('contratos.editar', (tx, s) =>
      guardarEquipo(
        tx,
        s.usuario.id,
        { ...datos, serie: datos.serie.toUpperCase(), contadorInicial: valor(formData, 'contadorInicial') || '0' },
        id ?? undefined,
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/equipos')
  redirect(`/equipos/${r.id}?guardado=1`)
}

export async function retirarEquipoAccion(id: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enContratos('contratos.editar', (tx, s) =>
      retirarEquipo(tx, s.usuario.id, id, valor(formData, 'fecha') || hoyArgentina(), valor(formData, 'motivo') || null),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/equipos/${id}`)
  return { ok: 'Equipo retirado.' }
}

// ----------------------------------------------------------------- Lecturas

export async function lecturaAccion(equipoId: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enContratos('contratos.lecturas', (tx, s) =>
      registrarLectura(tx, s.usuario.id, {
        equipoId,
        fecha: valor(formData, 'fecha'),
        contador: valor(formData, 'contador').replace(/\./g, ''),
        creditos: valor(formData, 'creditos') || '0',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/equipos/${equipoId}`)
  return { ok: 'Lectura cargada.' }
}

/** Carga de la planilla de lecturas: una fila por equipo con contador. */
export async function lecturasAccion(_: Estado, formData: FormData): Promise<Estado> {
  const fecha = valor(formData, 'fecha')
  const filas = [...formData.entries()]
    .filter(([k, v]) => k.startsWith('contador:') && String(v).trim())
    .map(([k, v]) => ({
      equipoId: k.slice('contador:'.length),
      contador: String(v).replace(/\./g, '').trim(),
      creditos: valor(formData, `creditos:${k.slice('contador:'.length)}`) || '0',
    }))
  if (!filas.length) return { error: 'No cargaste ningún contador.' }
  const r = await intentar(() =>
    enContratos('contratos.lecturas', async (tx, s) => {
      const errores: string[] = []
      for (const f of filas) {
        const x = await registrarLectura(tx, s.usuario.id, { ...f, fecha })
        if (!x.ok) errores.push(x.error)
      }
      return { ok: true as const, errores }
    }),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/contratos/lecturas')
  const cargadas = filas.length - r.errores.length
  return r.errores.length
    ? { error: `Se cargaron ${cargadas} de ${filas.length}. ${r.errores.join(' ')}` }
    : { ok: `${cargadas} lecturas cargadas.` }
}

export async function importarLecturasAccion(_: Estado, formData: FormData): Promise<Estado> {
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Elegí el archivo.' }
  const texto = await archivo.text()
  const primera = texto.split(/\r?\n/, 1)[0] ?? ''
  const separador = primera.includes(';') ? ';' : primera.includes('\t') ? '\t' : ','
  const { filas, errores } = interpretarLecturas(leerCsv(texto, separador), valor(formData, 'fecha') || hoyArgentina())
  if (!filas.length) return { error: errores.join(' ') || 'No hay lecturas en el archivo.' }
  const r = await intentar(() => enContratos('contratos.lecturas', (tx, s) => importarLecturas(tx, s.usuario.id, filas)))
  if ('ok' in r && r.ok === false) return { error: r.error }
  const res = r as { cargadas: number; errores: string[] }
  revalidatePath('/contratos/lecturas')
  const todos = [...errores, ...res.errores]
  return todos.length
    ? {
        error: `Se cargaron ${res.cargadas} lecturas. Con problemas: ${todos.slice(0, 15).join(' ')}${todos.length > 15 ? ` (y ${todos.length - 15} más)` : ''}`,
      }
    : { ok: `${res.cargadas} lecturas cargadas.` }
}

// -------------------------------------------------------------- Facturación

export async function prepararMesAccion(periodo: string, cotizacion: string) {
  return intentar(() =>
    enContratos('contratos.ver', async (tx) => ({
      ok: true as const,
      filas: await prepararMes(tx, periodo, normalizarNumero(cotizacion)),
    })),
  )
}

export async function cotizacionAccion(fecha: string) {
  return intentar(() =>
    enContratos('contratos.ver', async (tx) => ({ ok: true as const, cotizacion: await cotizacionVigente(tx, 'DOL', fecha) })),
  )
}

export async function facturarAccion(datos: {
  periodo: string
  contratoIds: string[]
  puntoVenta: number
  fecha: string
  cotizacion: string
}) {
  const r = await intentar(() =>
    enContratos('contratos.facturar', async (tx, s) => ({
      ok: true as const,
      ...(await generarFacturas(tx, s.usuario.id, { ...datos, cotizacion: normalizarNumero(datos.cotizacion) })),
    })),
  )
  revalidatePath('/contratos')
  revalidatePath('/facturas')
  return r
}

export async function anularFacturacionAccion(contratoId: string, id: string) {
  const r = await intentar(() => enContratos('contratos.facturar', (tx, s) => anularFacturacion(tx, s.usuario.id, id)))
  revalidatePath(`/contratos/${contratoId}`)
  if (!r.ok) redirect(`/contratos/${contratoId}?error=${encodeURIComponent(r.error)}`)
}
