import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { listarArticulos, listasDisponibles } from '@/modulos/maestros/articulos'

export const metadata: Metadata = { title: 'Artículos y precios' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$', '060': '€' }

export default async function PaginaArticulos({ searchParams }: PageProps<'/articulos'>) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const { listas, filas, lista } = await enLaEmpresa('maestros.ver', async (tx) => {
    const listas = await listasDisponibles(tx)
    const lista = listas.find((l) => l.id === params.lista) ?? listas[0]
    return { listas, lista, filas: await listarArticulos(tx, { q, listaId: lista?.id }) }
  })
  const base = lista?.listaBaseId ? listas.find((l) => l.id === lista.listaBaseId) : null
  const moneda = base?.moneda ?? lista?.moneda ?? 'PES'

  return (
    <>
      <EncabezadoPagina
        titulo="Artículos y precios"
        bajada={`${filas.length.toLocaleString('es-AR')} artículos${q ? ` para “${q}”` : ''}`}
        acciones={
          <BotonEnlace href="/articulos/nuevo" variante="primario">
            <Plus aria-hidden className="size-4" /> Nuevo
          </BotonEnlace>
        }
      />
      <form className="mb-3 flex flex-wrap items-end gap-3" role="search">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-texto-2">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Nombre, código o código de barras"
            className="h-9 w-full max-w-md rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-3 text-sm placeholder:text-texto-3 focus:border-acento"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="lista" className="text-xs font-medium text-texto-2">
            Lista de precios
          </label>
          <select
            id="lista"
            name="lista"
            defaultValue={lista?.id}
            className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm"
          >
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-3 text-sm font-medium hover:bg-superficie-2"
        >
          Ver
        </button>
      </form>
      {base && lista?.porcentaje && (
        <p className="mb-3 text-xs text-texto-2">
          “{lista.nombre}” se calcula sobre “{base.nombre}” con un {Number(lista.porcentaje) >= 0 ? 'recargo' : 'descuento'} del{' '}
          <span className="cifras">{Math.abs(Number(lista.porcentaje)).toLocaleString('es-AR')} %</span>.
        </p>
      )}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium">Artículo</th>
              <th className="px-4 py-2.5 font-medium">Rubro</th>
              <th className="px-4 py-2.5 font-medium">IVA</th>
              <th className="px-4 py-2.5 text-right font-medium">Costo</th>
              <th className="px-4 py-2.5 text-right font-medium">Precio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-texto-2">
                  {q ? 'No hay artículos que coincidan.' : 'Todavía no hay artículos cargados.'}
                </td>
              </tr>
            )}
            {filas.map((a) => (
              <tr key={a.id} className="hover:bg-superficie-2">
                <td className="cifras px-4 py-2.5 text-texto-2">{a.codigo}</td>
                <td className="px-4 py-2.5">
                  <Link href={`/articulos/${a.id}`} className="font-medium hover:text-acento">
                    {a.nombre}
                  </Link>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {a.marca && <span className="text-xs text-texto-3">{a.marca}</span>}
                    {a.tipo === 'servicio' && <Chip>Servicio</Chip>}
                    {a.llevaSerie && <Chip tono="acento">Con número de serie</Chip>}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{a.rubro ?? '—'}</td>
                <td className="px-4 py-2.5 text-texto-2">{a.iva}</td>
                <td className="cifras px-4 py-2.5 text-right whitespace-nowrap text-texto-2">
                  {a.costo ? formatearMonto(a.costo, SIMBOLO[a.monedaCosto] ?? a.monedaCosto) : '—'}
                </td>
                <td className="cifras px-4 py-2.5 text-right font-medium whitespace-nowrap">
                  {a.precio ? (
                    formatearMonto(a.precio, SIMBOLO[moneda] ?? moneda)
                  ) : (
                    <span className="text-texto-3">Sin precio</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
