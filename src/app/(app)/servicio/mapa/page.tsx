import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { sumarDias } from '@/modulos/servicio/agenda'
import { datosMapa } from '@/modulos/servicio/mapa'

import { paginaContratos } from '../../contratos/modulo'
import { PanelMapa } from './PanelMapa'

export const metadata: Metadata = { title: 'Mapa y hojas de ruta' }

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .replace(',', '')

/** Mapa del día (como el de Persat): órdenes, técnicos en vivo y el recorrido de cada uno. */
export default async function MapaServicio({ searchParams }: PageProps<'/servicio/mapa'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { fecha: pedida } = (await searchParams) as { fecha?: string }
  const hoy = hoyArgentina()
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoy
  const datos = await conEmpresa(sesion.empresa.id, (tx) => datosMapa(tx, fecha))
  const flecha = 'flex size-9 items-center justify-center rounded-md border border-borde hover:bg-superficie-2'
  return (
    <>
      <EncabezadoPagina
        titulo="Mapa y hojas de ruta"
        bajada="Las órdenes del día y las que esperan, dónde está cada técnico y el recorrido sugerido."
        acciones={
          <div className="flex items-center gap-2">
            <Link href={`/servicio/mapa?fecha=${sumarDias(fecha, -1)}`} aria-label="Día anterior" className={flecha}>
              <ChevronLeft aria-hidden className="size-4" />
            </Link>
            <span className="min-w-44 text-center text-sm font-medium first-letter:uppercase">
              {fecha === hoy ? 'Hoy, ' : ''}
              {fechaLarga(fecha)}
            </span>
            <Link href={`/servicio/mapa?fecha=${sumarDias(fecha, 1)}`} aria-label="Día siguiente" className={flecha}>
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </div>
        }
      />
      <PanelMapa
        fecha={fecha}
        hoy={fecha === hoy}
        puedeUbicar={tienePermiso(sesion.permisos, 'servicio.cargar')}
        ordenes={datos.ordenes}
        tecnicos={datos.tecnicos}
        rutas={datos.rutas}
      />
    </>
  )
}
