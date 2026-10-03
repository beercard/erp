import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { bloqueos, MODULOS_BLOQUEABLES, type ModuloBloqueable } from '@/modulos/empresa/bloqueos'

import { FormularioBloqueo } from './Formulario'

export const metadata: Metadata = { title: 'Cierre de períodos' }

/** Cierre de módulos por fecha: lo cerrado no se carga, modifica ni anula. */
export default async function CierreDePeriodos() {
  await exigirPermiso('empresa.bloqueos')
  const actuales = await enLaEmpresa('empresa.bloqueos', (tx) => bloqueos(tx))
  const hoy = hoyArgentina()
  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        titulo="Cierre de períodos"
        bajada="Con un módulo cerrado hasta una fecha, nadie puede cargar, modificar ni anular nada de ese módulo con fecha hasta ese día. Para corregir algo, se reabre corriendo la fecha para atrás."
      />
      <Panel className="divide-y divide-borde">
        {(Object.keys(MODULOS_BLOQUEABLES) as ModuloBloqueable[]).map((m) => (
          <div key={m} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <h2 className="font-semibold">{MODULOS_BLOQUEABLES[m].nombre}</h2>
              <p className="text-sm text-texto-2">{MODULOS_BLOQUEABLES[m].detalle}</p>
              <p className="mt-1 text-sm">
                {actuales[m] ? (
                  <>
                    Cerrado hasta el <b className="cifras">{actuales[m]!.split('-').reverse().join('/')}</b>
                  </>
                ) : (
                  <span className="text-texto-3">Abierto</span>
                )}
              </p>
            </div>
            <FormularioBloqueo key={actuales[m] ?? ''} modulo={m} actual={actuales[m] ?? null} hoy={hoy} />
          </div>
        ))}
      </Panel>
      <p className="mt-3 text-xs text-texto-3">
        Los períodos de IVA ya presentados quedan cerrados aparte, desde Impuestos, y la contabilidad se cierra con el ejercicio.
      </p>
    </>
  )
}
