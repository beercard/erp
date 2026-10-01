import { eq } from 'drizzle-orm'
import { ChevronLeft, Pencil, Printer, Truck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ChipEstado, VistaDocumento } from '@/components/comercial/VistaDocumento'
import { Aviso, Boton, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { remitos } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { obtenerPedido } from '@/modulos/comercial/documentos'
import { formatearNumero } from '@/modulos/comercial/numeracion'

import { cancelarPedidoAccion } from '../../comercial/acciones'

export const metadata: Metadata = { title: 'Pedido' }

export default async function Pedido({ params, searchParams }: PageProps<'/pedidos/[id]'>) {
  const { id } = await params
  const { guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('ventas.ver', async (tx) => {
    const p = await obtenerPedido(tx, id)
    if (!p) return null
    const entregas = await tx.select().from(remitos).where(eq(remitos.pedidoId, id))
    return { p, entregas }
  })
  if (!datos) notFound()
  const { p, entregas } = datos
  const sinEntregas = p.items.every((i) => Number(i.cantidadEntregada) === 0)
  const abierto = ['pendiente', 'parcial'].includes(p.estado)
  const puedeEditar = tienePermiso(sesion.permisos, 'ventas.pedidos')
  const puedeEntregar = tienePermiso(sesion.permisos, 'ventas.remitos')

  return (
    <>
      <Link href="/pedidos" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Pedidos
      </Link>
      <EncabezadoPagina
        titulo={`Pedido ${String(p.numero).padStart(6, '0')}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <ChipEstado estado={p.estado} />
            <span>
              {p.cliente?.razonSocial} · {fechaCorta(p.fecha)}
              {p.fechaEntrega && ` · entrega prevista ${fechaCorta(p.fechaEntrega)}`}
            </span>
          </span>
        }
        acciones={
          <>
            <BotonEnlace href={`/imprimir/pedido/${p.id}`} target="_blank">
              <Printer aria-hidden className="size-4" /> Imprimir
            </BotonEnlace>
            {puedeEditar && p.estado === 'pendiente' && sinEntregas && (
              <BotonEnlace href={`/pedidos/${p.id}/editar`}>
                <Pencil aria-hidden className="size-4" /> Modificar
              </BotonEnlace>
            )}
            {puedeEntregar && abierto && (
              <BotonEnlace href={`/remitos/nuevo?pedido=${p.id}`} variante="primario">
                <Truck aria-hidden className="size-4" /> Entregar
              </BotonEnlace>
            )}
          </>
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Pedido grabado.</Aviso>
        </div>
      )}
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Panel>
          <VistaDocumento moneda={p.moneda} items={p.items} entregas />
          {p.observaciones && (
            <p className="border-t border-borde px-3 py-3 text-sm whitespace-pre-line text-texto-2">{p.observaciones}</p>
          )}
        </Panel>
        <aside className="flex flex-col gap-4">
          <Panel>
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Remitos</h2>
            <ul className="divide-y divide-borde">
              {entregas.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <Link href={`/remitos/${r.id}`} className="cifras font-medium hover:text-acento">
                    {formatearNumero(r.puntoVenta, r.numero)}
                  </Link>
                  <ChipEstado estado={r.estado} />
                </li>
              ))}
              {!entregas.length && <li className="px-4 py-3 text-xs text-texto-3">Todavía no se entregó nada.</li>}
            </ul>
          </Panel>
          {puedeEditar && abierto && (
            <form action={cancelarPedidoAccion.bind(null, p.id)}>
              <Boton type="submit" variante="fantasma" className="w-full">
                {sinEntregas ? 'Cancelar el pedido' : 'Cancelar lo que falta entregar'}
              </Boton>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
