import { createHash } from 'node:crypto'

import { z } from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { arbaConfiguracion } from '../../db/schema'
import { validarCuit } from '../../lib/cuit'
import { cifrar, descifrar } from '../arca/certificado'
import { cuitsDeTerceros, guardarFilas, type FilaPadron } from './padronesIibb'

/**
 * ARBA (Provincia de Buenos Aires): consulta de alícuotas de percepción y
 * retención por CUIT (servicio del Domicilio Fiscal Electrónico) y
 * presentación de remitos para obtener el COT. Los dos se autentican con el
 * CUIT y la CIT, y reciben un archivo por POST multipart.
 */

type Fetch = typeof fetch

const URLS = {
  alicuotas: {
    produccion: 'https://dfe.arba.gov.ar/DomicilioElectronico/SeguridadCliente/dfeServicioConsulta.do',
    prueba: 'https://dfe.test.arba.gov.ar/DomicilioElectronico/SeguridadCliente/dfeServicioConsulta.do',
  },
  cot: {
    produccion: 'https://cot.arba.gov.ar/TransporteBienes/SeguridadCliente/presentarRemitos.do',
    prueba: 'https://cot.test.arba.gov.ar/TransporteBienes/SeguridadCliente/presentarRemitos.do',
  },
} as const

export type CredencialesArba = {
  usuario: string
  cit: string
  ambiente: 'prueba' | 'produccion'
  cotPlanta: string
  cotPuerta: string
}

// --------------------------------------------------------------- Configuración

export async function configuracionArba(tx: Transaccion) {
  const [c] = await tx.select().from(arbaConfiguracion)
  return c ? { usuario: c.usuario, ambiente: c.ambiente, cotPlanta: c.cotPlanta, cotPuerta: c.cotPuerta, tieneCit: true } : null
}

const esquema = z.object({
  usuario: z.string().refine((v) => validarCuit(v.replace(/\D/g, '')).valido, 'El usuario de ARBA es el CUIT (11 dígitos).'),
  cit: z.string().max(100).optional(),
  ambiente: z.enum(['prueba', 'produccion']),
  cotPlanta: z
    .string()
    .regex(/^\d{1,6}$/, 'La planta va con hasta 6 dígitos.')
    .default('0'),
  cotPuerta: z
    .string()
    .regex(/^\d{1,3}$/, 'La puerta va con hasta 3 dígitos.')
    .default('0'),
})

export async function guardarConfiguracionArba(tx: Transaccion, entrada: unknown) {
  const p = esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const [actual] = await tx.select().from(arbaConfiguracion)
  const cit = p.data.cit?.trim() ? cifrar(p.data.cit.trim()) : actual?.cit
  if (!cit) return { ok: false as const, error: 'Falta la CIT (Clave de Identificación Tributaria de ARBA).' }
  const valores = {
    usuario: p.data.usuario.replace(/\D/g, ''),
    cit,
    ambiente: p.data.ambiente,
    cotPlanta: p.data.cotPlanta.padStart(6, '0'),
    cotPuerta: p.data.cotPuerta.padStart(3, '0'),
  }
  await tx
    .insert(arbaConfiguracion)
    .values(valores)
    .onConflictDoUpdate({ target: arbaConfiguracion.empresaId, set: { ...valores, actualizado: new Date() } })
  return { ok: true as const }
}

export async function credencialesArba(tx: Transaccion): Promise<CredencialesArba | null> {
  const [c] = await tx.select().from(arbaConfiguracion)
  if (!c) return null
  return {
    usuario: c.usuario,
    cit: descifrar(c.cit),
    ambiente: c.ambiente as CredencialesArba['ambiente'],
    cotPlanta: c.cotPlanta,
    cotPuerta: c.cotPuerta,
  }
}

// ---------------------------------------------------------------- Envío y XML

/** Manda un archivo como lo esperan los servicios de ARBA: user, password y file. */
async function presentar(url: string, cred: CredencialesArba, nombre: string, contenido: string, tipo: string, f: Fetch) {
  const form = new FormData()
  form.set('user', cred.usuario)
  form.set('password', cred.cit)
  form.set('file', new Blob([Buffer.from(contenido, 'latin1')], { type: tipo }), nombre)
  const r = await f(url, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) })
  const texto = Buffer.from(await r.arrayBuffer()).toString('latin1')
  if (!r.ok) throw new Error(`ARBA respondió ${r.status}.`)
  return texto
}

const etiqueta = (xml: string, nombre: string) =>
  xml.match(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`))?.[1]?.trim() ?? null
const bloques = (xml: string, nombre: string) =>
  [...xml.matchAll(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`, 'g'))].map((m) => m[1])
const escapar = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** El error general de ARBA (credenciales, archivo mal armado), si vino. */
function errorArba(xml: string, raiz: string) {
  const e = etiqueta(xml, raiz)
  if (!e) return null
  return [etiqueta(e, 'codigoError') ?? etiqueta(e, 'codigo'), etiqueta(e, 'mensajeError') ?? etiqueta(e, 'mensaje')]
    .filter(Boolean)
    .join(': ')
}

// ------------------------------------------------------------------ Alícuotas

const aaaammdd = (f: string) => f.replace(/-/g, '')

export function pedidoAlicuotas(cuits: string[], desde: string, hasta: string) {
  return [
    '<?xml version="1.0" encoding="ISO-8859-1"?>',
    '<CONSULTA-ALICUOTA>',
    `<fechaDesde>${aaaammdd(desde)}</fechaDesde>`,
    `<fechaHasta>${aaaammdd(hasta)}</fechaHasta>`,
    `<cantidadContribuyentes>${cuits.length}</cantidadContribuyentes>`,
    '<contribuyentes class="list">',
    ...cuits.map((c) => `<contribuyente><cuitContribuyente>${escapar(c)}</cuitContribuyente></contribuyente>`),
    '</contribuyentes>',
    '</CONSULTA-ALICUOTA>',
  ].join('')
}

export function leerRespuestaAlicuotas(xml: string, desde: string, hasta: string): FilaPadron[] | { error: string } {
  const error = errorArba(xml, 'DFEError')
  if (error) return { error }
  const num = (v: string | null) => (v ? v.replace(',', '.') : null)
  return bloques(xml, 'contribuyente').flatMap((b) => {
    const cuit = etiqueta(b, 'cuitContribuyente')?.replace(/\D/g, '')
    if (!cuit || cuit.length !== 11) return []
    return [
      {
        provincia: 'B',
        cuit,
        desde: etiqueta(b, 'fechaDesde')?.replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3') ?? desde,
        hasta: etiqueta(b, 'fechaHasta')?.replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3') ?? hasta,
        percepcion: num(etiqueta(b, 'alicuotaPercepcion')),
        retencion: num(etiqueta(b, 'alicuotaRetencion')),
        grupoPercepcion: etiqueta(b, 'grupoPercepcion'),
        grupoRetencion: etiqueta(b, 'grupoRetencion'),
      },
    ]
  })
}

/** Primer y último día del mes de una fecha. */
const mesDe = (fecha: string) => {
  const [a, m] = fecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${fecha.slice(0, 7)}-01`, hasta: `${fecha.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` }
}

/**
 * Consulta a ARBA las alícuotas del mes de los CUIT indicados (o de todos
 * los clientes y proveedores) y las guarda en el padrón. Va de a 50.
 */
export async function actualizarDesdeArba(empresaId: string, hoy: string, cuits?: string[], f: Fetch = fetch) {
  const { cred, lista } = await conEmpresa(empresaId, async (tx) => ({
    cred: await credencialesArba(tx),
    lista: cuits ?? [...(await cuitsDeTerceros(tx))],
  }))
  if (!cred) return { ok: false as const, error: 'Cargá el usuario y la CIT de ARBA.' }
  if (!lista.length) return { ok: false as const, error: 'No hay CUIT para consultar.' }
  const { desde, hasta } = mesDe(hoy)
  let guardados = 0
  for (let i = 0; i < lista.length; i += 50) {
    const xml = pedidoAlicuotas(lista.slice(i, i + 50), desde, hasta)
    const nombre = `DFEServicioConsulta_${createHash('md5').update(xml, 'latin1').digest('hex')}.xml`
    let respuesta: string
    try {
      respuesta = await presentar(URLS.alicuotas[cred.ambiente], cred, nombre, xml, 'text/xml', f)
    } catch (e) {
      return { ok: false as const, error: `No se pudo consultar a ARBA: ${(e as Error).message}`, guardados }
    }
    const filas = leerRespuestaAlicuotas(respuesta, desde, hasta)
    if ('error' in filas) return { ok: false as const, error: `ARBA: ${filas.error}`, guardados }
    await conEmpresa(empresaId, (tx) => guardarFilas(tx, filas, 'servicio'))
    guardados += filas.length
  }
  return { ok: true as const, guardados, desde, hasta }
}

// ------------------------------------------------------------------------ COT

export type RespuestaCot = { ok: true; cot: string; integridad: string | null } | { ok: false; error: string }

/** Presenta el archivo de remitos y devuelve el COT del remito (uno por archivo). */
export async function presentarCot(
  cred: CredencialesArba,
  nombre: string,
  contenido: string,
  f: Fetch = fetch,
): Promise<RespuestaCot> {
  let xml: string
  try {
    xml = await presentar(URLS.cot[cred.ambiente], cred, nombre, contenido, 'text/plain', f)
  } catch (e) {
    return { ok: false, error: `No se pudo presentar en ARBA: ${(e as Error).message}` }
  }
  return leerRespuestaCot(xml)
}

export function leerRespuestaCot(xml: string): RespuestaCot {
  const error = errorArba(xml, 'TBError')
  if (error) return { ok: false, error: `ARBA: ${error}` }
  const [remito] = bloques(xml, 'remito')
  if (!remito) return { ok: false, error: 'ARBA no devolvió el resultado del remito.' }
  const cot = etiqueta(remito, 'cot')
  if (etiqueta(remito, 'procesado')?.toUpperCase() === 'SI' && cot) {
    return { ok: true, cot, integridad: etiqueta(xml, 'codigoIntegridad') }
  }
  const errores = bloques(remito, 'error').map((e) =>
    [etiqueta(e, 'codigo'), etiqueta(e, 'descripcion')].filter(Boolean).join(': '),
  )
  return { ok: false, error: `ARBA rechazó el remito: ${errores.join('; ') || 'sin detalle'}` }
}
