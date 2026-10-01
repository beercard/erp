import { Plus } from 'lucide-react'
import Link from 'next/link'

import { BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'

import { ChipEstado } from './VistaDocumento'

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$', '060': '€' }

type Fila = { id: string; numero: number; fecha: string; cliente: string; moneda: string; total: string; estado: string }

/** Listado de presupuestos o pedidos con filtro por estado y búsqueda. */
export function ListaDocumentos({
  titulo,
  ruta,
  filas,
  estados,
  estado,
  q,
  puedeCrear,
  textoNuevo,
}: {
  titulo: string
  ruta: string
  filas: Fila[]
  estados: { valor: string; texto: string }[]
  estado?: string
  q: string
  puedeCrear: boolean
  textoNuevo: string
}) {
  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        bajada={`${filas.length} ${filas.length === 1 ? 'documento' : 'documentos'}${q ? ` para “${q}”` : ''}`}
        acciones={
          puedeCrear && (
            <BotonEnlace href={`${ruta}/nuevo`} variante="primario">
              <Plus aria-hidden className="size-4" /> {textoNuevo}
            </BotonEnlace>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <nav aria-label="Estado" className="flex flex-wrap rounded-md border border-borde bg-superficie p-0.5">
          {[{ valor: '', texto: 'Todos' }, ...estados].map((e) => (
            <Link
              key={e.valor}
              href={{ pathname: ruta, query: { ...(q && { q }), ...(e.valor && { estado: e.valor }) } }}
              aria-current={(estado ?? '') === e.valor ? 'page' : undefined}
              className={`rounded px-3 py-1 text-sm font-medium ${(estado ?? '') === e.valor ? 'bg-acento-suave text-acento' : 'text-texto-2 hover:text-texto'}`}
            >
              {e.texto}
            </Link>
          ))}
        </nav>
        <form className="flex-1" role="search">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Número o cliente, y Enter"
            className="h-9 w-full max-w-sm rounded-md border border-borde bg-superficie px-3 text-sm placeholder:text-texto-3 focus:border-acento"
          />
        </form>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Número</th>
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
                  No hay documentos {estado ? 'en ese estado' : 'todavía'}.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="group hover:bg-superficie-2">
                <td className="cifras px-4 py-2.5">
                  <Link href={`${ruta}/${f.id}`} className="font-medium group-hover:text-acento">
                    {String(f.numero).padStart(6, '0')}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{fechaCorta(f.fecha)}</td>
                <td className="px-4 py-2.5">{f.cliente}</td>
                <td className="cifras px-4 py-2.5 text-right whitespace-nowrap">
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
