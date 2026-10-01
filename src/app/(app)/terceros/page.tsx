import { UserPlus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { listarTerceros } from '@/modulos/maestros/terceros'

export const metadata: Metadata = { title: 'Clientes y proveedores' }

const PESTANAS = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'clientes', texto: 'Clientes' },
  { valor: 'proveedores', texto: 'Proveedores' },
] as const

export default async function PaginaTerceros({ searchParams }: PageProps<'/terceros'>) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const tipo = PESTANAS.some((p) => p.valor === params.tipo) ? (params.tipo as 'todos' | 'clientes' | 'proveedores') : 'todos'
  const filas = await enLaEmpresa('maestros.ver', (tx) => listarTerceros(tx, { q, tipo }))

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes y proveedores"
        bajada={`${filas.length.toLocaleString('es-AR')} ${filas.length === 1 ? 'resultado' : 'resultados'}${q ? ` para “${q}”` : ''}`}
        acciones={
          <BotonEnlace href="/terceros/nuevo" variante="primario">
            <UserPlus aria-hidden className="size-4" /> Nuevo
          </BotonEnlace>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <nav aria-label="Tipo" className="flex rounded-md border border-borde bg-superficie p-0.5">
          {PESTANAS.map((p) => (
            <Link
              key={p.valor}
              href={{ pathname: '/terceros', query: { ...(q && { q }), ...(p.valor !== 'todos' && { tipo: p.valor }) } }}
              aria-current={tipo === p.valor ? 'page' : undefined}
              className={`rounded px-3 py-1 text-sm font-medium ${tipo === p.valor ? 'bg-acento-suave text-acento' : 'text-texto-2 hover:text-texto'}`}
            >
              {p.texto}
            </Link>
          ))}
        </nav>
        <form className="flex-1" role="search">
          {tipo !== 'todos' && <input type="hidden" name="tipo" value={tipo} />}
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, código, CUIT o email y Enter"
            className="h-9 w-full max-w-md rounded-md border border-borde bg-superficie px-3 text-sm placeholder:text-texto-3 focus:border-acento"
          />
        </form>
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium">Razón social</th>
              <th className="px-4 py-2.5 font-medium">Documento</th>
              <th className="px-4 py-2.5 font-medium">Condición de IVA</th>
              <th className="px-4 py-2.5 font-medium">Localidad</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-texto-2">
                  {q
                    ? 'No hay coincidencias. Probá con otra parte del nombre o el CUIT sin guiones.'
                    : 'Todavía no hay clientes ni proveedores cargados.'}
                </td>
              </tr>
            )}
            {filas.map((t) => (
              <tr key={t.id} className="group hover:bg-superficie-2">
                <td className="cifras px-4 py-2.5 text-texto-2">{t.codigo}</td>
                <td className="px-4 py-2.5">
                  <Link href={`/terceros/${t.id}`} className="font-medium text-texto group-hover:text-acento">
                    {t.razonSocial}
                  </Link>
                  {t.nombreFantasia && <span className="block text-xs text-texto-3">{t.nombreFantasia}</span>}
                </td>
                <td className="cifras px-4 py-2.5 whitespace-nowrap text-texto-2">
                  {t.numeroDocumento
                    ? `${t.tipoDocumento} ${t.tipoDocumento === 'CUIT' || t.tipoDocumento === 'CUIL' ? formatearCuit(t.numeroDocumento) : t.numeroDocumento}`
                    : '—'}
                </td>
                <td className="px-4 py-2.5 text-texto-2">{t.condicionIva}</td>
                <td className="px-4 py-2.5 text-texto-2">{[t.localidad, t.provincia].filter(Boolean).join(', ') || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className="flex gap-1">
                    {t.esCliente && <Chip tono="info">Cliente</Chip>}
                    {t.esProveedor && <Chip tono="aviso">Proveedor</Chip>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
