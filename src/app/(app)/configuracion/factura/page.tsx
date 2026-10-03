import { ChevronLeft } from 'lucide-react'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { obtenerMarca } from '@/modulos/empresa/marca'

import { Diseno, Logo } from './Formularios'

export const metadata: Metadata = { title: 'Logo y diseño de factura' }

export default async function LogoYDiseno() {
  await exigirPermiso('empresa.datos')
  const m = await enLaEmpresa('empresa.datos', (tx) => obtenerMarca(tx))
  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="diseno-factura" />}
        titulo="Logo y diseño de factura"
        bajada="Cómo se ven tus facturas, notas de crédito y débito impresas, en PDF y en el enlace que reciben tus clientes. Los datos que exige ARCA van igual en los tres diseños."
      />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="p-5">
          <h2 className="mb-3 font-semibold">Logo</h2>
          <Logo logo={m.logo} />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-semibold">Diseño</h2>
          <Diseno key={`${m.diseno}${m.color}`} diseno={m.diseno} color={m.color} />
        </Panel>
      </div>
    </>
  )
}
