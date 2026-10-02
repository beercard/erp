import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Wrench } from 'lucide-react'

import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { obtenerEquipo } from '@/modulos/contratos/contratos'
import { ordenesDelEquipo } from '@/modulos/servicio/servicio'
import { TIPOS_ORDEN } from '@/modulos/servicio/tipos'

import { FormularioEquipo, FormularioLectura, RetirarEquipo } from '../../contratos/FormulariosContratos'
import { paginaContratos } from '../../contratos/modulo'
import { ChipEstado } from '../../servicio/ChipEstado'
import { opcionesEquipo } from '../opciones'

export const metadata: Metadata = { title: 'Equipo' }

const ORIGEN: Record<string, string> = {
  manual: 'A mano',
  archivo: 'Planilla',
  mps: 'MPS Monitor',
  pymexis: 'PYMEXIS',
  tecnico: 'Técnico',
}

export default async function Equipo({ params, searchParams }: PageProps<'/equipos/[id]'>) {
  const sesion = await paginaContratos('contratos.ver')
  const { id } = await params
  const { guardado } = (await searchParams) as { guardado?: string }
  const datos = await conEmpresa(sesion.empresa.id, async (tx) => {
    const e = await obtenerEquipo(tx, id)
    if (!e) return null
    const [opciones, ordenes] = await Promise.all([
      opcionesEquipo(tx),
      tienePermiso(sesion.permisos, 'servicio.ver') ? ordenesDelEquipo(tx, id) : Promise.resolve(null),
    ])
    return { e, opciones, ordenes }
  })
  if (!datos) notFound()
  const { e, opciones, ordenes } = datos
  const editar = tienePermiso(sesion.permisos, 'contratos.editar')
  const instalado = e.estado === 'instalado'
  const hoy = hoyArgentina()

  return (
    <>
      <EncabezadoPagina
        titulo={`${e.serie}${e.modelo ? ` · ${e.modelo}` : ''}`}
        bajada={
          <>
            {e.cliente ?? 'Sin cliente'}
            {e.contratoId && (
              <>
                {' · '}
                <Link href={`/contratos/${e.contratoId}`} className="text-acento hover:underline">
                  ver contrato
                </Link>
              </>
            )}
            {!instalado && (
              <span className="ml-2">
                <Chip>Retirado el {e.fechaRetiro}</Chip>
              </span>
            )}
          </>
        }
        acciones={
          instalado &&
          tienePermiso(sesion.permisos, 'servicio.cargar') && (
            <BotonEnlace href={`/servicio/nueva?equipo=${e.id}`}>
              <Wrench aria-hidden className="size-4" /> Orden de servicio
            </BotonEnlace>
          )
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Equipo guardado.</Aviso>
        </div>
      )}

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Lecturas del contador</h2>
        {instalado && tienePermiso(sesion.permisos, 'contratos.lecturas') && (
          <div className="border-b border-borde p-4">
            <FormularioLectura equipoId={e.id} hoy={hoy} />
          </div>
        )}
        {e.lecturas.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">
            Sin lecturas. Contador al instalar: <span className="cifras">{e.contadorInicial.toLocaleString('es-AR')}</span>.
          </p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 text-right font-medium">Contador</th>
                <th className="px-4 py-2 text-right font-medium">Copias</th>
                <th className="px-4 py-2 text-right font-medium">Prueba</th>
                <th className="px-4 py-2 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {e.lecturas.map((l, i) => {
                const anterior = e.lecturas[i + 1]?.contador ?? e.contadorInicial
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2">{l.fecha}</td>
                    <td className="cifras px-4 py-2 text-right">{l.contador.toLocaleString('es-AR')}</td>
                    <td className="cifras px-4 py-2 text-right">{(l.contador - anterior).toLocaleString('es-AR')}</td>
                    <td className="cifras px-4 py-2 text-right">{l.creditos || ''}</td>
                    <td className="px-4 py-2 text-xs text-texto-2">{ORIGEN[l.origen] ?? l.origen}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {ordenes && (
        <Panel className="mb-4 overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Servicio técnico</h2>
          {ordenes.length === 0 ? (
            <p className="p-4 text-sm text-texto-2">Sin órdenes de servicio.</p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <tbody className="divide-y divide-borde">
                {ordenes.map((o) => (
                  <tr key={o.id} className="group hover:bg-superficie-2">
                    <td className="cifras px-4 py-2">
                      <Link href={`/servicio/${o.id}`} className="font-medium group-hover:text-acento">
                        {o.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{o.fecha}</td>
                    <td className="px-4 py-2">
                      <span className="line-clamp-1">{o.falla}</span>
                      <span className="text-xs text-texto-3">{TIPOS_ORDEN[o.tipo as keyof typeof TIPOS_ORDEN]}</span>
                    </td>
                    <td className="px-4 py-2">{o.tecnico ?? ''}</td>
                    <td className="px-4 py-2">
                      <ChipEstado
                        estado={o.estado}
                        cobertura={o.cobertura}
                        facturada={!!o.comprobanteId}
                        migrada={o.origen === 'persat' && !o.cerradaPor}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {editar && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold">Datos del equipo</h2>
          <FormularioEquipo id={e.id} inicial={e} {...opciones} />
        </Panel>
      )}
      {editar && instalado && (
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Retirar el equipo</h2>
          <RetirarEquipo id={e.id} hoy={hoy} />
        </Panel>
      )}
    </>
  )
}
