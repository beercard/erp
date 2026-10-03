import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'

import { paginaContratos } from '../../../contratos/modulo'
import { EditorFormulario } from '../EditorFormulario'

export const metadata: Metadata = { title: 'Nuevo formulario' }

export default async function NuevoFormulario() {
  await paginaContratos('servicio.configurar')
  return (
    <>
      <EncabezadoPagina titulo="Nuevo formulario" />
      <Panel className="p-4">
        <EditorFormulario
          id={null}
          inicial={{
            codigo: '',
            nombre: '',
            descripcion: null,
            color: '#2563eb',
            pideCliente: true,
            tecnico: true,
            portal: false,
            activo: true,
            campos: [{ id: 'detalle', tipo: 'parrafo', etiqueta: 'Detalle', requerido: true }],
          }}
        />
      </Panel>
    </>
  )
}
