import type { Metadata } from 'next'

import { ListaDocumentos } from '@/components/comercial/ListaDocumentos'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { listarPedidos } from '@/modulos/comercial/documentos'

export const metadata: Metadata = { title: 'Pedidos' }

const ESTADOS = [
  { valor: 'pendiente', texto: 'Pendientes' },
  { valor: 'parcial', texto: 'Entregados en parte' },
  { valor: 'entregado', texto: 'Entregados' },
  { valor: 'cancelado', texto: 'Cancelados' },
]

export default async function Pedidos({ searchParams }: PageProps<'/pedidos'>) {
  const { q, estado } = await searchParams
  const sesion = await requerirEmpresa()
  const texto = typeof q === 'string' ? q : ''
  const filtroEstado = ESTADOS.some((e) => e.valor === estado) ? (estado as string) : undefined
  const filas = await enLaEmpresa('ventas.ver', (tx) => listarPedidos(tx, { q: texto, estado: filtroEstado }))
  return (
    <ListaDocumentos
      titulo="Pedidos"
      ruta="/pedidos"
      filas={filas}
      estados={ESTADOS}
      estado={filtroEstado}
      q={texto}
      puedeCrear={tienePermiso(sesion.permisos, 'ventas.pedidos')}
      textoNuevo="Nuevo pedido"
    />
  )
}
