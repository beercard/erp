import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { EditorDocumento } from '@/components/comercial/EditorDocumento'
import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

import { datosEditor } from '../../../comercial/cargar'

export const metadata: Metadata = { title: 'Modificar presupuesto' }

export default async function EditarPresupuesto({ params }: PageProps<'/presupuestos/[id]/editar'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  await exigirPermiso('ventas.presupuestos')
  const d = await enLaEmpresa('ventas.presupuestos', (tx) => datosEditor(tx, 'presupuesto', id))
  if (!d) notFound()
  if (!d.editable) redirect(`/presupuestos/${id}?error=${encodeURIComponent('Este presupuesto ya no se modifica.')}`)
  return (
    <>
      <EncabezadoPagina titulo="Modificar presupuesto" />
      <EditorDocumento
        tipo="presupuesto"
        id={id}
        inicial={d.inicial}
        lineasIniciales={d.lineas}
        cotizacionDolar={d.dolar}
        opciones={d.opciones}
      />
    </>
  )
}
