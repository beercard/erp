import { ChevronLeft } from 'lucide-react'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina } from '@/components/ui'
import { exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'

import { ImportarArca } from './ImportarArca'

export const metadata: Metadata = { title: 'Mis Comprobantes de ARCA' }

export default async function Importar() {
  const sesion = await exigirPermiso('compras.ver')
  return (
    <>
      <Link href="/compras" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Compras
      </Link>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="mis-comprobantes" />}
        titulo="Mis Comprobantes de ARCA"
        bajada="Bajá de ARCA los comprobantes recibidos del período y compará: qué falta cargar y qué cargaste que ARCA no tiene."
      />
      <ImportarArca puedeCargar={tienePermiso(sesion.permisos, 'compras.cargar')} />
    </>
  )
}
