import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'

import { FormularioContrato } from '../FormulariosContratos'
import { alicuotas, paginaContratos } from '../modulo'

export const metadata: Metadata = { title: 'Nuevo contrato' }

export default async function NuevoContrato() {
  await paginaContratos('contratos.editar')
  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo contrato"
        bajada="Después de crearlo, sumale los equipos: las copias de todos se suman contra las libres del contrato."
      />
      <Panel className="p-4">
        <FormularioContrato id={null} alicuotas={alicuotas} />
      </Panel>
    </>
  )
}
