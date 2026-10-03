import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { configuracionResumen, datosResumen, textoResumen } from '@/modulos/informes/resumenDueno'

import { FormularioResumen } from './Formulario'

export const metadata: Metadata = { title: 'Resumen para el dueño' }

export default async function ResumenDueno() {
  const sesion = await exigirPermiso('empresa.datos')
  const hoy = hoyArgentina()
  const { c, muestra } = await enLaEmpresa('empresa.datos', async (tx) => {
    const c = await configuracionResumen(tx)
    const ayer = new Date(new Date(`${hoy}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)
    const semanal = c.frecuencia === 'semanal'
    const desde = semanal ? new Date(new Date(`${hoy}T12:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10) : ayer
    const nombre = sesion.empresa.razonSocial
    return { c, muestra: textoResumen(nombre, await datosResumen(tx, desde, ayer), semanal) }
  })
  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        titulo="Resumen para el dueño"
        bajada="Lo importante del negocio en un mensaje: ventas, cobranzas, deuda vencida, saldos de caja y banco, y lo que hay que mirar."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <FormularioResumen key={[c.frecuencia, c.diaSemana, ...c.correos, ...c.telefonos].join('|')} c={c} />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-2 font-semibold">Así llega hoy</h2>
          <pre className="text-xs leading-relaxed whitespace-pre-wrap text-texto-2">{muestra}</pre>
        </Panel>
      </div>
    </>
  )
}
