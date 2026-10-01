import { ChevronLeft, Pencil, Printer } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ChipEstado, VistaDocumento } from '@/components/comercial/VistaDocumento'
import { Aviso, Boton, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { fechaCorta, sumarDias } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { obtenerPresupuesto } from '@/modulos/comercial/documentos'

import { convertirAccion, estadoPresupuestoAccion } from '../../comercial/acciones'

export const metadata: Metadata = { title: 'Presupuesto' }

export default async function Presupuesto({ params, searchParams }: PageProps<'/presupuestos/[id]'>) {
  const { id } = await params
  const { guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const p = await enLaEmpresa('ventas.ver', (tx) => obtenerPresupuesto(tx, id))
  if (!p) notFound()
  const puede = tienePermiso(sesion.permisos, 'ventas.presupuestos')
  const editable = puede && ['borrador', 'enviado'].includes(p.estado)
  const vence = sumarDias(p.fecha, p.validezDias)

  return (
    <>
      <Link href="/presupuestos" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Presupuestos
      </Link>
      <EncabezadoPagina
        titulo={`Presupuesto ${String(p.numero).padStart(6, '0')}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <ChipEstado estado={p.estado} />
            <span>
              {p.cliente?.razonSocial} · {fechaCorta(p.fecha)} · válido hasta el {fechaCorta(vence)}
            </span>
          </span>
        }
        acciones={
          <>
            <BotonEnlace href={`/imprimir/presupuesto/${p.id}`} target="_blank">
              <Printer aria-hidden className="size-4" /> Imprimir
            </BotonEnlace>
            {editable && (
              <BotonEnlace href={`/presupuestos/${p.id}/editar`}>
                <Pencil aria-hidden className="size-4" /> Modificar
              </BotonEnlace>
            )}
          </>
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Presupuesto grabado.</Aviso>
        </div>
      )}
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {p.pedido && (
        <div className="mb-4">
          <Aviso tono="info">
            Se convirtió en el{' '}
            <Link href={`/pedidos/${p.pedido.id}`} className="font-medium underline">
              pedido {String(p.pedido.numero).padStart(6, '0')}
            </Link>
            .
          </Aviso>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Panel>
          <VistaDocumento moneda={p.moneda} items={p.items} />
          {p.observaciones && (
            <p className="border-t border-borde px-3 py-3 text-sm whitespace-pre-line text-texto-2">{p.observaciones}</p>
          )}
        </Panel>
        {puede && !p.pedido && (
          <Panel className="flex h-fit flex-col gap-2 p-4">
            <h2 className="mb-1 text-sm font-semibold">Acciones</h2>
            {p.estado !== 'rechazado' && (
              <form action={convertirAccion.bind(null, p.id)}>
                <Boton type="submit" variante="primario" className="w-full">
                  Aceptado: convertir en pedido
                </Boton>
              </form>
            )}
            {p.estado === 'borrador' && (
              <form action={estadoPresupuestoAccion.bind(null, p.id, 'enviado')}>
                <Boton type="submit" className="w-full">
                  Marcar como enviado
                </Boton>
              </form>
            )}
            {['borrador', 'enviado'].includes(p.estado) && (
              <form action={estadoPresupuestoAccion.bind(null, p.id, 'rechazado')}>
                <Boton type="submit" variante="fantasma" className="w-full">
                  El cliente lo rechazó
                </Boton>
              </form>
            )}
            {p.estado === 'rechazado' && (
              <form action={estadoPresupuestoAccion.bind(null, p.id, 'borrador')}>
                <Boton type="submit" className="w-full">
                  Volver a borrador
                </Boton>
              </form>
            )}
          </Panel>
        )}
      </div>
    </>
  )
}
