import type { Metadata } from 'next'

import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { asegurarEtapas, listarMotivos } from '@/modulos/crm/crm'

import { EditorEtapas, EditorMotivos } from './Editores'

export const metadata: Metadata = { title: 'Configuración del CRM' }

export default async function ConfiguracionCrm({ searchParams }: PageProps<'/crm/configuracion'>) {
  await exigirPermiso('crm.configurar')
  const { error } = await searchParams
  const [etapas, motivos] = await enLaEmpresa('crm.configurar', async (tx) => [
    await asegurarEtapas(tx),
    await listarMotivos(tx, false),
  ])
  return (
    <>
      <EncabezadoPagina
        titulo="Configuración del CRM"
        bajada="Las etapas de tu embudo y los motivos por los que se pierde una venta."
      />
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel>
          <h2 className="border-b border-borde px-5 py-3 font-semibold">Etapas del embudo</h2>
          <p className="px-5 pt-4 text-sm text-texto-2">
            Al entrar a una etapa, la oportunidad toma su probabilidad. Con <b>días de alerta</b>, se marca como estancada si pasa
            ese tiempo sin moverse. La etapa <b>ganada</b> cierra la venta.
          </p>
          <EditorEtapas
            etapas={etapas.map((e) => ({
              id: e.id,
              nombre: e.nombre,
              probabilidad: e.probabilidad,
              ganada: e.ganada,
              diasAlerta: e.diasAlerta,
            }))}
          />
        </Panel>
        <Panel className="h-fit">
          <h2 className="border-b border-borde px-5 py-3 font-semibold">Motivos de pérdida</h2>
          <EditorMotivos motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre, activo: m.activo }))} />
        </Panel>
      </div>
    </>
  )
}
