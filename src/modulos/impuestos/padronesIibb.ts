import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { padronIibb, retencionesConfiguracion, terceros } from '../../db/schema'

/**
 * Padrones de Ingresos Brutos. Cada provincia publica, por lo general una
 * vez por mes, la alícuota de percepción y de retención de cada CUIT. Los
 * archivos son enormes (millones de renglones): se leen de corrido y se
 * guardan solo los CUIT de clientes y proveedores de la empresa.
 *
 * Formatos:
 * - ARBA (Buenos Aires), régimen general: un archivo de percepción y otro de
 *   retención, separados por ";": régimen (P/R); publicación; vigencia
 *   desde; vigencia hasta (DDMMAAAA); CUIT; tipo; marca de alta; marca de
 *   cambio; alícuota ("3,00"); grupo.
 * - AGIP (Ciudad de Buenos Aires), padrón de regímenes generales: publicación;
 *   desde; hasta; CUIT; tipo; marca de alta; marca de cambio; alícuota de
 *   percepción; alícuota de retención; grupo de percepción; grupo de
 *   retención; razón social.
 * - Genérico (Santa Fe, Córdoba y las demás): CUIT; alícuota de percepción;
 *   alícuota de retención, separados por ";", tabulación o "," (con coma, los
 *   decimales van con punto); la provincia y la
 *   vigencia se eligen al importar.
 */

export const FORMATOS_PADRON = {
  arba: { nombre: 'ARBA (Buenos Aires): percepción o retención', provincia: 'B' },
  agip: { nombre: 'AGIP (Ciudad de Buenos Aires): regímenes generales', provincia: 'C' },
  generico: { nombre: 'Otra provincia (CUIT; percepción; retención)', provincia: null },
} as const
export type FormatoPadron = keyof typeof FORMATOS_PADRON

export type FilaPadron = {
  provincia: string
  cuit: string
  desde: string
  hasta: string
  percepcion: string | null
  retencion: string | null
  grupoPercepcion: string | null
  grupoRetencion: string | null
}

/** DDMMAAAA → AAAA-MM-DD. */
const fecha = (v: string) => {
  const d = v.trim()
  return /^\d{8}$/.test(d) ? `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : null
}
/** "3,00" → "3.00"; vacío → null. */
const alicuota = (v: string | undefined) => {
  const a = (v ?? '').trim().replace(',', '.')
  return a && Number.isFinite(Number(a)) ? a : null
}
const soloCuit = (v: string | undefined) => {
  const c = (v ?? '').replace(/\D/g, '')
  return c.length === 11 ? c : null
}

/** Interpreta un renglón; null si no es un renglón de datos. */
export function leerRenglon(
  formato: FormatoPadron,
  renglon: string,
  o: { provincia?: string; desde?: string; hasta?: string } = {},
): FilaPadron | null {
  // En el genérico, la coma separa campos solo si no hay ";" ni tabulaciones (si no, es la coma decimal).
  const c = renglon.split(formato !== 'generico' ? ';' : /[;\t]/.test(renglon) ? /[;\t]/ : ',')
  if (formato === 'arba') {
    const regimen = c[0]?.trim().toUpperCase()
    const cuit = soloCuit(c[4])
    const desde = fecha(c[2] ?? '')
    const hasta = fecha(c[3] ?? '')
    if ((regimen !== 'P' && regimen !== 'R') || !cuit || !desde || !hasta) return null
    const a = alicuota(c[8])
    return {
      provincia: 'B',
      cuit,
      desde,
      hasta,
      percepcion: regimen === 'P' ? a : null,
      retencion: regimen === 'R' ? a : null,
      grupoPercepcion: regimen === 'P' ? c[9]?.trim() || null : null,
      grupoRetencion: regimen === 'R' ? c[9]?.trim() || null : null,
    }
  }
  if (formato === 'agip') {
    const cuit = soloCuit(c[3])
    const desde = fecha(c[1] ?? '')
    const hasta = fecha(c[2] ?? '')
    if (!cuit || !desde || !hasta) return null
    return {
      provincia: 'C',
      cuit,
      desde,
      hasta,
      percepcion: alicuota(c[7]),
      retencion: alicuota(c[8]),
      grupoPercepcion: c[9]?.trim() || null,
      grupoRetencion: c[10]?.trim() || null,
    }
  }
  const cuit = soloCuit(c[0])
  if (!cuit || !o.provincia || !o.desde || !o.hasta) return null
  return {
    provincia: o.provincia,
    cuit,
    desde: o.desde,
    hasta: o.hasta,
    percepcion: alicuota(c[1]),
    retencion: alicuota(c[2]),
    grupoPercepcion: null,
    grupoRetencion: null,
  }
}

/** Los CUIT de clientes y proveedores (los únicos que interesan del padrón). */
export async function cuitsDeTerceros(tx: Transaccion) {
  const filas = await tx
    .select({ cuit: terceros.numeroDocumento })
    .from(terceros)
    .where(and(eq(terceros.tipoDocumento, 80), eq(terceros.activo, true)))
  return new Set(filas.map((f) => (f.cuit ?? '').replace(/\D/g, '')).filter((c) => c.length === 11))
}

/** Separa en renglones un flujo de texto que llega en pedazos. */
export async function* renglones(trozos: AsyncIterable<string>) {
  let resto = ''
  for await (const t of trozos) {
    const partes = (resto + t).split(/\r?\n/)
    resto = partes.pop() ?? ''
    yield* partes
  }
  if (resto) yield resto
}

/** Guarda filas del padrón: la de la misma provincia, CUIT y vigencia se completa (percepción y retención vienen en archivos distintos). */
export async function guardarFilas(tx: Transaccion, filas: FilaPadron[], origen: 'archivo' | 'servicio') {
  for (let i = 0; i < filas.length; i += 500) {
    await tx
      .insert(padronIibb)
      .values(filas.slice(i, i + 500).map((f) => ({ ...f, origen })))
      .onConflictDoUpdate({
        target: [padronIibb.empresaId, padronIibb.provincia, padronIibb.cuit, padronIibb.desde],
        set: {
          hasta: sql`excluded.hasta`,
          percepcion: sql`coalesce(excluded.percepcion, ${padronIibb.percepcion})`,
          retencion: sql`coalesce(excluded.retencion, ${padronIibb.retencion})`,
          grupoPercepcion: sql`coalesce(excluded.grupo_percepcion, ${padronIibb.grupoPercepcion})`,
          grupoRetencion: sql`coalesce(excluded.grupo_retencion, ${padronIibb.grupoRetencion})`,
          origen: sql`excluded.origen`,
          creado: new Date(),
        },
      })
  }
}

/** Lee el archivo de corrido y guarda los renglones de CUIT propios. */
export async function importarPadron(
  empresaId: string,
  formato: FormatoPadron,
  lineas: AsyncIterable<string> | Iterable<string>,
  o: { provincia?: string; desde?: string; hasta?: string } = {},
) {
  if (formato === 'generico' && (!o.provincia || !o.desde || !o.hasta || o.hasta < o.desde)) {
    return { ok: false as const, error: 'Elegí la provincia y la vigencia del padrón.' }
  }
  const propios = await conEmpresa(empresaId, (tx) => cuitsDeTerceros(tx))
  if (!propios.size) return { ok: false as const, error: 'No hay clientes ni proveedores con CUIT para buscar en el padrón.' }
  let leidos = 0
  const filas = new Map<string, FilaPadron>()
  for await (const l of lineas) {
    const f = leerRenglon(formato, l, o)
    if (!f) continue
    leidos++
    if (!propios.has(f.cuit)) continue
    const k = `${f.provincia}|${f.cuit}|${f.desde}`
    const previa = filas.get(k)
    filas.set(
      k,
      previa
        ? {
            ...previa,
            percepcion: f.percepcion ?? previa.percepcion,
            retencion: f.retencion ?? previa.retencion,
            grupoPercepcion: f.grupoPercepcion ?? previa.grupoPercepcion,
            grupoRetencion: f.grupoRetencion ?? previa.grupoRetencion,
          }
        : f,
    )
  }
  if (!leidos) return { ok: false as const, error: 'El archivo no tiene renglones con el formato elegido.' }
  const lista = [...filas.values()]
  await conEmpresa(empresaId, (tx) => guardarFilas(tx, lista, 'archivo'))
  const vigencias = lista.map((f) => f.desde).sort()
  return {
    ok: true as const,
    leidos,
    guardados: lista.length,
    desde: vigencias[0] ?? null,
    hasta:
      lista
        .map((f) => f.hasta)
        .sort()
        .at(-1) ?? null,
  }
}

/** Lo que dice el padrón de un CUIT en una fecha, por provincia (la vigencia más nueva). */
export async function alicuotasPadron(tx: Transaccion, cuit: string, fecha: string) {
  const filas = await tx
    .select()
    .from(padronIibb)
    .where(and(eq(padronIibb.cuit, cuit.replace(/\D/g, '')), lte(padronIibb.desde, fecha), gte(padronIibb.hasta, fecha)))
    .orderBy(desc(padronIibb.desde))
  const porProvincia: Record<string, { percepcion: string | null; retencion: string | null }> = {}
  for (const f of filas) porProvincia[f.provincia] ??= { percepcion: f.percepcion, retencion: f.retencion }
  return porProvincia
}

/** Resumen por provincia y vigencia, para la pantalla. */
export async function resumenPadrones(tx: Transaccion) {
  return tx
    .select({
      provincia: padronIibb.provincia,
      desde: padronIibb.desde,
      hasta: padronIibb.hasta,
      origen: padronIibb.origen,
      cuits: sql<number>`count(*)::int`,
      actualizado: sql<Date>`max(${padronIibb.creado})`,
    })
    .from(padronIibb)
    .groupBy(padronIibb.provincia, padronIibb.desde, padronIibb.hasta, padronIibb.origen)
    .orderBy(desc(padronIibb.desde), padronIibb.provincia)
    .limit(24)
}

// ------------------------------------------------------- Retención al pagar

const esquemaRetencion = z.object({
  activa: z.boolean(),
  provincia: z.string().trim().max(2).nullable(),
  minimo: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'El mínimo es un importe.')
    .default('0'),
  alicuotaGeneral: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,4})?$/, 'La alícuota general es un porcentaje (ej. 2,5).')
    .nullable(),
})

/** Agente de retención de IIBB: en qué provincia, desde qué base y con qué alícuota a los que no están en el padrón. */
export async function configurarRetencionIibb(tx: Transaccion, entrada: unknown) {
  const p = esquemaRetencion.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const d = p.data
  if (d.activa && !d.provincia)
    return { ok: false as const, error: 'Elegí la provincia en la que la empresa es agente de retención.' }
  const valores = {
    iibbActiva: d.activa,
    iibbProvincia: d.provincia || null,
    iibbMinimo: d.minimo,
    iibbAlicuotaGeneral: d.alicuotaGeneral || null,
  }
  const [actual] = await tx.select().from(retencionesConfiguracion)
  if (actual) await tx.update(retencionesConfiguracion).set(valores).where(eq(retencionesConfiguracion.id, actual.id))
  else await tx.insert(retencionesConfiguracion).values(valores)
  return { ok: true as const }
}
