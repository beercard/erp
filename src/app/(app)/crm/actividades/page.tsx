import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel, Vacio } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { actividadesPendientes } from '@/modulos/crm/crm'

import { ActividadPendiente } from '../[id]/PiezasFicha'

export const metadata: Metadata = { title: 'Mis actividades' }

const GRUPOS = [
  { estado: 'vencida', titulo: 'Vencidas', tono: 'text-error' },
  { estado: 'hoy', titulo: 'Para hoy', tono: 'text-aviso' },
  { estado: 'futura', titulo: 'Próximas', tono: 'text-texto-2' },
] as const

export default async function MisActividades({ searchParams }: PageProps<'/crm/actividades'>) {
  const sesion = await exigirPermiso('crm.ver')
  const { todas } = await searchParams
  const deTodos = todas === '1'
  const filas = await enLaEmpresa('crm.ver', (tx) => actividadesPendientes(tx, deTodos ? null : sesion.usuario.id))
  const editar = tienePermiso(sesion.permisos, 'crm.oportunidades')
  return (
    <>
      <EncabezadoPagina
        titulo={deTodos ? 'Actividades del equipo' : 'Mis actividades'}
        bajada={
          <>
            Llamadas, reuniones y tareas pendientes de las oportunidades.{' '}
            <Link href={deTodos ? '/crm/actividades' : '/crm/actividades?todas=1'} className="text-acento hover:underline">
              {deTodos ? 'Ver solo las mías' : 'Ver las de todo el equipo'}
            </Link>
          </>
        }
      />
      {!filas.length ? (
        <Panel>
          <Vacio titulo="Nada pendiente">Cuando agendes llamadas, reuniones o tareas en una oportunidad, aparecen acá.</Vacio>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {GRUPOS.map((g) => {
            const lista = filas.filter((a) => a.estado === g.estado)
            return (
              <Panel key={g.estado} className="h-fit">
                <h2 className={`flex items-center justify-between border-b border-borde px-5 py-3 font-semibold ${g.tono}`}>
                  {g.titulo}
                  <span className="text-xs font-normal text-texto-3">{lista.length}</span>
                </h2>
                {lista.length ? (
                  <div className="divide-y divide-borde px-5">
                    {lista.map((a) => (
                      <div key={a.id}>
                        <Link
                          href={`/crm/${a.oportunidadId}`}
                          className="block pt-3 text-xs font-medium text-acento hover:underline"
                        >
                          {a.oportunidad} {a.cliente && <span className="text-texto-3">· {a.cliente}</span>}
                        </Link>
                        <ul>
                          <ActividadPendiente a={a} oportunidadId={a.oportunidadId} editar={editar} />
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-6 text-center text-sm text-texto-3">Nada por acá.</p>
                )}
              </Panel>
            )
          })}
        </div>
      )}
    </>
  )
}
