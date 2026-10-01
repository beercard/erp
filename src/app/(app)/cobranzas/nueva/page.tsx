import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'

import { EncabezadoPagina } from '@/components/ui'
import { puntosVenta, terceros } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'

import { FormularioRecibo } from './FormularioRecibo'

export const metadata: Metadata = { title: 'Nueva cobranza' }

export default async function NuevaCobranza({ searchParams }: PageProps<'/cobranzas/nueva'>) {
  await exigirPermiso('ventas.cobrar')
  const { cliente } = await searchParams
  const datos = await enLaEmpresa('ventas.cobrar', async (tx) => {
    const pvs = await tx.select().from(puntosVenta).where(eq(puntosVenta.activo, true)).orderBy(puntosVenta.numero)
    const [t] =
      typeof cliente === 'string' && /^[0-9a-f-]{36}$/i.test(cliente)
        ? await tx.select({ id: terceros.id, razonSocial: terceros.razonSocial }).from(terceros).where(eq(terceros.id, cliente))
        : []
    // Primero el de factura electrónica, que es donde se numeran los recibos habitualmente.
    pvs.sort((x, y) => Number(y.tipo === 'electronico') - Number(x.tipo === 'electronico') || x.numero - y.numero)
    return { pvs, cliente: t ?? null }
  })
  return (
    <>
      <EncabezadoPagina
        titulo="Nueva cobranza"
        bajada="Cargá lo que entregó el cliente (puede ser con varios medios) y a qué comprobantes se aplica. Lo que no se aplica queda a cuenta."
      />
      <FormularioRecibo
        cliente={datos.cliente}
        hoy={hoyArgentina()}
        puntosVenta={datos.pvs.map((p) => ({
          valor: String(p.numero),
          texto: `${String(p.numero).padStart(4, '0')} · ${p.nombre}`,
        }))}
      />
    </>
  )
}
