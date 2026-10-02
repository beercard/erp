import type { Metadata } from 'next'

import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { obtenerConfiguracion } from '@/modulos/servicio/configuracion'
import { listarTecnicos } from '@/modulos/servicio/servicio'
import { listarZonas } from '@/modulos/servicio/zonas'

import { paginaContratos } from '../../contratos/modulo'
import { BorrarZona, NuevaZona, ZonasDelTecnico } from './Formularios'

export const metadata: Metadata = { title: 'Zonas de trabajo' }

/** Zonas de trabajo y a qué técnicos se asignan: si en jornada salen de todas, queda una alerta. */
export default async function Zonas() {
  const sesion = await paginaContratos('servicio.configurar')
  const { zonas, tecnicos, config } = await conEmpresa(sesion, async (tx) => ({
    zonas: await listarZonas(tx),
    tecnicos: await listarTecnicos(tx),
    config: await obtenerConfiguracion(tx),
  }))
  return (
    <>
      <EncabezadoPagina
        titulo="Zonas de trabajo"
        bajada="Un centro y un radio. Si un técnico en jornada sale de todas sus zonas, queda una alerta en su día y se avisa a coordinación por email; al volver, otra. Sin zonas asignadas no se controla."
      />
      {!config.emailCoordinacion && (
        <div className="mb-4">
          <Aviso tono="aviso">
            Para recibir el aviso por email, cargá el email de coordinación en Servicio técnico › Configuración.
          </Aviso>
        </div>
      )}
      <Panel className="mb-4 p-4">
        <NuevaZona />
      </Panel>
      {zonas.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Zonas</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-borde">
                {zonas.map((z) => (
                  <tr key={z.id}>
                    <td className="px-4 py-2 font-medium">{z.nombre}</td>
                    <td className="cifras px-4 py-2 text-right">{z.radioKm.toLocaleString('es-AR')} km</td>
                    <td className="px-4 py-2">
                      <a
                        href={`https://www.google.com/maps?q=${z.lat},${z.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-acento hover:underline"
                      >
                        centro
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs text-texto-2">
                      {z.tecnicos.length} técnico{z.tecnicos.length === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <BorrarZona id={z.id} nombre={z.nombre} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Zonas de cada técnico</h2>
            <ul className="divide-y divide-borde">
              {tecnicos.map((t) => (
                <li key={t.id} className="px-4 py-2">
                  <span className="mb-1 block text-sm font-medium">{t.nombre}</span>
                  <ZonasDelTecnico
                    tecnicoId={t.id}
                    zonas={zonas.map((z) => ({ id: z.id, nombre: z.nombre }))}
                    elegidas={zonas.filter((z) => z.tecnicos.includes(t.id)).map((z) => z.id)}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  )
}
