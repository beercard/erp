import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { equiposDelCliente, tiposDelPortal } from '@/modulos/portal/portal'

import { FormularioPedido } from '../../Formularios'
import { requerirPortal } from '../../sesion'

export const metadata: Metadata = { title: 'Pedir servicio técnico' }

export default async function Pedir({ searchParams }: PageProps<'/portal/pedir'>) {
  const s = await requerirPortal()
  if (!s.ordenes) redirect('/portal')
  const { equipo } = (await searchParams) as { equipo?: string }
  const { equipos, tipos } = await conEmpresa(s.empresaId, async (tx) => ({
    equipos: await equiposDelCliente(tx, s.cliente.id),
    tipos: await tiposDelPortal(tx),
  }))
  return (
    <>
      <h1 className="text-xl font-semibold">Pedir servicio técnico</h1>
      <Panel className="p-5">
        <FormularioPedido
          equipos={equipos.map((e) => ({
            id: e.id,
            texto: `${e.modelo ? `${e.modelo} · ` : ''}${e.serie}${e.sector ? ` · ${e.sector}` : ''}`,
          }))}
          tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre, instrucciones: t.instrucciones }))}
          equipo={equipos.some((e) => e.id === equipo) ? equipo : undefined}
          contacto={s.usuario.nombre ?? ''}
        />
      </Panel>
    </>
  )
}
