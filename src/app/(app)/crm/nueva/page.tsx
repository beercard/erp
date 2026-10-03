import type { Metadata } from 'next'

import { EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { asegurarEtapas, etiquetasUsadas, responsables } from '@/modulos/crm/crm'

import { FormularioOportunidad } from '../FormularioOportunidad'

export const metadata: Metadata = { title: 'Nueva oportunidad' }

export default async function NuevaOportunidad({ searchParams }: PageProps<'/crm/nueva'>) {
  const sesion = await exigirPermiso('crm.oportunidades')
  const { etapa } = await searchParams
  const [etapas, personas, etiquetas] = await enLaEmpresa('crm.ver', async (tx) => [
    await asegurarEtapas(tx),
    await responsables(tx, sesion.empresa.id),
    await etiquetasUsadas(tx),
  ])
  const inicio = etapas.find((e) => e.id === etapa) ?? etapas[0]
  return (
    <>
      <EncabezadoPagina titulo="Nueva oportunidad" bajada="Una venta posible: a quién, cuánto y para cuándo." />
      <FormularioOportunidad
        id={null}
        etapas={etapas}
        personas={personas}
        etiquetas={etiquetas}
        inicial={{
          titulo: '',
          terceroId: null,
          cliente: null,
          empresaProspecto: null,
          contacto: null,
          email: null,
          telefono: null,
          etapaId: inicio.id,
          ingresoEsperado: '',
          probabilidad: inicio.probabilidad,
          cierreEstimado: null,
          prioridad: 0,
          responsableId: sesion.usuario.id,
          origen: null,
          etiquetas: [],
          proximoPaso: null,
          descripcion: null,
        }}
      />
    </>
  )
}
