import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { ChipEstado } from '@/components/comercial/VistaDocumento'
import { BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/numeracion'
import { listarRemitos } from '@/modulos/comercial/remitos'

export const metadata: Metadata = { title: 'Remitos' }

export default async function Remitos({ searchParams }: PageProps<'/remitos'>) {
  const { q } = await searchParams
  const sesion = await requerirEmpresa()
  const texto = typeof q === 'string' ? q : ''
  const filas = await enLaEmpresa('ventas.ver', (tx) => listarRemitos(tx, texto))
  return (
    <>
      <EncabezadoPagina
        titulo="Remitos"
        bajada={`${filas.length} remitos${texto ? ` para “${texto}”` : ''}`}
        acciones={
          tienePermiso(sesion.permisos, 'ventas.remitos') && (
            <BotonEnlace href="/remitos/nuevo" variante="primario">
              <Plus aria-hidden className="size-4" /> Remito sin pedido
            </BotonEnlace>
          )
        }
      />
      <form className="mb-3" role="search">
        <label htmlFor="q" className="sr-only">
          Buscar
        </label>
        <input
          id="q"
          name="q"
          defaultValue={texto}
          placeholder="Número o cliente, y Enter"
          className="h-9 w-full max-w-sm rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-3 text-sm placeholder:text-texto-3 focus:border-acento"
        />
      </form>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Número</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Depósito</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-texto-2">
                  Todavía no hay remitos. Se emiten desde un pedido (Entregar) o sin pedido.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="group hover:bg-superficie-2">
                <td className="cifras px-4 py-2.5">
                  <Link href={`/remitos/${f.id}`} className="font-medium group-hover:text-acento">
                    {formatearNumero(f.puntoVenta, f.numero)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{fechaCorta(f.fecha)}</td>
                <td className="px-4 py-2.5">{f.cliente}</td>
                <td className="px-4 py-2.5 text-texto-2">{f.deposito}</td>
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
