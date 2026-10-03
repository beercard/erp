import type { Fetch } from './tipos'

export class ErrorCanal extends Error {
  constructor(
    mensaje: string,
    readonly estado?: number,
  ) {
    super(mensaje)
  }
}

const ESPERA_MS = 20_000
const MAXIMO_BYTES = 10 * 1024 * 1024

/** Pedido JSON con tiempo máximo; un error de la plataforma lleva su estado y un mensaje entendible. */
export async function pedirJson<T>(f: Fetch, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response
  try {
    r = await f(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS), redirect: 'manual' })
  } catch (e) {
    throw new ErrorCanal(`No se pudo conectar (${e instanceof Error ? e.message : 'sin respuesta'}).`)
  }
  // Tope de tamaño: una tienda (o lo que se haga pasar por una) no puede llenar la memoria.
  if (Number(r.headers.get('content-length') ?? 0) > MAXIMO_BYTES)
    throw new ErrorCanal('La respuesta de la plataforma es demasiado grande.')
  const texto = await r.text()
  if (texto.length > MAXIMO_BYTES) throw new ErrorCanal('La respuesta de la plataforma es demasiado grande.')
  if (!r.ok) {
    let detalle = texto.slice(0, 300)
    try {
      const j = JSON.parse(texto) as { message?: string; error?: string; description?: string }
      detalle = j.message ?? j.description ?? j.error ?? detalle
    } catch {
      // No era JSON.
    }
    const que =
      r.status === 401 || r.status === 403
        ? 'La plataforma rechazó la conexión: hay que volver a conectar la tienda.'
        : r.status === 404
          ? 'No existe en la plataforma.'
          : r.status === 429
            ? 'La plataforma pidió esperar (demasiados pedidos seguidos).'
            : `La plataforma respondió ${r.status}.`
    throw new ErrorCanal(`${que} ${detalle}`.trim(), r.status)
  }
  return (texto ? JSON.parse(texto) : null) as T
}

export const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
