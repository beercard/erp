import { ChevronLeft, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { catalogo, listarCatalogo, opcionesCatalogo } from '@/modulos/configuracion/catalogos'

import { cambiarEstadoAccion } from '../acciones'
import { FormularioCatalogo } from '../FormularioCatalogo'

export async function generateMetadata({ params }: PageProps<'/configuracion/[clave]'>): Promise<Metadata> {
  return { title: catalogo((await params).clave)?.titulo ?? 'Configuración' }
}

function aTexto(v: unknown): string | boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

export default async function PaginaCatalogo({ params, searchParams }: PageProps<'/configuracion/[clave]'>) {
  const { clave } = await params
  const { editar, nuevo, guardado } = await searchParams
  const def = catalogo(clave)
  if (!def) notFound()
  const sesion = await requerirEmpresa()
  const puedeEditar = tienePermiso(sesion.permisos, 'maestros.configuracion')

  const editarId = typeof editar === 'string' ? editar : undefined
  const { filas, opciones } = await enLaEmpresa('maestros.ver', async (tx) => ({
    filas: await listarCatalogo(tx, def),
    opciones: await opcionesCatalogo(tx, def, editarId),
  }))
  const enEdicion = editarId ? filas.find((f) => f.id === editarId) : undefined
  const mostrarFormulario = puedeEditar && (nuevo === '1' || Boolean(enEdicion))
  const columnas = def.campos.filter((c) => c.enListado)
  const textoOpcion = (campo: string, valor: unknown) =>
    opciones[campo]?.find((o) => o.valor === valor)?.texto ?? (valor ? '—' : '')

  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        titulo={def.titulo}
        bajada={def.descripcion}
        acciones={
          puedeEditar && !mostrarFormulario ? (
            <BotonEnlace href={`/configuracion/${clave}?nuevo=1`} variante="primario">
              <Plus aria-hidden className="size-4" /> Nuevo
            </BotonEnlace>
          ) : null
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Cambios grabados.</Aviso>
        </div>
      )}
      <div className={mostrarFormulario ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]' : ''}>
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                {columnas.map((c) => (
                  <th key={c.nombre} className={`px-4 py-2.5 font-medium ${c.tipo === 'numero' ? 'text-right' : ''}`}>
                    {c.etiqueta}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium">Estado</th>
                {puedeEditar && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.length === 0 && (
                <tr>
                  <td colSpan={columnas.length + 2} className="px-4 py-10 text-center text-texto-2">
                    Todavía no hay {def.titulo.toLowerCase()} cargados.
                  </td>
                </tr>
              )}
              {filas.map((f) => {
                const activo = f[def.nombreActivo] as boolean
                return (
                  <tr key={String(f.id)} className={`hover:bg-superficie-2 ${f.id === editarId ? 'bg-acento-suave' : ''}`}>
                    {columnas.map((c) => (
                      <td
                        key={c.nombre}
                        className={`px-4 py-2.5 ${c.tipo === 'numero' ? 'cifras text-right' : ''} ${c.nombre === columnas[0].nombre ? 'font-medium' : 'text-texto-2'}`}
                      >
                        {c.tipo === 'seleccion'
                          ? textoOpcion(c.nombre, f[c.nombre]) || '—'
                          : c.tipo === 'numero' && f[c.nombre] !== null
                            ? Number(f[c.nombre]).toLocaleString('es-AR', { maximumFractionDigits: 4 })
                            : (aTexto(f[c.nombre]) as string) || '—'}
                      </td>
                    ))}
                    <td className="px-4 py-2.5">{activo ? <Chip tono="ok">Activo</Chip> : <Chip>De baja</Chip>}</td>
                    {puedeEditar && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Link
                          href={`/configuracion/${clave}?editar=${f.id}`}
                          className="text-xs font-medium text-acento hover:underline"
                        >
                          Modificar
                        </Link>
                        <form action={cambiarEstadoAccion.bind(null, clave, String(f.id), !activo)} className="ml-3 inline">
                          <button type="submit" className="text-xs font-medium text-texto-2 hover:text-texto">
                            {activo ? 'Dar de baja' : 'Reactivar'}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
        {mostrarFormulario && (
          <Panel className="h-fit p-4">
            <FormularioCatalogo
              key={editarId ?? 'nuevo'}
              clave={clave}
              id={enEdicion ? String(enEdicion.id) : null}
              singular={def.singular}
              campos={def.campos.map(({ nombre, etiqueta, tipo, requerido, ayuda }) => ({
                nombre,
                etiqueta,
                tipo,
                requerido,
                ayuda,
              }))}
              opciones={opciones}
              inicial={
                enEdicion
                  ? Object.fromEntries(
                      Object.entries(enEdicion).map(([k, v]) => [
                        k,
                        def.campos.some((c) => c.nombre === k && c.tipo === 'numero') && v !== null
                          ? String(Number(v))
                          : aTexto(v),
                      ]),
                    )
                  : { moneda: 'PES', cuotas: '1', dias: '0' }
              }
            />
          </Panel>
        )}
      </div>
    </>
  )
}
