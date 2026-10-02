import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ConstanciaServicio } from '@/components/servicio/ConstanciaServicio'
import { conEmpresa } from '@/db/empresa'
import { datosEmpresa } from '@/modulos/empresa/datos'
import { ordenDelCliente } from '@/modulos/portal/portal'

import { requerirPortal } from '../../../../sesion'

export const metadata: Metadata = { title: 'Constancia de servicio' }

export default async function ConstanciaPortal({ params }: PageProps<'/portal/ordenes/[id]/constancia'>) {
  const s = await requerirPortal()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [o, empresa] = await Promise.all([conEmpresa(s.empresaId, (tx) => ordenDelCliente(tx, s, id)), datosEmpresa(s.empresaId)])
  if (!o || !empresa) notFound()
  return (
    <div className="-mx-4 -my-6 bg-white text-black">
      <ConstanciaServicio empresa={empresa} o={o} archivos="/portal/archivo" />
    </div>
  )
}
