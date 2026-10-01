import type { Metadata } from 'next'

import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

import { FormularioTercero } from '../FormularioTercero'
import { opcionesFormulario } from '../opciones'

export const metadata: Metadata = { title: 'Nuevo cliente o proveedor' }

export default async function NuevoTercero({ searchParams }: PageProps<'/terceros/nuevo'>) {
  await exigirPermiso('maestros.terceros')
  const { tipo } = await searchParams
  const opciones = await enLaEmpresa('maestros.terceros', (tx) => opcionesFormulario(tx))
  const esProveedor = tipo === 'proveedor'
  return (
    <>
      <EncabezadoPagina
        titulo={esProveedor ? 'Nuevo proveedor' : 'Nuevo cliente'}
        bajada="El CUIT se valida antes de grabar y se avisa si ya está cargado."
      />
      <FormularioTercero
        id={null}
        opciones={opciones}
        inicial={{ esCliente: !esProveedor, esProveedor, tipoDocumento: '80', condicionIva: esProveedor ? '1' : '5' }}
      />
    </>
  )
}
