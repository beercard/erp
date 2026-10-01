import { ChevronLeft, Printer } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ChipEstado } from '@/components/comercial/VistaDocumento'
import { Aviso, Boton, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/numeracion'
import { obtenerRemito } from '@/modulos/comercial/remitos'

import { anularRemitoAccion } from '../../comercial/acciones'

export const metadata: Metadata = { title: 'Remito' }

export default async function Remito({ params, searchParams }: PageProps<'/remitos/[id]'>) {
  const { id } = await params
  const { guardado, error, avisos } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const r = await enLaEmpresa('ventas.ver', (tx) => obtenerRemito(tx, id))
  if (!r) notFound()
  const puedeAnular = tienePermiso(sesion.permisos, 'ventas.remitos') && r.estado === 'emitido'

  return (
    <>
      <Link href="/remitos" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Remitos
      </Link>
      <EncabezadoPagina
        titulo={`Remito ${formatearNumero(r.puntoVenta, r.numero)}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <ChipEstado estado={r.estado} />
            <span>
              {r.cliente?.razonSocial} · {fechaCorta(r.fecha)} · sale de {r.deposito?.nombre}
            </span>
          </span>
        }
        acciones={
          <BotonEnlace href={`/imprimir/remito/${r.id}`} target="_blank">
            <Printer aria-hidden className="size-4" /> Imprimir
          </BotonEnlace>
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Remito emitido.</Aviso>
        </div>
      )}
      {typeof avisos === 'string' && (
        <div className="mb-4">
          <Aviso tono="aviso">
            {avisos.split('\n').map((a) => (
              <span key={a} className="block">
                {a}
              </span>
            ))}
          </Aviso>
        </div>
      )}
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-xs text-texto-2">
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 font-medium">Series</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {r.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2">{i.descripcion}</td>
                  <td className="cifras px-3 py-2 text-right">{Number(i.cantidad).toLocaleString('es-AR')}</td>
                  <td className="cifras px-3 py-2 text-xs text-texto-2">{i.series?.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.observaciones && <p className="border-t border-borde px-3 py-3 text-sm text-texto-2">{r.observaciones}</p>}
        </Panel>
        <aside className="flex flex-col gap-3">
          {r.pedido && (
            <Panel className="p-4 text-sm">
              Del{' '}
              <Link href={`/pedidos/${r.pedido.id}`} className="font-medium text-acento hover:underline">
                pedido {String(r.pedido.numero).padStart(6, '0')}
              </Link>
            </Panel>
          )}
          {puedeAnular && (
            <form action={anularRemitoAccion.bind(null, r.id)}>
              <Boton type="submit" variante="fantasma" className="w-full">
                Anular el remito (devuelve el stock)
              </Boton>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
