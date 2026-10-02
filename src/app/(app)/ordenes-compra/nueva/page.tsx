import type { Metadata } from 'next'

import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'

import { FormularioCompra } from '../../compras/FormularioCompra'
import { opcionesCompra } from '../../compras/opciones'

export const metadata: Metadata = { title: 'Nueva orden de compra' }

export default async function NuevaOrden() {
  await exigirPermiso('compras.cargar')
  const opciones = await enLaEmpresa('compras.cargar', (tx) => opcionesCompra(tx))
  return (
    <>
      <EncabezadoPagina titulo="Nueva orden de compra" bajada="Lo que se le pide al proveedor, con el precio pactado." />
      <FormularioCompra
        modo="orden"
        inicial={{
          proveedor: null,
          fecha: hoyArgentina(),
          moneda: 'PES',
          depositoId: opciones.depositos[0]?.valor ?? '',
          lineas: [],
        }}
        depositos={opciones.depositos}
        provincias={opciones.provincias}
        dolarDelDia={opciones.dolar}
      />
    </>
  )
}
