import { FileUp, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/formato'
import { listarCompras } from '@/modulos/compras/compras'
import { abreviaturaCompra } from '@/modulos/compras/tipos'

export const metadata: Metadata = { title: 'Compras' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Compras({ searchParams }: PageProps<'/compras'>) {
  const { q, periodo } = await searchParams
  const sesion = await requerirEmpresa()
  const texto = typeof q === 'string' ? q : ''
  const mes = typeof periodo === 'string' && /^\d{4}-\d{2}$/.test(periodo) ? periodo : ''
  const filas = await enLaEmpresa('compras.ver', (tx) => listarCompras(tx, { q: texto, periodo: mes || undefined }))
  const puede = tienePermiso(sesion.permisos, 'compras.cargar')

  return (
    <>
      <EncabezadoPagina
        titulo="Comprobantes de compra"
        bajada={`${filas.length} comprobantes${filas.length === 300 ? ' (los últimos 300; buscá o filtrá por período)' : ''}`}
        acciones={
          puede && (
            <>
              <BotonEnlace href="/compras/importar">
                <FileUp aria-hidden className="size-4" /> Mis Comprobantes de ARCA
              </BotonEnlace>
              <BotonEnlace href="/compras/nueva" variante="primario">
                <Plus aria-hidden className="size-4" /> Registrar compra
              </BotonEnlace>
            </>
          )
        }
      />
      <form role="search" className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex w-full max-w-sm flex-col gap-1">
          <span className="sr-only">Buscar</span>
          <input
            name="q"
            defaultValue={texto}
            placeholder="Proveedor, CUIT o número, y Enter"
            className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-3 text-sm placeholder:text-texto-3 focus:border-acento"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-texto-2">Período de IVA</span>
          <input
            type="month"
            name="periodo"
            defaultValue={mes}
            className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm focus:border-acento"
          />
        </label>
        <button type="submit" className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">
          Filtrar
        </button>
      </form>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Comprobante</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 font-medium">IVA</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-texto-2">
                  No hay comprobantes{texto || mes ? ' con este filtro' : ' todavía'}.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className={`group hover:bg-superficie-2 ${f.estado === 'anulado' ? 'text-texto-3' : ''}`}>
                <td className="cifras px-4 py-2.5 whitespace-nowrap">
                  <Link href={`/compras/${f.id}`} className="font-medium group-hover:text-acento">
                    <span className="mr-2 inline-block w-10 text-texto-2">{abreviaturaCompra(f.tipo)}</span>
                    {formatearNumero(f.puntoVenta, f.numero)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{fechaCorta(f.fecha)}</td>
                <td className="px-4 py-2.5">{f.proveedor}</td>
                <td className="cifras px-4 py-2.5 text-texto-2">{f.periodoIva}</td>
                <td className="cifras px-4 py-2.5 text-right whitespace-nowrap">
                  {abreviaturaCompra(f.tipo).startsWith('NC') ? '−' : ''}
                  {formatearMonto(f.total, SIMBOLO[f.moneda] ?? f.moneda)}
                </td>
                <td className="px-4 py-2.5">
                  {f.estado === 'anulado' ? (
                    <Chip tono="error">Anulado</Chip>
                  ) : f.origen === 'mis_comprobantes' ? (
                    <Chip>ARCA</Chip>
                  ) : f.origen === 'pymexis' ? (
                    <Chip>PYMEXIS</Chip>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
