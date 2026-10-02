import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'

import { FormularioEquipo } from '../../contratos/FormulariosContratos'
import { paginaContratos } from '../../contratos/modulo'
import { opcionesEquipo } from '../opciones'

export const metadata: Metadata = { title: 'Nuevo equipo' }

export default async function NuevoEquipo({ searchParams }: PageProps<'/equipos/nuevo'>) {
  const sesion = await paginaContratos('contratos.editar')
  const { contrato } = (await searchParams) as { contrato?: string }
  const opciones = await conEmpresa(sesion.empresa.id, opcionesEquipo)
  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo equipo"
        bajada="Alta de un equipo instalado en un cliente, con su contador al instalarlo."
      />
      <Panel className="p-4">
        <FormularioEquipo id={null} inicial={{ contratoId: contrato ?? null, fechaInstalacion: hoyArgentina() }} {...opciones} />
      </Panel>
    </>
  )
}
