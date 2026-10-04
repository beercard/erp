import { arcaConfiguracion } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

/** GET /configuracion/arca/pedido: el pedido de certificado (CSR) para subir a ARCA. Nunca la clave. */
export async function GET() {
  const sesion = await exigirPermiso('empresa.datos')
  const [c] = await enLaEmpresa('empresa.datos', (tx) => tx.select({ csr: arcaConfiguracion.pedidoCsr }).from(arcaConfiguracion))
  if (!c?.csr) return new Response('Todavía no generaste el pedido.', { status: 404 })
  return new Response(c.csr, {
    headers: {
      'content-type': 'application/pkcs10',
      'content-disposition': `attachment; filename="pedido-arca-${sesion.empresa.cuit}.csr"`,
      'cache-control': 'no-store',
    },
  })
}
