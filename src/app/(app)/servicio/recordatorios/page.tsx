import type { Metadata } from 'next'
import Link from 'next/link'

import { Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarRecordatorios } from '@/modulos/servicio/recordatorios'

import { paginaContratos } from '../../contratos/modulo'
import { marcarRecordatorioAccion } from '../acciones'
import { FormularioRecordatorio } from './FormularioRecordatorio'

export const metadata: Metadata = { title: 'Recordatorios' }

export default async function Recordatorios({ searchParams }: PageProps<'/servicio/recordatorios'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { ver } = (await searchParams) as { ver?: string }
  const hechos = ver === 'hechos'
  const lista = await conEmpresa(sesion, (tx) => listarRecordatorios(tx, { estado: hechos ? 'hechos' : 'pendientes' }))
  const cargar = tienePermiso(sesion.permisos, 'servicio.cargar')
  const hoy = hoyArgentina()
  const fecha = (d: string) => d.split('-').reverse().join('/')
  return (
    <>
      <EncabezadoPagina
        titulo="Recordatorios"
        bajada="Seguimiento de clientes: visitas a coordinar, presupuestos, renovaciones. Con aviso por email unos días antes."
        acciones={
          <Link
            href={hechos ? '/servicio/recordatorios' : '/servicio/recordatorios?ver=hechos'}
            className="text-sm text-acento hover:underline"
          >
            {hechos ? 'Ver pendientes' : 'Ver los hechos'}
          </Link>
        }
      />
      {cargar && !hechos && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold">Nuevo recordatorio</h2>
          <FormularioRecordatorio hoy={hoy} email={sesion.usuario.email} />
        </Panel>
      )}
      {lista.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">
          {hechos ? 'No hay recordatorios hechos.' : 'No hay recordatorios pendientes.'}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <tbody className="divide-y divide-borde">
              {lista.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="w-1 py-2 pl-4">
                    <span aria-hidden className="mt-1.5 block size-2.5 rounded-full" style={{ background: r.color }} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={!hechos && r.fecha < hoy ? 'font-medium text-error' : ''}>
                      {r.fecha === hoy ? 'Hoy' : fecha(r.fecha)}
                    </span>
                    {r.hora && <span className="block text-xs text-texto-3">{r.hora}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.titulo}</span>
                    <span className="block text-xs text-texto-2">
                      {r.cliente}
                      {r.serie ? ` · ${r.serie}` : ''}
                    </span>
                    {r.detalle && <span className="block text-xs text-texto-3">{r.detalle}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-texto-2">
                    {r.avisarA ? (
                      r.avisado ? (
                        <Chip tono="ok">Avisado a {r.avisarA}</Chip>
                      ) : (
                        `Aviso a ${r.avisarA}, ${r.diasAntes === 0 ? 'el mismo día' : `${r.diasAntes} día${r.diasAntes > 1 ? 's' : ''} antes`}`
                      )
                    ) : (
                      'Sin aviso'
                    )}
                  </td>
                  {cargar && (
                    <td className="px-4 py-2 text-right">
                      <form action={marcarRecordatorioAccion.bind(null, r.id, !hechos)}>
                        <Boton type="submit" className="h-7 px-2 text-xs">
                          {hechos ? 'Volver a pendiente' : 'Hecho'}
                        </Boton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
