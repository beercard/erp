import type { Metadata } from 'next'

import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { sumarDias } from '@/modulos/servicio/agenda'
import { listarExcepciones } from '@/modulos/servicio/excepciones'
import { listarTecnicos } from '@/modulos/servicio/servicio'

import { paginaContratos } from '../../contratos/modulo'
import { BorrarExcepcion, NuevaExcepcion } from './Formularios'

export const metadata: Metadata = { title: 'Licencias y feriados' }

const fecha = (iso: string) => iso.split('-').reverse().join('/')

/** Licencias, vacaciones, feriados y horarios especiales: el asistente de huecos y el calendario los respetan. */
export default async function Licencias() {
  const sesion = await paginaContratos('servicio.ver')
  const editar = tienePermiso(sesion.permisos, 'servicio.cargar')
  const hoy = hoyArgentina()
  const { lista, tecnicos } = await conEmpresa(sesion, async (tx) => ({
    lista: await listarExcepciones(tx, sumarDias(hoy, -30)),
    tecnicos: await listarTecnicos(tx),
  }))
  return (
    <>
      <EncabezadoPagina
        titulo="Licencias y feriados"
        bajada="Días en que un técnico no trabaja o trabaja en otro horario. Un feriado sin técnico vale para todos. El asistente de huecos y el calendario los respetan."
      />
      {editar && (
        <Panel className="mb-4 p-4">
          <NuevaExcepcion tecnicos={tecnicos.map((t) => ({ id: t.id, nombre: t.nombre }))} hoy={hoy} />
        </Panel>
      )}
      <Panel className="overflow-x-auto">
        {lista.length ? (
          <table className="w-full min-w-[640px] text-sm">
            <tbody className="divide-y divide-borde">
              {lista.map(({ e, tecnico }) => (
                <tr key={e.id} className={e.hasta < hoy ? 'text-texto-3' : ''}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {fecha(e.desde)}
                    {e.hasta !== e.desde && ` al ${fecha(e.hasta)}`}
                  </td>
                  <td className="px-4 py-2">{tecnico ?? <Chip tono="info">Todos</Chip>}</td>
                  <td className="px-4 py-2">
                    {e.tipo === 'ausencia' ? (
                      <Chip tono="error">No trabaja</Chip>
                    ) : (
                      <Chip tono="aviso">
                        {e.jornadaDesde}–{e.jornadaHasta}
                      </Chip>
                    )}
                  </td>
                  <td className="px-4 py-2">{e.motivo}</td>
                  <td className="px-4 py-2 text-right">{editar && <BorrarExcepcion id={e.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-3 text-sm text-texto-2">No hay licencias ni feriados cargados.</p>
        )}
      </Panel>
    </>
  )
}
