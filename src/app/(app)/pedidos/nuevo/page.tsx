import type { Metadata } from 'next'

import { EditorDocumento } from '@/components/comercial/EditorDocumento'
import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

import { datosEditor } from '../../comercial/cargar'

export const metadata: Metadata = { title: 'Nuevo pedido' }

export default async function NuevoPedido() {
  await exigirPermiso('ventas.pedidos')
  const d = (await enLaEmpresa('ventas.pedidos', (tx) => datosEditor(tx, 'pedido')))!
  return (
    <>
      <EncabezadoPagina titulo="Nuevo pedido" bajada="Lo que el cliente compró y hay que entregar." />
      <EditorDocumento
        tipo="pedido"
        id={null}
        inicial={d.inicial}
        lineasIniciales={d.lineas}
        cotizacionDolar={d.dolar}
        opciones={d.opciones}
      />
    </>
  )
}
