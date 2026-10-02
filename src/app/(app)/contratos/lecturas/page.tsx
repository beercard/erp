import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { equiposConLectura } from '@/modulos/contratos/contratos'

import { ImportarLecturas, PlanillaLecturas } from '../FormulariosContratos'
import { paginaContratos } from '../modulo'

export const metadata: Metadata = { title: 'Lecturas' }

export default async function Lecturas() {
  const sesion = await paginaContratos('contratos.lecturas')
  const equipos = await conEmpresa(sesion.empresa.id, (tx) =>
    equiposConLectura(tx, { estado: 'instalado', enContrato: true, limite: 5000 }),
  )
  const hoy = hoyArgentina()
  return (
    <>
      <EncabezadoPagina
        titulo="Lecturas de contadores"
        bajada="Contadores de los equipos en contrato para facturar el mes. Se cargan a mano o con la planilla de MPS Monitor."
      />
      <Panel className="mb-4">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Importar planilla</h2>
        <ImportarLecturas hoy={hoy} />
      </Panel>
      <Panel>
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
          Cargar a mano ({equipos.length} equipos en contrato)
        </h2>
        <PlanillaLecturas equipos={equipos} hoy={hoy} />
      </Panel>
    </>
  )
}
