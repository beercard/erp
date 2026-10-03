import { Gauge, Plus, Receipt } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { formatearMonto } from '@/lib/dinero'
import { tienePermiso } from '@/lib/permisos'
import { listarContratos } from '@/modulos/contratos/contratos'
import { ESTADOS_CONTRATO, MODALIDADES } from '@/modulos/contratos/tipos'

import { paginaContratos } from './modulo'

export const metadata: Metadata = { title: 'Contratos' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Contratos({ searchParams }: PageProps<'/contratos'>) {
  const sesion = await paginaContratos('contratos.ver')
  const { q, estado } = (await searchParams) as { q?: string; estado?: string }
  const filtroEstado = estado === 'todos' ? undefined : (estado ?? 'activo')
  const lista = await conEmpresa(sesion, (tx) => listarContratos(tx, { q, estado: filtroEstado }))
  const editar = tienePermiso(sesion.permisos, 'contratos.editar')

  return (
    <>
      <EncabezadoPagina
        titulo="Contratos"
        bajada="Contratos por copias: agrupan los equipos de un cliente que se facturan juntos."
        acciones={
          <>
            {tienePermiso(sesion.permisos, 'contratos.lecturas') && (
              <BotonEnlace href="/contratos/lecturas">
                <Gauge aria-hidden className="size-4" /> Lecturas
              </BotonEnlace>
            )}
            {editar && (
              <BotonEnlace href="/contratos/nuevo">
                <Plus aria-hidden className="size-4" /> Nuevo contrato
              </BotonEnlace>
            )}
            {tienePermiso(sesion.permisos, 'contratos.facturar') && (
              <BotonEnlace href="/contratos/facturar" variante="primario">
                <Receipt aria-hidden className="size-4" /> Facturar el mes
              </BotonEnlace>
            )}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cliente o número de contrato"
          className="h-9 min-w-64 flex-1 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2.5 text-sm focus:border-acento"
        />
        <select
          name="estado"
          defaultValue={estado ?? 'activo'}
          className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm"
        >
          {Object.entries(ESTADOS_CONTRATO).map(([k, t]) => (
            <option key={k} value={k}>
              {t}s
            </option>
          ))}
          <option value="todos">Todos</option>
        </select>
        <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Buscar</button>
      </form>
      {lista.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">
          {q
            ? 'No hay contratos que coincidan.'
            : 'Todavía no hay contratos. Se importan de PYMEXIS o se crean con “Nuevo contrato”.'}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">N°</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Modalidad</th>
                <th className="px-4 py-2 text-right font-medium">Cargo fijo</th>
                <th className="px-4 py-2 text-right font-medium">Libres</th>
                <th className="px-4 py-2 text-right font-medium">Por copia</th>
                <th className="px-4 py-2 text-right font-medium">Equipos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((c) => {
                const s = SIMBOLO[c.moneda] ?? c.moneda
                return (
                  <tr key={c.id} className="group hover:bg-superficie-2">
                    <td className="cifras px-4 py-2.5 text-texto-2">{c.numero}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/contratos/${c.id}`} className="font-medium group-hover:text-acento">
                        {c.cliente}
                      </Link>
                      <span className="block text-xs text-texto-3">{c.tipo}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-texto-2">
                      {MODALIDADES[c.modalidad as keyof typeof MODALIDADES]?.split(' (')[0]}
                      {c.facturacion === 'adelantada' && ' · adelantado'}
                      {c.porEquipo && ' · por equipo'}
                      {c.estado !== 'activo' && (
                        <span className="ml-2">
                          <Chip tono="aviso">{ESTADOS_CONTRATO[c.estado as keyof typeof ESTADOS_CONTRATO]}</Chip>
                        </span>
                      )}
                    </td>
                    <td className="cifras px-4 py-2.5 text-right">
                      {Number(c.cargoFijo) ? formatearMonto(c.cargoFijo, s) : '—'}
                    </td>
                    <td className="cifras px-4 py-2.5 text-right">
                      {c.copiasLibres ? c.copiasLibres.toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="cifras px-4 py-2.5 text-right">
                      {Number(c.precioExcedente)
                        ? `${s} ${Number(c.precioExcedente).toLocaleString('es-AR', { maximumFractionDigits: 4 })}`
                        : '—'}
                    </td>
                    <td className="cifras px-4 py-2.5 text-right">{c.equipos}</td>
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
