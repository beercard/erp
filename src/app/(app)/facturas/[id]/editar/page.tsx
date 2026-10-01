import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { EditorDocumento } from '@/components/comercial/EditorDocumento'
import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

import { datosFactura } from '../../cargar'

export const metadata: Metadata = { title: 'Modificar borrador' }

export default async function EditarFactura({ params }: PageProps<'/facturas/[id]/editar'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  await exigirPermiso('ventas.facturar')
  const datos = await enLaEmpresa('ventas.facturar', (tx) => datosFactura(tx, { id }))
  if (!datos) notFound()
  if (!datos.editable) redirect(`/facturas/${id}?error=${encodeURIComponent('Solo se modifica un borrador.')}`)
  return (
    <>
      <EncabezadoPagina titulo="Modificar borrador" />
      <EditorDocumento
        tipo="factura"
        id={id}
        inicial={datos.inicial}
        lineasIniciales={datos.lineas}
        cotizacionDolar={datos.dolar}
        opciones={datos.opciones}
        factura={datos.factura}
      />
    </>
  )
}
