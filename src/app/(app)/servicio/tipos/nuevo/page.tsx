import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'

import { paginaContratos } from '../../../contratos/modulo'
import { EditorTipo } from '../EditorTipo'

export const metadata: Metadata = { title: 'Nuevo tipo de orden' }

export default async function NuevoTipo() {
  await paginaContratos('servicio.configurar')
  return (
    <>
      <EncabezadoPagina titulo="Nuevo tipo de orden" bajada="Armá los formularios con los campos que necesites." />
      <Panel className="p-4">
        <EditorTipo
          id={null}
          inicial={{
            codigo: '',
            nombre: '',
            clase: 'correctivo',
            color: '#2563eb',
            duracion: 60,
            plazoHoras: 48,
            activo: true,
            instrucciones: [{ id: 'equipo', tipo: 'equipo', etiqueta: 'Equipo', requerido: true }],
            devolucion: [
              { id: 'trabajo', tipo: 'parrafo', etiqueta: 'Trabajo realizado', requerido: true },
              { id: 'firma', tipo: 'firma', etiqueta: 'Firma del cliente', requerido: true },
            ],
          }}
        />
      </Panel>
    </>
  )
}
