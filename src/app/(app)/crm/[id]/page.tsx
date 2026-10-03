import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Aviso } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'

import { FormularioOportunidad } from '../FormularioOportunidad'
import { cargarFicha } from './datos'
import { Ficha } from './Ficha'

export const metadata: Metadata = { title: 'Oportunidad' }

export default async function FichaOportunidad({ params, searchParams }: PageProps<'/crm/[id]'>) {
  const sesion = await exigirPermiso('crm.ver')
  const { id } = await params
  const { editar, guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const datos = await enLaEmpresa('crm.ver', (tx) => cargarFicha(tx, sesion, id))
  if (!datos) notFound()

  if (editar === '1' && datos.puede) {
    const { o, etapas, personas, etiquetas } = datos
    return (
      <FormularioOportunidad
        id={id}
        etapas={etapas}
        personas={personas}
        etiquetas={etiquetas}
        inicial={{ ...o, ingresoEsperado: o.ingresoEsperado, etiquetas: o.etiquetas }}
      />
    )
  }

  return (
    <>
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Listo, quedó guardado.</Aviso>
        </div>
      )}
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      <Ficha datos={datos} sesion={sesion} />
    </>
  )
}
