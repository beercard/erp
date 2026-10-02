import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'

import { Aviso, EncabezadoPagina } from '@/components/ui'
import { retencionesConfiguracion, terceros } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'

import { dolarHoy } from '../../comercial/opciones'
import { FormularioPago } from './FormularioPago'

export const metadata: Metadata = { title: 'Nueva orden de pago' }

export default async function NuevoPago({ searchParams }: PageProps<'/pagos/nuevo'>) {
  await exigirPermiso('compras.pagar')
  const { proveedor } = await searchParams
  const id = typeof proveedor === 'string' && /^[0-9a-f-]{36}$/i.test(proveedor) ? proveedor : null
  const datos = await enLaEmpresa('compras.pagar', async (tx) => {
    const [t] = id ? await tx.select().from(terceros).where(eq(terceros.id, id)) : []
    const [config] = await tx.select().from(retencionesConfiguracion)
    return { t, dolar: await dolarHoy(tx), retiene: config?.gananciasActiva ?? false }
  })
  return (
    <>
      <EncabezadoPagina
        titulo="Nueva orden de pago"
        bajada="Elegí qué comprobantes se cancelan. Si corresponde retener Ganancias, se calcula sola y se entrega el resto."
      />
      {!datos.retiene && (
        <div className="mb-4">
          <Aviso tono="info">La retención de Ganancias está apagada (Configuración → Retenciones).</Aviso>
        </div>
      )}
      <FormularioPago
        proveedorInicial={datos.t ? { id: datos.t.id, razonSocial: datos.t.razonSocial } : null}
        hoy={hoyArgentina()}
        dolarDelDia={datos.dolar}
      />
    </>
  )
}
