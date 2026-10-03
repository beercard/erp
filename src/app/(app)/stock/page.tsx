import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa } from '@/lib/auth/servidor'
import { listarStock } from '@/modulos/comercial/stock'

export const metadata: Metadata = { title: 'Stock' }

const POR_PAGINA = 200

export default async function Stock({ searchParams }: PageProps<'/stock'>) {
  const { q, con } = await searchParams
  const texto = typeof q === 'string' ? q : ''
  const soloConStock = con === '1'
  const { depositos, filas } = await enLaEmpresa('stock.ver', (tx) => listarStock(tx, texto))
  const total = (saldos: Map<string, string>) => [...saldos.values()].reduce((s, v) => s + Number(v), 0)
  const visibles = soloConStock ? filas.filter((f) => total(f.saldos) !== 0) : filas
  // Solo las columnas de depósitos que tienen algo; el resto ensucia la tabla.
  const conMovimiento = depositos.filter((d) => filas.some((f) => f.saldos.has(d.id)))
  const columnas = conMovimiento.length ? conMovimiento : depositos.slice(0, 1)

  return (
    <>
      <EncabezadoPagina
        titulo="Stock"
        bajada={`${visibles.length} artículos${texto ? ` para “${texto}”` : ''}${
          visibles.length > POR_PAGINA ? ` · se muestran los primeros ${POR_PAGINA}, buscá para acotar` : ''
        }`}
      />
      <form className="mb-3 flex flex-wrap items-center gap-3" role="search">
        <label htmlFor="q" className="sr-only">
          Buscar
        </label>
        <input
          id="q"
          name="q"
          defaultValue={texto}
          placeholder="Nombre o código, y Enter"
          className="h-9 w-full max-w-sm rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-3 text-sm placeholder:text-texto-3 focus:border-acento"
        />
        <label className="flex items-center gap-2 text-sm text-texto-2">
          <input type="checkbox" name="con" value="1" defaultChecked={soloConStock} className="size-4 accent-[var(--acento)]" />
          Solo con existencias
        </label>
        <button type="submit" className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">
          Filtrar
        </button>
      </form>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium">Artículo</th>
              {columnas.map((d) => (
                <th key={d.id} className="px-4 py-2.5 text-right font-medium">
                  {d.nombre}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={columnas.length + 3} className="px-4 py-10 text-center text-texto-2">
                  No hay artículos con stock para mostrar.
                </td>
              </tr>
            )}
            {visibles.slice(0, POR_PAGINA).map((f) => {
              const t = total(f.saldos)
              const bajo = f.stockMinimo !== null && t < Number(f.stockMinimo)
              return (
                <tr key={f.id} className="group hover:bg-superficie-2">
                  <td className="cifras px-4 py-2 text-texto-2">{f.codigo}</td>
                  <td className="px-4 py-2">
                    <Link href={`/stock/${f.id}`} className="font-medium group-hover:text-acento">
                      {f.nombre}
                    </Link>
                  </td>
                  {columnas.map((d) => {
                    const v = Number(f.saldos.get(d.id) ?? 0)
                    return (
                      <td
                        key={d.id}
                        className={`cifras px-4 py-2 text-right ${v < 0 ? 'text-error' : v === 0 ? 'text-texto-3' : ''}`}
                      >
                        {v.toLocaleString('es-AR')}
                      </td>
                    )
                  })}
                  <td className={`cifras px-4 py-2 text-right font-medium ${t < 0 || bajo ? 'text-error' : ''}`}>
                    {t.toLocaleString('es-AR')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
