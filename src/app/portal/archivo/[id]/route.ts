import { conEmpresa } from '@/db/empresa'
import { archivoDelCliente } from '@/modulos/portal/portal'

import { sesionPortal } from '../../sesion'

/** Foto o firma de una orden, para el cliente: solo las de sus órdenes. */
export async function GET(_: Request, { params }: RouteContext<'/portal/archivo/[id]'>) {
  const { id } = await params
  const s = await sesionPortal()
  if (!s) return new Response('Sin sesión.', { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No existe.', { status: 404 })
  const a = await conEmpresa(s.empresaId, (tx) => archivoDelCliente(tx, s.cliente.id, id))
  if (!a) return new Response('No existe.', { status: 404 })
  return new Response(new Uint8Array(a.datos), {
    headers: { 'Content-Type': a.tipoMime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
  })
}
