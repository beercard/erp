import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, EncabezadoPagina } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { calendario, lunesDe, sumarDias } from '@/modulos/servicio/agenda'
import { generarPreventivos } from '@/modulos/servicio/preventivo'
import { marcarVencidas } from '@/modulos/servicio/servicio'
import { AYUDA_ESTADOS, ESTADOS_ORDEN, type EstadoOrden } from '@/modulos/servicio/tipos'

import { paginaContratos } from '../../contratos/modulo'
import { TONO_ESTADO } from '../ChipEstado'
import { Calendario } from './Calendario'

export const metadata: Metadata = { title: 'Calendario de servicio técnico' }

const LEYENDA: EstadoOrden[] = [
  'proyectada',
  'asignada',
  'informe',
  'vencida',
  'cerrada_ok',
  'cerrada_desvio',
  'cerrada_no_cumplida',
]
const PUNTO = { neutro: 'bg-texto-3', info: 'bg-info', acento: 'bg-acento', error: 'bg-error', ok: 'bg-ok', aviso: 'bg-aviso' }

export default async function CalendarioServicio({ searchParams }: PageProps<'/servicio/calendario'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { semana } = (await searchParams) as { semana?: string }
  const hoy = hoyArgentina()
  const lunes = lunesDe(semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : hoy)
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
  const mover = tienePermiso(sesion.permisos, 'servicio.cargar')
  const datos = await conEmpresa(sesion.empresa.id, async (tx) => {
    await marcarVencidas(tx)
    if (mover) await generarPreventivos(tx, sesion.usuario.id)
    return calendario(tx, dias[0], dias[6])
  })
  const fecha = (d: string) => d.split('-').reverse().join('/')

  return (
    <>
      <EncabezadoPagina
        titulo="Calendario"
        bajada={`Semana del ${fecha(dias[0])} al ${fecha(dias[6])}. ${mover ? 'Arrastrá las órdenes para programarlas.' : ''}`}
        acciones={
          <>
            <BotonEnlace href={`/servicio/calendario?semana=${sumarDias(lunes, -7)}`}>
              <ChevronLeft aria-hidden className="size-4" /> Anterior
            </BotonEnlace>
            <BotonEnlace href="/servicio/calendario">Esta semana</BotonEnlace>
            <BotonEnlace href={`/servicio/calendario?semana=${sumarDias(lunes, 7)}`}>
              Siguiente <ChevronRight aria-hidden className="size-4" />
            </BotonEnlace>
            {mover && (
              <BotonEnlace href="/servicio/nueva" variante="primario">
                <Plus aria-hidden className="size-4" /> Nueva orden
              </BotonEnlace>
            )}
          </>
        }
      />
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-2">
        {LEYENDA.map((e) => (
          <li key={e} title={AYUDA_ESTADOS[e]} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-full ${PUNTO[TONO_ESTADO[e]]}`} />
            {ESTADOS_ORDEN[e]}
          </li>
        ))}
      </ul>
      {datos.tecnicos.length === 0 && (
        <p className="mb-3 text-sm text-texto-2">
          No hay técnicos: se cargan en{' '}
          <Link href="/configuracion/tecnicos" className="text-acento hover:underline">
            Configuración › Técnicos
          </Link>
          , con su jornada y los días que trabajan.
        </p>
      )}
      <Calendario dias={dias} hoy={hoy} mover={mover} {...datos} />
    </>
  )
}
