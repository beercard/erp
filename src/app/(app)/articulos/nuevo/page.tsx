import type { Metadata } from 'next'

import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { opcionesArticulo } from '@/modulos/maestros/articulo'

import { FormularioArticulo } from '../FormularioArticulo'

export const metadata: Metadata = { title: 'Nuevo artículo' }

export default async function NuevoArticulo() {
  await exigirPermiso('maestros.articulos')
  const opciones = await enLaEmpresa('maestros.articulos', (tx) => opcionesArticulo(tx))
  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo artículo"
        bajada="Después de darlo de alta vas a poder cargarle los precios de cada lista."
      />
      <FormularioArticulo
        id={null}
        inicial={{ tipo: 'producto', monedaCosto: 'PES', alicuotaIva: '5', unidad: 'unidad' }}
        opciones={opciones}
      />
    </>
  )
}
