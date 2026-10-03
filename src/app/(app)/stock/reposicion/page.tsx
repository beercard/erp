import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { faltantes } from '@/modulos/comercial/reposicion'

import { TablaReposicion } from './Tabla'

export const metadata: Metadata = { title: 'Reposición' }

/** Artículos por debajo del mínimo (contando lo ya pedido) y las órdenes de compra sugeridas. */
export default async function Reposicion({ searchParams }: PageProps<'/stock/reposicion'>) {
  const sesion = await requerirEmpresa()
  const { ordenes, sinProveedor } = await searchParams
  const filas = await enLaEmpresa('stock.ver', (tx) => faltantes(tx))
  return (
    <>
      <Link href="/stock" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Stock
      </Link>
      <EncabezadoPagina
        titulo="Reposición"
        bajada="Lo que quedó por debajo del stock mínimo, contando lo que ya está pedido y no llegó. Se sugiere pedir el lote del artículo o hasta el doble del mínimo, al proveedor habitual o al de la última compra."
      />
      {typeof ordenes === 'string' && (
        <div className="mb-4 flex flex-col gap-2">
          <Aviso tono="ok">
            Se armaron {ordenes} órdenes de compra.{' '}
            <Link href="/ordenes-compra" className="font-medium underline">
              Revisarlas y mandarlas
            </Link>
          </Aviso>
          {typeof sinProveedor === 'string' && (
            <Aviso tono="aviso">Quedaron sin pedir (no tienen proveedor): {sinProveedor}.</Aviso>
          )}
        </div>
      )}
      {filas.length ? (
        <TablaReposicion filas={filas} puede={tienePermiso(sesion.permisos, 'compras.cargar')} />
      ) : (
        <Panel className="px-5 py-10 text-center text-sm text-texto-2">
          Nada por reponer: todos los artículos con mínimo están cubiertos (o ya pedidos).
        </Panel>
      )}
    </>
  )
}
