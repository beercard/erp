import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EncabezadoPagina } from '@/components/ui'
import { terceros } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { obtenerOrden } from '@/modulos/compras/ordenes'

import { FormularioCompra } from '../FormularioCompra'
import { lineasDeOrden, opcionesCompra } from '../opciones'
import { eq } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Registrar compra' }

const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)

export default async function NuevaCompra({ searchParams }: PageProps<'/compras/nueva'>) {
  await exigirPermiso('compras.cargar')
  const sp = await searchParams
  const ordenId = uuid(sp.orden)
  const proveedorId = uuid(sp.proveedor)
  const datos = await enLaEmpresa('compras.cargar', async (tx) => {
    const opciones = await opcionesCompra(tx)
    if (ordenId) {
      const orden = await obtenerOrden(tx, ordenId)
      if (!orden || orden.estado === 'cancelada' || orden.estado === 'recibida') return null
      return { opciones, orden, lineas: await lineasDeOrden(tx, ordenId, true), proveedor: orden.proveedor }
    }
    const [proveedor] = proveedorId ? await tx.select().from(terceros).where(eq(terceros.id, proveedorId)) : []
    return { opciones, orden: null, lineas: [], proveedor }
  })
  if (!datos) notFound()
  const { opciones, orden, proveedor } = datos
  return (
    <>
      <EncabezadoPagina
        titulo={orden ? `Recibir la orden de compra ${String(orden.numero).padStart(6, '0')}` : 'Registrar comprobante de compra'}
        bajada="Cargalo tal como lo emitió el proveedor. Con artículos, la mercadería entra al depósito elegido."
      />
      <FormularioCompra
        modo="compra"
        ordenId={orden?.id ?? null}
        inicial={{
          proveedor: proveedor
            ? { id: proveedor.id, razonSocial: proveedor.razonSocial, condicionIva: proveedor.condicionIva }
            : null,
          fecha: hoyArgentina(),
          moneda: orden?.moneda ?? 'PES',
          depositoId: orden?.depositoId ?? opciones.depositos[0]?.valor ?? '',
          lineas: datos.lineas,
        }}
        depositos={opciones.depositos}
        provincias={opciones.provincias}
        dolarDelDia={orden && orden.moneda !== 'PES' ? String(Number(orden.cotizacion)) : opciones.dolar}
      />
    </>
  )
}
