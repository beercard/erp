import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { leerArchivo } from '@/modulos/servicio/archivos'

/**
 * Foto o firma de una orden de servicio. Pasa por la sesión y por el
 * aislamiento de la empresa como cualquier otro dato: no hay enlaces públicos.
 */
export async function GET(_: Request, { params }: RouteContext<'/servicio/archivo/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No existe.', { status: 404 })
  try {
    const a = await enLaEmpresa('servicio.ver', (tx) => leerArchivo(tx, id))
    if (!a) return new Response('No existe.', { status: 404 })
    return new Response(new Uint8Array(a.datos), {
      headers: {
        'Content-Type': a.tipoMime,
        // Un archivo no cambia nunca (no se modifica): se puede guardar en el navegador.
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
