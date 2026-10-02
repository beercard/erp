import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { obtenerOrden } from '@/modulos/compras/ordenes'

import { FormularioCompra } from '../../../compras/FormularioCompra'
import { lineasDeOrden, opcionesCompra } from '../../../compras/opciones'

export const metadata: Metadata = { title: 'Modificar orden de compra' }

export default async function EditarOrden({ params }: PageProps<'/ordenes-compra/[id]/editar'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  await exigirPermiso('compras.cargar')
  const datos = await enLaEmpresa('compras.cargar', async (tx) => {
    const o = await obtenerOrden(tx, id)
    if (!o || o.estado !== 'pendiente') return null
    return { o, opciones: await opcionesCompra(tx), lineas: await lineasDeOrden(tx, id, false) }
  })
  if (!datos) notFound()
  const { o, opciones } = datos
  return (
    <>
      <EncabezadoPagina titulo={`Modificar la orden ${String(o.numero).padStart(6, '0')}`} />
      <FormularioCompra
        modo="orden"
        ordenId={o.id}
        inicial={{
          proveedor: o.proveedor
            ? { id: o.proveedor.id, razonSocial: o.proveedor.razonSocial, condicionIva: o.proveedor.condicionIva }
            : null,
          fecha: o.fecha,
          fechaEntrega: o.fechaEntrega ?? '',
          moneda: o.moneda,
          depositoId: o.depositoId ?? '',
          observaciones: o.observaciones ?? '',
          lineas: datos.lineas,
        }}
        depositos={opciones.depositos}
        provincias={opciones.provincias}
        dolarDelDia={o.moneda !== 'PES' ? String(Number(o.cotizacion)) : opciones.dolar}
      />
    </>
  )
}
