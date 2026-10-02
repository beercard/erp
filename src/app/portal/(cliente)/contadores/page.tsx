import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { equiposDelCliente } from '@/modulos/portal/portal'

import { FormularioContadores } from '../../Formularios'
import { requerirPortal } from '../../sesion'

export const metadata: Metadata = { title: 'Contadores' }

export default async function Contadores() {
  const s = await requerirPortal()
  if (!s.contadores) redirect('/portal')
  const equipos = await conEmpresa(s.empresaId, (tx) => equiposDelCliente(tx, s.cliente.id))
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Contadores</h1>
        <p className="text-sm text-texto-2">
          Escribí el contador total que muestra cada equipo hoy. Los que dejes vacíos no se cargan.
        </p>
      </div>
      <Panel className="px-4 py-1">
        {equipos.length ? (
          <FormularioContadores
            equipos={equipos.map((e) => ({
              id: e.id,
              texto: `${e.modelo ? `${e.modelo} · ` : ''}${e.serie}${e.sector ? ` · ${e.sector}` : ''}`,
              ultimo: e.ultimoContador === null ? null : Number(e.ultimoContador),
              fecha: e.ultimaLectura,
            }))}
          />
        ) : (
          <p className="py-3 text-sm text-texto-2">No hay equipos a tu nombre.</p>
        )}
      </Panel>
    </>
  )
}
