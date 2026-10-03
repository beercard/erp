import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarOrdenes } from '@/modulos/compras/ordenes'

import { ESTADO_ORDEN } from './estados'

export const metadata: Metadata = { title: 'Órdenes de compra' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const FILTROS = [
  { valor: 'abiertas', texto: 'Abiertas' },
  { valor: '', texto: 'Todas' },
  { valor: 'recibida', texto: 'Recibidas' },
  { valor: 'cancelada', texto: 'Canceladas' },
]

export default async function Ordenes({ searchParams }: PageProps<'/ordenes-compra'>) {
  const { q, estado } = await searchParams
  const sesion = await requerirEmpresa()
  const texto = typeof q === 'string' ? q : ''
  const filtro = typeof estado === 'string' && FILTROS.some((f) => f.valor === estado) ? estado : 'abiertas'
  const filas = await enLaEmpresa('compras.ver', (tx) => listarOrdenes(tx, { q: texto, estado: filtro || undefined }))
  const hoy = hoyArgentina()
  const enlace = (e: string) => `/ordenes-compra?${new URLSearchParams({ ...(texto && { q: texto }), estado: e })}`
  return (
    <>
      <EncabezadoPagina
        titulo="Órdenes de compra"
        bajada="Lo pedido a proveedores. Se reciben al registrar la factura."
        acciones={
          tienePermiso(sesion.permisos, 'compras.cargar') && (
            <BotonEnlace href="/ordenes-compra/nueva" variante="primario">
              <Plus aria-hidden className="size-4" /> Nueva orden
            </BotonEnlace>
          )
        }
      />
      <nav aria-label="Filtrar por estado" className="mb-3 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={enlace(f.valor)}
            aria-current={filtro === f.valor ? 'page' : undefined}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
              filtro === f.valor ? 'border-acento bg-acento-suave text-acento' : 'border-borde text-texto-2 hover:bg-superficie-2'
            }`}
          >
            {f.texto}
          </Link>
        ))}
      </nav>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Número</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 font-medium">Entrega</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-texto-2">
                  No hay órdenes{filtro ? ' con este filtro' : ''}.
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const atrasada = f.fechaEntrega && f.fechaEntrega < hoy && (f.estado === 'pendiente' || f.estado === 'parcial')
              return (
                <tr key={f.id} className="group hover:bg-superficie-2">
                  <td className="cifras px-4 py-2.5">
                    <Link href={`/ordenes-compra/${f.id}`} className="font-medium group-hover:text-acento">
                      {String(f.numero).padStart(6, '0')}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-texto-2">{fechaCorta(f.fecha)}</td>
                  <td className="px-4 py-2.5">{f.proveedor}</td>
                  <td className={`px-4 py-2.5 ${atrasada ? 'text-error' : 'text-texto-2'}`}>
                    {f.fechaEntrega ? fechaCorta(f.fechaEntrega) : '—'}
                    {atrasada && ' (atrasada)'}
                  </td>
                  <td className="cifras px-4 py-2.5 text-right">{formatearMonto(f.total, SIMBOLO[f.moneda] ?? f.moneda)}</td>
                  <td className="px-4 py-2.5">
                    <Chip tono={ESTADO_ORDEN[f.estado as keyof typeof ESTADO_ORDEN].tono}>
                      {ESTADO_ORDEN[f.estado as keyof typeof ESTADO_ORDEN].texto}
                    </Chip>
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
