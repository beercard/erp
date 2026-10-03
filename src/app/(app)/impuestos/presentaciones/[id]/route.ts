import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { archivoPresentacion } from '@/modulos/impuestos/presentaciones'

/** El archivo exacto que se generó (o presentó). */
export async function GET(_: Request, { params }: RouteContext<'/impuestos/presentaciones/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No existe.', { status: 404 })
  try {
    const p = await enLaEmpresa('impuestos.libros', (tx) => archivoPresentacion(tx, id))
    if (!p) return new Response('No existe.', { status: 404 })
    const tipo = p.nombreArchivo.endsWith('.zip') ? 'application/zip' : 'text/plain; charset=us-ascii'
    return new Response(new Uint8Array(p.archivo), {
      headers: { 'Content-Type': tipo, 'Content-Disposition': `attachment; filename="${p.nombreArchivo}"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
