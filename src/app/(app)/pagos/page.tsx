import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarPagos } from '@/modulos/compras/pagos'

export const metadata: Metadata = { title: 'Pagos a proveedores' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Pagos({ searchParams }: PageProps<'/pagos'>) {
  const { q } = await searchParams
  const sesion = await requerirEmpresa()
  const texto = typeof q === 'string' ? q : ''
  const filas = await enLaEmpresa('compras.ver', (tx) => listarPagos(tx, texto))
  return (
    <>
      <EncabezadoPagina
        titulo="Pagos a proveedores"
        bajada={`${filas.length} órdenes de pago${filas.length === 300 ? ' (las últimas 300)' : ''}`}
        acciones={
          tienePermiso(sesion.permisos, 'compras.pagar') && (
            <BotonEnlace href="/pagos/nuevo" variante="primario">
              <Plus aria-hidden className="size-4" /> Nueva orden de pago
            </BotonEnlace>
          )
        }
      />
      <form role="search" className="mb-3 w-full max-w-sm">
        <label htmlFor="q" className="sr-only">
          Buscar
        </label>
        <input
          id="q"
          name="q"
          defaultValue={texto}
          placeholder="Proveedor o número, y Enter"
          className="h-9 w-full rounded-md border border-borde bg-superficie px-3 text-sm placeholder:text-texto-3 focus:border-acento"
        />
      </form>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Número</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 text-right font-medium">Cancela</th>
              <th className="px-4 py-2.5 text-right font-medium">Retenido</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-texto-2">
                  No hay pagos{texto ? ' con este filtro' : ' todavía'}.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className={`group hover:bg-superficie-2 ${f.estado === 'anulado' ? 'text-texto-3' : ''}`}>
                <td className="cifras px-4 py-2.5">
                  <Link href={`/pagos/${f.id}`} className="font-medium group-hover:text-acento">
                    {String(f.numero).padStart(6, '0')}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{fechaCorta(f.fecha)}</td>
                <td className="px-4 py-2.5">{f.proveedor}</td>
                <td className="cifras px-4 py-2.5 text-right">{formatearMonto(f.total, SIMBOLO[f.moneda] ?? f.moneda)}</td>
                <td className="cifras px-4 py-2.5 text-right text-texto-2">
                  {Number(f.retenido) > 0 ? formatearMonto(f.retenido, '$') : ''}
                </td>
                <td className="px-4 py-2.5">{f.estado === 'anulado' && <Chip tono="error">Anulado</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
