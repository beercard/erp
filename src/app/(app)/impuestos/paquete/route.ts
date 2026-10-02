import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { armarPaquete } from '@/modulos/impuestos/paquete'
import { PERIODO } from '@/modulos/impuestos/presentaciones'

/** El paquete del mes para el contador, para bajarlo. */
export async function GET(request: Request) {
  const periodo = new URL(request.url).searchParams.get('periodo') ?? ''
  if (!PERIODO.test(periodo)) return new Response('Período inválido.', { status: 400 })
  try {
    const p = await enLaEmpresa('impuestos.libros', (tx, s) => armarPaquete(tx, s.empresa.id, periodo))
    return new Response(new Uint8Array(p.zip), {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${p.nombre}"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
