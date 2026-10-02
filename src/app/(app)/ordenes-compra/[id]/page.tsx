import { ChevronLeft, PackageCheck, Pencil, Printer } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { obtenerOrden } from '@/modulos/compras/ordenes'

import { cancelarOrdenAccion } from '../../compras/acciones'
import { ESTADO_ORDEN } from '../estados'

export const metadata: Metadata = { title: 'Orden de compra' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const cantidad = (v: string) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 4 })

export default async function Orden({ params, searchParams }: PageProps<'/ordenes-compra/[id]'>) {
  const { id } = await params
  const { guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const o = await enLaEmpresa('compras.ver', (tx) => obtenerOrden(tx, id))
  if (!o) notFound()
  const simbolo = SIMBOLO[o.moneda] ?? o.moneda
  const estado = ESTADO_ORDEN[o.estado as keyof typeof ESTADO_ORDEN]
  const abierta = o.estado === 'pendiente' || o.estado === 'parcial'
  const puede = tienePermiso(sesion.permisos, 'compras.cargar')
  const numero = String(o.numero).padStart(6, '0')

  return (
    <>
      <Link href="/ordenes-compra" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Órdenes de compra
      </Link>
      <EncabezadoPagina
        titulo={`Orden de compra ${numero}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tono={estado.tono}>{estado.texto}</Chip>
            <Link href={`/terceros/${o.terceroId}`} className="hover:text-acento">
              {o.proveedor?.razonSocial}
            </Link>
            · {fechaCorta(o.fecha)}
            {o.fechaEntrega && ` · entrega ${fechaCorta(o.fechaEntrega)}`}
          </span>
        }
        acciones={
          <>
            <BotonEnlace href={`/imprimir/orden-compra/${o.id}`} target="_blank">
              <Printer aria-hidden className="size-4" /> Imprimir
            </BotonEnlace>
            {puede && o.estado === 'pendiente' && (
              <BotonEnlace href={`/ordenes-compra/${o.id}/editar`}>
                <Pencil aria-hidden className="size-4" /> Modificar
              </BotonEnlace>
            )}
            {puede && abierta && (
              <BotonEnlace href={`/compras/nueva?orden=${o.id}`} variante="primario">
                <PackageCheck aria-hidden className="size-4" /> Recibir con la factura
              </BotonEnlace>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {guardado && <Aviso tono="ok">Orden {numero} grabada.</Aviso>}
        {typeof error === 'string' && <Aviso>{error}</Aviso>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                <th className="px-4 py-2 font-medium">Artículo</th>
                <th className="px-4 py-2 text-right font-medium">Pedido</th>
                <th className="px-4 py-2 text-right font-medium">Recibido</th>
                <th className="px-4 py-2 text-right font-medium">Falta</th>
                <th className="px-4 py-2 text-right font-medium">Precio</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2">{i.descripcion}</td>
                  <td className="cifras px-4 py-2 text-right">{cantidad(i.cantidad)}</td>
                  <td className="cifras px-4 py-2 text-right">{cantidad(i.recibido)}</td>
                  <td className={`cifras px-4 py-2 text-right ${Number(i.pendiente) > 0 ? 'text-aviso' : 'text-texto-3'}`}>
                    {cantidad(i.pendiente)}
                  </td>
                  <td className="cifras px-4 py-2 text-right">{formatearMonto(i.precioUnitario, simbolo)}</td>
                  <td className="cifras px-4 py-2 text-right">{formatearMonto(i.neto, simbolo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="cifras ml-auto flex max-w-xs flex-col gap-1 border-t border-borde px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="font-sans text-texto-2">Neto</dt>
              <dd>{formatearMonto(o.neto, simbolo)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-sans text-texto-2">IVA</dt>
              <dd>{formatearMonto(o.iva, simbolo)}</dd>
            </div>
            <div className="flex justify-between border-t border-borde pt-1 font-medium">
              <dt className="font-sans">Total</dt>
              <dd>{formatearMonto(o.total, simbolo)}</dd>
            </div>
          </dl>
          {o.observaciones && (
            <p className="border-t border-borde px-4 py-3 text-sm whitespace-pre-line text-texto-2">{o.observaciones}</p>
          )}
        </Panel>
        <aside className="flex flex-col gap-3">
          {puede && abierta && (
            <form action={cancelarOrdenAccion.bind(null, o.id)}>
              <BotonConfirmar
                variante="fantasma"
                className="w-full"
                pregunta={`¿Cancelar la orden ${numero}? Lo que falta recibir ya no se espera.`}
              >
                Cancelar la orden
              </BotonConfirmar>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
