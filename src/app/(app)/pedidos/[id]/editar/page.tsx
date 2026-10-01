import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { EditorDocumento } from '@/components/comercial/EditorDocumento'
import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

import { datosEditor } from '../../../comercial/cargar'

export const metadata: Metadata = { title: 'Modificar pedido' }

export default async function EditarPedido({ params }: PageProps<'/pedidos/[id]/editar'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  await exigirPermiso('ventas.pedidos')
  const d = await enLaEmpresa('ventas.pedidos', (tx) => datosEditor(tx, 'pedido', id))
  if (!d) notFound()
  if (!d.editable)
    redirect(`/pedidos/${id}?error=${encodeURIComponent('El pedido ya tiene entregas o está cerrado: no se modifica.')}`)
  return (
    <>
      <EncabezadoPagina titulo="Modificar pedido" />
      <EditorDocumento
        tipo="pedido"
        id={id}
        inicial={d.inicial}
        lineasIniciales={d.lineas}
        cotizacionDolar={d.dolar}
        opciones={d.opciones}
      />
    </>
  )
}
