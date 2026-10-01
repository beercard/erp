import { and, eq } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Aviso, EncabezadoPagina } from '@/components/ui'
import { comoPlataforma } from '@/db/empresa'
import { roles } from '@/db/schema'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { MODULOS_PERMISOS, tienePermiso } from '@/lib/permisos'

import { FormularioRol } from './FormularioRol'

export const metadata: Metadata = { title: 'Rol' }

export default async function PaginaRol({ params }: PageProps<'/configuracion/usuarios/roles/[id]'>) {
  const { id } = await params
  const sesion = await requerirEmpresa()
  if (!tienePermiso(sesion.permisos, 'empresa.usuarios')) return <Aviso>No tenés permiso para administrar roles.</Aviso>
  let rol: typeof roles.$inferSelect | null = null
  if (id !== 'nuevo') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
    ;[rol] = await comoPlataforma((tx) =>
      tx
        .select()
        .from(roles)
        .where(and(eq(roles.id, id), eq(roles.empresaId, sesion.empresa.id))),
    )
    if (!rol) notFound()
  }
  return (
    <>
      <Link href="/configuracion/usuarios" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Usuarios y roles
      </Link>
      <EncabezadoPagina titulo={rol ? rol.nombre : 'Nuevo rol'} bajada="Marcá lo que puede hacer quien tenga este rol." />
      <FormularioRol
        id={rol?.id ?? null}
        nombre={rol?.nombre ?? ''}
        descripcion={rol?.descripcion ?? ''}
        permisos={rol?.permisos ?? ['maestros.ver']}
        modulos={MODULOS_PERMISOS}
      />
    </>
  )
}
