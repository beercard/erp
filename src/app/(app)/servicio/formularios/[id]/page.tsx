import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { obtenerFormulario } from '@/modulos/servicio/sueltos'

import { paginaContratos } from '../../../contratos/modulo'
import { EditorFormulario } from '../EditorFormulario'

export const metadata: Metadata = { title: 'Formulario' }

export default async function EditarFormulario({ params, searchParams }: PageProps<'/servicio/formularios/[id]'>) {
  const sesion = await paginaContratos('servicio.configurar')
  const { id } = await params
  const { creado } = (await searchParams) as { creado?: string }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const f = await conEmpresa(sesion.empresa.id, (tx) => obtenerFormulario(tx, id))
  if (!f) notFound()
  return (
    <>
      <EncabezadoPagina titulo={f.nombre} bajada={`Formulario ${f.codigo} · versión ${f.version}`} />
      {creado && (
        <div className="mb-4">
          <Aviso tono="ok">Formulario creado.</Aviso>
        </div>
      )}
      <Panel className="p-4">
        <EditorFormulario id={f.id} inicial={f} />
      </Panel>
    </>
  )
}
