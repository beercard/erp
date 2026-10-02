import type { Transaccion } from '@/db/conexion'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { situacion, type Funcion } from '@/lib/planes'
import { autenticarClave, type Acceso } from '@/modulos/integraciones/claves'
import { suscripcionDe } from '@/modulos/plataforma/suscripciones'

/**
 * Base de la API REST v1 (como la de Persat): JSON, autenticación con
 * Authorization: Bearer <clave>, paginado con offset y limit (20 por defecto,
 * 100 como máximo) y la respuesta { paging: { offset, limit, total }, resultados }.
 * La clave puede ser de lectura (solo GET) o total. La empresa tiene que
 * tener la función "API e integraciones" en su plan (y Contratos para lo de
 * servicio técnico).
 */

export class ErrorApi extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

export const error = (estado: number, mensaje: string) => Response.json({ error: mensaje }, { status: estado })

export async function conApi(
  request: Request,
  opciones: { escribe?: boolean; funciones?: Funcion[] },
  trabajo: (tx: Transaccion, acceso: Acceso) => Promise<Response>,
): Promise<Response> {
  const clave = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const acceso = clave ? await autenticarClave(clave).catch(() => null) : null
  if (!acceso) return error(401, 'Falta la clave de la API o no es válida (Authorization: Bearer erp_…).')
  if (opciones.escribe && acceso.acceso !== 'total') return error(403, 'Esta clave es de solo lectura.')
  const sit = situacion(await suscripcionDe(acceso.empresaId), hoyArgentina())
  for (const f of ['api', ...(opciones.funciones ?? [])] as Funcion[]) {
    if (!sit.funciones.includes(f)) return error(403, `El plan de la empresa no incluye ${f === 'api' ? 'la API' : f}.`)
  }
  if (opciones.escribe && sit.soloLectura) return error(403, 'La suscripción no está al día: la API es de solo lectura.')
  try {
    return await conEmpresa(acceso.empresaId, (tx) => trabajo(tx, acceso))
  } catch (e) {
    if (e instanceof ErrorApi) return error(e.estado, e.message)
    throw e
  }
}

export function paginado(request: Request) {
  const u = new URL(request.url)
  const offset = Math.max(0, Number(u.searchParams.get('offset')) || 0)
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get('limit')) || 20))
  return { offset, limit, params: u.searchParams }
}

export const respuesta = <T>(resultados: T[], p: { offset: number; limit: number }, total: number) =>
  Response.json({ paging: { offset: p.offset, limit: p.limit, total }, resultados })

export async function cuerpo(request: Request): Promise<Record<string, unknown>> {
  try {
    const j = await request.json()
    if (!j || typeof j !== 'object') throw new Error()
    return j as Record<string, unknown>
  } catch {
    throw new ErrorApi(400, 'El cuerpo tiene que ser un JSON.')
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
