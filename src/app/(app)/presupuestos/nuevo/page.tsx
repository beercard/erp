import type { Metadata } from 'next'

import { EditorDocumento } from '@/components/comercial/EditorDocumento'
import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

import { datosEditor } from '../../comercial/cargar'

export const metadata: Metadata = { title: 'Nuevo presupuesto' }

export default async function NuevoPresupuesto() {
  await exigirPermiso('ventas.presupuestos')
  const d = (await enLaEmpresa('ventas.presupuestos', (tx) => datosEditor(tx, 'presupuesto')))!
  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo presupuesto"
        bajada="Elegí el cliente y agregá artículos: el precio sale de la lista elegida."
      />
      <EditorDocumento
        tipo="presupuesto"
        id={null}
        inicial={d.inicial}
        lineasIniciales={d.lineas}
        cotizacionDolar={d.dolar}
        opciones={d.opciones}
      />
    </>
  )
}
