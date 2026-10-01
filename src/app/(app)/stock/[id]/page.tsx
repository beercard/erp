import { asc, eq } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { articulos, depositos } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { movimientosDe, saldos } from '@/modulos/comercial/stock'

import { FormulariosStock } from './FormulariosStock'

export const metadata: Metadata = { title: 'Stock del artículo' }

const TIPOS: Record<string, string> = {
  inicial: 'Saldo inicial',
  ajuste: 'Ajuste',
  transferencia: 'Transferencia',
  remito: 'Remito',
  anulacion_remito: 'Anulación de remito',
  compra: 'Compra',
}

export default async function StockArticulo({ params }: PageProps<'/stock/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('stock.ver', async (tx) => {
    const [art] = await tx.select().from(articulos).where(eq(articulos.id, id))
    if (!art) return null
    const deps = await tx.select().from(depositos).where(eq(depositos.activo, true)).orderBy(asc(depositos.codigo))
    return { art, deps, saldos: await saldos(tx, [id]), movimientos: await movimientosDe(tx, id, 100) }
  })
  if (!datos) notFound()
  const { art, deps } = datos
  const porDeposito = new Map(datos.saldos.map((s) => [s.depositoId, Number(s.cantidad)]))
  const total = [...porDeposito.values()].reduce((s, v) => s + v, 0)

  return (
    <>
      <Link href="/stock" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Stock
      </Link>
      <EncabezadoPagina
        titulo={art.nombre}
        bajada={
          <span>
            <span className="cifras">{art.codigo}</span> · total{' '}
            <span className="cifras font-medium text-texto">{total.toLocaleString('es-AR')}</span>
            {!art.llevaStock && ' · este artículo no lleva stock'} ·{' '}
            <Link href={`/articulos/${art.id}`} className="text-acento hover:underline">
              ficha y precios
            </Link>
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                  <th className="px-4 py-2 font-medium">Depósito</th>
                  <th className="px-4 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {deps.map((d) => {
                  const v = porDeposito.get(d.id) ?? 0
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-2">{d.nombre}</td>
                      <td
                        className={`cifras px-4 py-2 text-right ${v < 0 ? 'text-error' : v === 0 ? 'text-texto-3' : 'font-medium'}`}
                      >
                        {v.toLocaleString('es-AR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Movimientos</h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs text-texto-2">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Depósito</th>
                  <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {datos.movimientos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-texto-2">
                      Sin movimientos.
                    </td>
                  </tr>
                )}
                {datos.movimientos.map((m) => {
                  const v = Number(m.cantidad)
                  const deRemito = (m.tipo === 'remito' || m.tipo === 'anulacion_remito') && m.origenId
                  return (
                    <tr key={m.id}>
                      <td className="cifras px-4 py-2 text-texto-2">
                        {m.fecha.toLocaleString('es-AR', {
                          timeZone: 'America/Argentina/Buenos_Aires',
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-2">
                        {deRemito ? (
                          <Link href={`/remitos/${m.origenId}`} className="text-acento hover:underline">
                            {TIPOS[m.tipo]}
                          </Link>
                        ) : (
                          (TIPOS[m.tipo] ?? m.tipo)
                        )}
                      </td>
                      <td className="px-4 py-2 text-texto-2">{m.deposito}</td>
                      <td className={`cifras px-4 py-2 text-right ${v < 0 ? 'text-error' : 'text-ok'}`}>
                        {v > 0 ? '+' : ''}
                        {v.toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-2 text-texto-2">{m.observacion}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>
        </div>
        {tienePermiso(sesion.permisos, 'stock.ajustar') && (
          <FormulariosStock articuloId={art.id} depositos={deps.map((d) => ({ valor: d.id, texto: d.nombre }))} />
        )}
      </div>
    </>
  )
}
