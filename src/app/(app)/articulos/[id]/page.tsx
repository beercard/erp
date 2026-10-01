import { eq } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Aviso, Chip, EncabezadoPagina } from '@/components/ui'
import { articulos } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { hoyArgentina } from '@/lib/fechas'
import { opcionesArticulo, preciosDeArticulo } from '@/modulos/maestros/articulo'

import { FormularioArticulo } from '../FormularioArticulo'
import { PreciosArticulo } from '../PreciosArticulo'

export const metadata: Metadata = { title: 'Artículo' }

const UUID = /^[0-9a-f-]{36}$/i

export default async function FichaArticulo({ params, searchParams }: PageProps<'/articulos/[id]'>) {
  const { id } = await params
  const { guardado } = await searchParams
  if (!UUID.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const puedeEditar = tienePermiso(sesion.permisos, 'maestros.articulos')
  const datos = await enLaEmpresa('maestros.ver', async (tx) => {
    const [a] = await tx.select().from(articulos).where(eq(articulos.id, id))
    if (!a) return null
    return { a, opciones: await opcionesArticulo(tx), precios: await preciosDeArticulo(tx, id) }
  })
  if (!datos) notFound()
  const { a } = datos
  const inicial = Object.fromEntries(
    Object.entries(a).map(([k, v]) => [
      k,
      v === null || typeof v === 'boolean'
        ? v
        : v instanceof Date
          ? v.toISOString()
          : ['costo', 'stockMinimo'].includes(k)
            ? String(Number(v))
            : String(v),
    ]),
  ) as Record<string, string | boolean | null>

  return (
    <>
      <Link href="/articulos" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Artículos
      </Link>
      <EncabezadoPagina
        titulo={a.nombre}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <span className="cifras">{a.codigo}</span>
            {a.tipo === 'servicio' && <Chip>Servicio</Chip>}
            {a.llevaSerie && <Chip tono="acento">Con número de serie</Chip>}
            {!a.activo && <Chip tono="error">De baja</Chip>}
          </span>
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Cambios grabados.</Aviso>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <FormularioArticulo id={a.id} inicial={inicial} opciones={datos.opciones} soloLectura={!puedeEditar} />
        <PreciosArticulo articuloId={a.id} precios={datos.precios} hoy={hoyArgentina()} soloLectura={!puedeEditar} />
      </div>
    </>
  )
}
