import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { tienePermiso } from '@/lib/permisos'
import { equiposConLectura } from '@/modulos/contratos/contratos'
import { COMERCIALIZACIONES } from '@/modulos/contratos/tipos'

import { paginaContratos } from '../contratos/modulo'

export const metadata: Metadata = { title: 'Equipos' }

export default async function Equipos({ searchParams }: PageProps<'/equipos'>) {
  const sesion = await paginaContratos('contratos.ver')
  const { q, estado } = (await searchParams) as { q?: string; estado?: string }
  const lista = await conEmpresa(sesion, (tx) =>
    equiposConLectura(tx, { q, estado: estado === 'todos' ? undefined : (estado ?? 'instalado') }),
  )
  return (
    <>
      <EncabezadoPagina
        titulo="Equipos"
        bajada="Parque instalado: cada equipo con su serie, dónde está y su último contador."
        acciones={
          tienePermiso(sesion.permisos, 'contratos.editar') && (
            <BotonEnlace href="/equipos/nuevo">
              <Plus aria-hidden className="size-4" /> Nuevo equipo
            </BotonEnlace>
          )
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Serie, cliente o modelo"
          className="h-9 min-w-64 flex-1 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2.5 text-sm focus:border-acento"
        />
        <select
          name="estado"
          defaultValue={estado ?? 'instalado'}
          className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm"
        >
          <option value="instalado">Instalados</option>
          <option value="retirado">Retirados</option>
          <option value="todos">Todos</option>
        </select>
        <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Buscar</button>
      </form>
      {lista.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">No hay equipos{q ? ' que coincidan' : ''}.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Serie</th>
                <th className="px-4 py-2 font-medium">Modelo</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Situación</th>
                <th className="px-4 py-2 text-right font-medium">Último contador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((e) => (
                <tr key={e.id} className="group hover:bg-superficie-2">
                  <td className="cifras px-4 py-2">
                    <Link href={`/equipos/${e.id}`} className="font-medium group-hover:text-acento">
                      {e.serie}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{e.modelo}</td>
                  <td className="px-4 py-2">
                    {e.cliente}
                    {e.sector && <span className="block text-xs text-texto-3">{e.sector}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {e.contratoId ? (
                      <Link href={`/contratos/${e.contratoId}`} className="text-acento hover:underline">
                        En contrato
                      </Link>
                    ) : (
                      COMERCIALIZACIONES[e.comercializacion as keyof typeof COMERCIALIZACIONES]
                    )}
                    {e.estado === 'retirado' && (
                      <span className="ml-2">
                        <Chip>Retirado</Chip>
                      </span>
                    )}
                  </td>
                  <td className="cifras px-4 py-2 text-right">
                    {(e.ultimaLectura ?? e.contadorInicial).toLocaleString('es-AR')}
                    <span className="block text-xs text-texto-3">{e.fechaUltimaLectura ?? 'al instalar'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length === 500 && (
            <p className="border-t border-borde p-3 text-xs text-texto-3">Se muestran los primeros 500: buscá para acotar.</p>
          )}
        </Panel>
      )}
    </>
  )
}
