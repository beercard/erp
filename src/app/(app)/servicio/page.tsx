import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarOrdenes, listarTecnicos, resumenOrdenes } from '@/modulos/servicio/servicio'
import { ESTADOS_ORDEN, TIPOS_ORDEN } from '@/modulos/servicio/tipos'

import { paginaContratos } from '../contratos/modulo'
import { ChipEstado } from './ChipEstado'

export const metadata: Metadata = { title: 'Servicio técnico' }

/** Días entre dos fechas AAAA-MM-DD. */
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)

export default async function Servicio({ searchParams }: PageProps<'/servicio'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { q, estado, tecnico } = (await searchParams) as { q?: string; estado?: string; tecnico?: string }
  const { lista, resumen, tecnicos } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    lista: await listarOrdenes(tx, { q, estado: estado ?? 'abiertas', tecnicoId: tecnico || undefined }),
    resumen: await resumenOrdenes(tx),
    tecnicos: await listarTecnicos(tx),
  }))
  const hoy = hoyArgentina()

  return (
    <>
      <EncabezadoPagina
        titulo="Servicio técnico"
        bajada={
          <>
            {resumen.abiertas} abiertas
            {resumen.sinAsignar > 0 && ` · ${resumen.sinAsignar} sin asignar`}
            {resumen.urgentes > 0 && ` · ${resumen.urgentes} urgentes`}
            {resumen.porFacturar > 0 && (
              <>
                {' · '}
                <Link href="/servicio?estado=resuelta" className="text-acento hover:underline">
                  {resumen.porFacturar} con cargo para facturar
                </Link>
              </>
            )}
          </>
        }
        acciones={
          tienePermiso(sesion.permisos, 'servicio.cargar') && (
            <BotonEnlace href="/servicio/nueva" variante="primario">
              <Plus aria-hidden className="size-4" /> Nueva orden
            </BotonEnlace>
          )
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cliente, serie, falla o número"
          className="h-9 min-w-64 flex-1 rounded-md border border-borde bg-superficie px-2.5 text-sm focus:border-acento"
        />
        <select
          name="estado"
          defaultValue={estado ?? 'abiertas'}
          className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
        >
          <option value="abiertas">Abiertas</option>
          {Object.entries(ESTADOS_ORDEN).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
          <option value="todas">Todas</option>
        </select>
        {tecnicos.length > 0 && (
          <select
            name="tecnico"
            defaultValue={tecnico ?? ''}
            className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
          >
            <option value="">Todos los técnicos</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        )}
        <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Buscar</button>
      </form>
      {lista.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">
          {q || (estado && estado !== 'abiertas') ? 'No hay órdenes que coincidan.' : 'No hay órdenes abiertas.'}
          {tecnicos.length === 0 && tienePermiso(sesion.permisos, 'maestros.configuracion') && (
            <>
              {' '}
              Para asignarlas, cargá los técnicos en{' '}
              <Link href="/configuracion/tecnicos" className="text-acento hover:underline">
                Configuración › Técnicos
              </Link>
              .
            </>
          )}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">N°</th>
                <th className="px-4 py-2 font-medium">Cliente y equipo</th>
                <th className="px-4 py-2 font-medium">Pedido</th>
                <th className="px-4 py-2 font-medium">Técnico</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((o) => {
                const abierta = o.estado === 'pendiente' || o.estado === 'asignada'
                const demora = abierta ? dias(o.fecha, hoy) : null
                return (
                  <tr key={o.id} className="group align-top hover:bg-superficie-2">
                    <td className="cifras px-4 py-2">
                      <Link href={`/servicio/${o.id}`} className="font-medium group-hover:text-acento">
                        {o.numero}
                      </Link>
                      <span className="block text-xs text-texto-3">{o.fecha}</span>
                    </td>
                    <td className="px-4 py-2">
                      {o.cliente}
                      {o.serie && (
                        <span className="block text-xs text-texto-3">
                          <span className="cifras">{o.serie}</span>
                          {o.modelo ? ` · ${o.modelo}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="max-w-80 px-4 py-2">
                      <span className="line-clamp-2">{o.falla}</span>
                      <span className="text-xs text-texto-3">{TIPOS_ORDEN[o.tipo as keyof typeof TIPOS_ORDEN]}</span>
                    </td>
                    <td className="px-4 py-2">
                      {o.tecnico ?? <span className="text-texto-3">Sin asignar</span>}
                      {o.programada && abierta && (
                        <span className={`block text-xs ${o.programada < hoy ? 'text-error' : 'text-texto-3'}`}>
                          Visita {o.programada === hoy ? 'hoy' : o.programada}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {o.prioridad === 'urgente' && abierta && <Chip tono="error">Urgente</Chip>}
                        <ChipEstado estado={o.estado} cobertura={o.cobertura} facturada={!!o.comprobanteId} />
                      </div>
                      {demora !== null && demora > 0 && (
                        <span className={`text-xs ${demora > 3 ? 'text-aviso' : 'text-texto-3'}`}>
                          hace {demora} {demora === 1 ? 'día' : 'días'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
