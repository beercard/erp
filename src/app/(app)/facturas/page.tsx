import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { ChipEstado } from '@/components/comercial/VistaDocumento'
import { BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/numeracion'
import { listarComprobantes } from '@/modulos/facturacion/comprobantes'
import { abreviatura } from '@/modulos/facturacion/tipos'

export const metadata: Metadata = { title: 'Facturas' }

const FILTROS = [
  { valor: '', texto: 'Todos' },
  { valor: 'borrador', texto: 'Borradores' },
  { valor: 'pendiente_verificacion', texto: 'Pendientes de ARCA' },
  { valor: 'autorizado', texto: 'Autorizados' },
]
const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Facturas({ searchParams }: PageProps<'/facturas'>) {
  const { q, estado } = await searchParams
  const sesion = await requerirEmpresa()
  const texto = typeof q === 'string' ? q : ''
  const filtro = typeof estado === 'string' && FILTROS.some((f) => f.valor === estado) ? estado : ''
  const filas = await enLaEmpresa('ventas.ver', (tx) => listarComprobantes(tx, { q: texto, estado: filtro || undefined }))
  const enlace = (e: string) => `/facturas?${new URLSearchParams({ ...(texto && { q: texto }), ...(e && { estado: e }) })}`

  return (
    <>
      <EncabezadoPagina
        titulo="Facturas y notas"
        bajada={`${filas.length} comprobantes${filas.length === 300 ? ' (los últimos 300; buscá para acotar)' : ''}`}
        acciones={
          tienePermiso(sesion.permisos, 'ventas.facturar') && (
            <BotonEnlace href="/facturas/nueva" variante="primario">
              <Plus aria-hidden className="size-4" /> Nueva factura
            </BotonEnlace>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form role="search" className="w-full max-w-sm">
          {filtro && <input type="hidden" name="estado" value={filtro} />}
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={texto}
            placeholder="Cliente, número o CAE, y Enter"
            className="h-9 w-full rounded-md border border-borde bg-superficie px-3 text-sm placeholder:text-texto-3 focus:border-acento"
          />
        </form>
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={enlace(f.valor)}
              aria-current={filtro === f.valor ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-xs ${
                filtro === f.valor
                  ? 'border-acento bg-acento-suave text-acento'
                  : 'border-borde text-texto-2 hover:bg-superficie-2'
              }`}
            >
              {f.texto}
            </Link>
          ))}
        </nav>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Comprobante</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-texto-2">
                  No hay comprobantes{filtro || texto ? ' con este filtro' : ' todavía'}.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="group hover:bg-superficie-2">
                <td className="cifras px-4 py-2.5 whitespace-nowrap">
                  <Link href={`/facturas/${f.id}`} className="font-medium group-hover:text-acento">
                    <span className="mr-2 inline-block w-10 text-texto-2">{abreviatura(f.tipo)}</span>
                    {f.numero ? formatearNumero(f.puntoVenta, f.numero) : `${String(f.puntoVenta).padStart(4, '0')}-borrador`}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{fechaCorta(f.fecha)}</td>
                <td className="px-4 py-2.5">{f.cliente}</td>
                <td className="cifras px-4 py-2.5 text-right whitespace-nowrap">
                  {abreviatura(f.tipo).startsWith('NC') ? '−' : ''}
                  {formatearMonto(f.total, SIMBOLO[f.moneda] ?? f.moneda)}
                </td>
                <td className="px-4 py-2.5">
                  <ChipEstado estado={f.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
