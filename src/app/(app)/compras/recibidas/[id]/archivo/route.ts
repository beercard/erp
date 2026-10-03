import { enLaEmpresa } from '@/lib/auth/servidor'
import { archivoRecibida } from '@/modulos/compras/recibidas'

/** El archivo original (foto o PDF), para verlo al lado del formulario. Solo con sesión y permiso. */
export async function GET(_: Request, { params }: RouteContext<'/compras/recibidas/[id]/archivo'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 })
  const a = await enLaEmpresa('compras.ver', (tx) => archivoRecibida(tx, id)).catch(() => null)
  if (!a) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(a.archivo), {
    headers: {
      'content-type': a.tipo,
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  })
}
