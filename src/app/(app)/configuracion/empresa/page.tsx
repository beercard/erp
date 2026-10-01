import { asc } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, EncabezadoPagina } from '@/components/ui'
import { comoPlataforma } from '@/db/empresa'
import { provincias } from '@/db/schema'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { tienePermiso } from '@/lib/permisos'
import { datosEmpresa } from '@/modulos/empresa/datos'

import { FormularioEmpresa } from './FormularioEmpresa'

export const metadata: Metadata = { title: 'Datos de la empresa' }

export default async function DatosEmpresa({ searchParams }: PageProps<'/configuracion/empresa'>) {
  const sesion = await requerirEmpresa()
  const { guardado } = await searchParams
  if (!tienePermiso(sesion.permisos, 'empresa.datos'))
    return <Aviso>No tenés permiso para modificar los datos de la empresa.</Aviso>
  const empresa = await datosEmpresa(sesion.empresa.id)
  const provs = await comoPlataforma((tx) => tx.select().from(provincias).orderBy(asc(provincias.nombre)))
  if (!empresa) return null
  const inicial = Object.fromEntries(
    Object.entries(empresa).map(([k, v]) => [k, v === null ? null : v instanceof Date ? v.toISOString() : String(v)]),
  )
  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        titulo="Datos de la empresa"
        bajada={
          <>
            CUIT <span className="cifras">{formatearCuit(empresa.cuit)}</span>. El CUIT no se modifica: identifica a la empresa
            ante ARCA.
          </>
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Datos grabados.</Aviso>
        </div>
      )}
      <FormularioEmpresa inicial={inicial} provincias={provs.map((p) => ({ valor: p.codigo, texto: p.nombre }))} />
    </>
  )
}
