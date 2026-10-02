import { Download } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { sumarDias } from '@/modulos/servicio/agenda'
import { jornadas } from '@/modulos/servicio/jornada'

import { paginaContratos } from '../../contratos/modulo'

export const metadata: Metadata = { title: 'Jornadas de los técnicos' }

const hora = (d: Date | null) =>
  d
    ? d.toLocaleTimeString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—'
const duracion = (m: number | null) => (m === null ? '—' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`)
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Fichadas, horas, kilómetros y visitas de cada técnico por día. */
export default async function Jornadas({ searchParams }: PageProps<'/servicio/jornadas'>) {
  const sesion = await paginaContratos('servicio.cargar')
  const q = (await searchParams) as { desde?: string; hasta?: string }
  const hasta = q.hasta && FECHA.test(q.hasta) ? q.hasta : hoyArgentina()
  const desde = q.desde && FECHA.test(q.desde) && q.desde <= hasta ? q.desde : sumarDias(hasta, -6)
  const filas = await conEmpresa(sesion.empresa.id, (tx) =>
    jornadas(tx, desde, sumarDias(desde, 92) < hasta ? sumarDias(desde, 92) : hasta),
  )
  const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'
  return (
    <>
      <EncabezadoPagina
        titulo="Jornadas de los técnicos"
        bajada="Entrada y salida fichadas, horas, kilómetros según el GPS, visitas y tiempo en los clientes (geocercas)."
      />
      <form className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-texto-2">
          Desde
          <input type="date" name="desde" defaultValue={desde} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-texto-2">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} className={control} />
        </label>
        <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Ver</button>
        <a
          href={`/servicio/jornadas/excel?desde=${desde}&hasta=${hasta}`}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2"
        >
          <Download aria-hidden className="size-4" /> Excel
        </a>
      </form>
      <Panel className="overflow-x-auto">
        {filas.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">Sin fichadas, recorridos ni visitas en esas fechas.</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Día</th>
                <th className="px-4 py-2 font-medium">Técnico</th>
                <th className="px-4 py-2 font-medium">Entrada</th>
                <th className="px-4 py-2 font-medium">Salida</th>
                <th className="px-4 py-2 text-right font-medium">Horas</th>
                <th className="px-4 py-2 text-right font-medium">Km (GPS)</th>
                <th className="px-4 py-2 text-right font-medium">Visitas</th>
                <th className="px-4 py-2 text-right font-medium">En clientes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f) => (
                <tr key={`${f.tecnicoId}${f.fecha}`}>
                  <td className="cifras px-4 py-2 whitespace-nowrap">
                    <Link
                      href={`/servicio/jornadas/dia?tecnico=${f.tecnicoId}&fecha=${f.fecha}`}
                      className="text-acento hover:underline"
                    >
                      {f.fecha.split('-').reverse().join('/')}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{f.tecnico}</td>
                  <td className="cifras px-4 py-2">{hora(f.entrada)}</td>
                  <td className="cifras px-4 py-2">
                    {f.entrada && !f.salida ? <span className="text-aviso">sin salida</span> : hora(f.salida)}
                  </td>
                  <td className="cifras px-4 py-2 text-right">{duracion(f.minutos)}</td>
                  <td className="cifras px-4 py-2 text-right">{f.km ? f.km.toLocaleString('es-AR') : '—'}</td>
                  <td className="cifras px-4 py-2 text-right">
                    {f.hechas}/{f.visitas}
                  </td>
                  <td className="cifras px-4 py-2 text-right">{f.minutosEnClientes ? duracion(f.minutosEnClientes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
