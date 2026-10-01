import { inArray } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EncabezadoPagina } from '@/components/ui'
import { articulos } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { obtenerPedido } from '@/modulos/comercial/documentos'

import { opcionesDocumento } from '../../comercial/opciones'
import { FormularioRemito, type RenglonRemito } from './FormularioRemito'

export const metadata: Metadata = { title: 'Nuevo remito' }

export default async function NuevoRemito({ searchParams }: PageProps<'/remitos/nuevo'>) {
  await exigirPermiso('ventas.remitos')
  const { pedido: pedidoId } = await searchParams
  const datos = await enLaEmpresa('ventas.remitos', async (tx) => {
    const opciones = await opcionesDocumento(tx)
    if (typeof pedidoId !== 'string') return { opciones, pedido: null }
    if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return null
    const pedido = await obtenerPedido(tx, pedidoId)
    if (!pedido) return null
    const ids = pedido.items.map((i) => i.articuloId).filter((x): x is string => Boolean(x))
    const arts = ids.length ? await tx.select().from(articulos).where(inArray(articulos.id, ids)) : []
    return { opciones, pedido, arts: new Map(arts.map((a) => [a.id, a])) }
  })
  if (!datos) notFound()
  const { opciones, pedido } = datos

  const renglones: RenglonRemito[] = pedido
    ? pedido.items
        .map((i) => {
          const pendiente = Number(i.cantidad) - Number(i.cantidadEntregada)
          const art = i.articuloId ? datos.arts?.get(i.articuloId) : undefined
          return {
            clave: i.id,
            articuloId: i.articuloId,
            codigo: art?.codigo ?? null,
            descripcion: i.descripcion,
            cantidad: String(pendiente),
            pendiente: String(pendiente),
            pedidoItemId: i.id,
            llevaSerie: Boolean(art?.llevaSerie),
            series: '',
          }
        })
        .filter((r) => Number(r.pendiente) > 0)
    : []

  return (
    <>
      <EncabezadoPagina
        titulo={pedido ? `Entregar el pedido ${String(pedido.numero).padStart(6, '0')}` : 'Nuevo remito'}
        bajada={
          pedido
            ? 'Por defecto se entrega todo lo pendiente. Para una entrega parcial, cambiá las cantidades (cero no se entrega).'
            : 'Remito sin pedido: elegí el cliente y los artículos.'
        }
      />
      <FormularioRemito
        pedido={pedido ? { id: pedido.id, numero: pedido.numero } : null}
        cliente={pedido?.cliente ? { id: pedido.cliente.id, razonSocial: pedido.cliente.razonSocial } : null}
        renglones={renglones}
        hoy={hoyArgentina()}
        opciones={{
          puntosVenta: opciones.puntosVenta
            .filter((p) => p.tipo === 'remitos' || p.tipo === 'electronico')
            .map((p) => ({ valor: String(p.numero), texto: `${String(p.numero).padStart(4, '0')} · ${p.nombre}` })),
          depositos: opciones.depositos,
          transportes: opciones.transportes,
          depositoPedido: pedido?.depositoId ?? null,
        }}
      />
    </>
  )
}
