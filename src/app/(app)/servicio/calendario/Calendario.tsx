'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Aviso } from '@/components/ui'
import type { OrdenCalendario } from '@/modulos/servicio/agenda'
import { jornadaDelDia, type Excepcion } from '@/modulos/servicio/jornadaDia'
import { ESTADOS_ORDEN, type EstadoOrden } from '@/modulos/servicio/tipos'

import { moverEnCalendario } from '../acciones'

/**
 * Calendario de coordinación (como el de Persat): una fila por técnico y
 * otra para las proyectadas (con día, sin técnico); las pendientes (sin día)
 * a la izquierda. Arrastrar una orden a una celda la programa ese día con
 * ese técnico; arrastrarla a pendientes le saca el día.
 */

type Tecnico = { id: string; nombre: string; jornadaDesde: string; jornadaHasta: string; dias: string }

const FONDO: Record<EstadoOrden, string> = {
  pendiente: 'bg-superficie-2',
  proyectada: 'bg-info-suave',
  asignada: 'bg-info-suave',
  informe: 'bg-acento-suave',
  vencida: 'bg-error-suave',
  cerrada_ok: 'bg-ok-suave',
  cerrada_desvio: 'bg-aviso-suave',
  cerrada_no_cumplida: 'bg-error-suave',
  cancelada: 'bg-superficie-2',
}
const MOVIBLE: string[] = ['pendiente', 'proyectada', 'asignada', 'vencida']
const NOMBRE_DIA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

function Tarjeta({ o, mover, acompana }: { o: OrdenCalendario; mover: boolean; acompana?: boolean }) {
  // En la fila de un acompañante la orden se ve pero no se arrastra (se mueve desde la del responsable).
  const movible = mover && !acompana && MOVIBLE.includes(o.estado)
  return (
    <Link
      href={`/servicio/${o.id}`}
      draggable={movible}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/orden', o.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      title={`${ESTADOS_ORDEN[o.estado as EstadoOrden]} · ${o.falla}`}
      className={`block rounded border-l-4 px-1.5 py-1 text-xs leading-tight hover:ring-1 hover:ring-acento ${acompana ? 'border-dashed opacity-70' : ''} ${FONDO[o.estado as EstadoOrden] ?? ''} ${movible ? 'cursor-grab active:cursor-grabbing' : ''} ${o.estado === 'vencida' || o.estado === 'informe' ? 'animate-pulse' : ''}`}
      style={{ borderLeftColor: o.color ?? '#94a3b8' }}
    >
      <span className="flex justify-between gap-1">
        <span className="cifras font-medium">{o.hora ?? 's/h'}</span>
        <span className="cifras text-texto-3">N° {o.numero}</span>
      </span>
      <span className="block truncate font-medium">{o.cliente}</span>
      <span className="block truncate text-texto-2">
        {o.prioridad === 'urgente' && <span className="font-semibold text-error">Urgente · </span>}
        {o.tipoOrden ?? o.falla}
        {o.serie ? ` · ${o.serie}` : ''}
      </span>
      {acompana && <span className="block truncate text-texto-3">Acompaña</span>}
      {!acompana && o.acompanantes.length > 0 && (
        <span className="block truncate text-texto-3">+ {o.acompanantes.map((t) => t.nombre).join(', ')}</span>
      )}
      {o.etiquetas.length > 0 && (
        <span className="mt-0.5 flex flex-wrap gap-0.5">
          {o.etiquetas.map((e) => (
            <span
              key={e.id}
              title={e.nombre}
              className="max-w-full truncate rounded-full px-1 text-[10px] leading-4 font-medium text-white"
              style={{ background: e.color }}
            >
              {e.nombre}
            </span>
          ))}
        </span>
      )}
    </Link>
  )
}

export function Calendario({
  dias,
  hoy,
  tecnicos,
  programadas,
  pendientes,
  excepciones,
  mover,
}: {
  dias: string[]
  hoy: string
  tecnicos: Tecnico[]
  programadas: OrdenCalendario[]
  pendientes: OrdenCalendario[]
  excepciones: Excepcion[]
  mover: boolean
}) {
  const router = useRouter()
  const [moviendo, iniciar] = useTransition()
  const [error, setError] = useState('')
  const [sobre, setSobre] = useState<string | null>(null)

  const soltar = (destino: { tecnicoId: string | null; programada: string | null }) => (e: React.DragEvent) => {
    e.preventDefault()
    setSobre(null)
    const id = e.dataTransfer.getData('text/orden')
    if (!id) return
    iniciar(async () => {
      setError('')
      const r = await moverEnCalendario(id, destino)
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }
  const destino = (clave: string, d: { tecnicoId: string | null; programada: string | null }) =>
    mover
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault()
            setSobre(clave)
          },
          onDragLeave: () => setSobre((s) => (s === clave ? null : s)),
          onDrop: soltar(d),
        }
      : {}

  const filas: { id: string | null; nombre: string; tecnico?: Tecnico }[] = [
    { id: null, nombre: 'Sin técnico' },
    ...tecnicos.map((t) => ({ id: t.id, nombre: t.nombre, tecnico: t })),
  ]

  return (
    <div className="flex flex-col gap-3">
      {error && <Aviso>{error}</Aviso>}
      <div className={`grid gap-3 xl:grid-cols-[13rem_minmax(0,1fr)] ${moviendo ? 'opacity-70' : ''}`}>
        <section
          aria-label="Pendientes"
          {...destino('pendientes', { tecnicoId: null, programada: null })}
          className={`flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto rounded-xl border border-borde bg-superficie shadow-suave p-2 ${sobre === 'pendientes' ? 'ring-2 ring-acento' : ''}`}
        >
          <h2 className="px-1 text-xs font-semibold tracking-wide text-texto-2 uppercase">
            Pendientes <span className="font-normal text-texto-3">({pendientes.length})</span>
          </h2>
          {pendientes.length === 0 && <p className="px-1 text-xs text-texto-3">Nada sin programar.</p>}
          {pendientes.map((o) => (
            <Tarjeta key={o.id} o={o} mover={mover} />
          ))}
        </section>

        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie shadow-suave">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-borde text-xs text-texto-2">
                <th className="w-28 px-2 py-2 text-left font-medium">Técnico</th>
                {dias.map((d, i) => (
                  <th key={d} className={`px-2 py-2 text-left font-medium ${d === hoy ? 'text-acento' : ''}`}>
                    {NOMBRE_DIA[i]} {d.slice(8)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f) => (
                <tr key={f.id ?? 'sin'} className="align-top">
                  <th scope="row" className="px-2 py-2 text-left text-xs font-medium">
                    {f.nombre}
                    {f.tecnico && (
                      <span className="block font-normal text-texto-3">
                        {f.tecnico.jornadaDesde}–{f.tecnico.jornadaHasta}
                      </span>
                    )}
                  </th>
                  {dias.map((d) => {
                    const clave = `${f.id}|${d}`
                    const del = programadas.filter((o) => o.programada === d && (o.tecnicoId ?? null) === f.id)
                    const acompanadas = f.id
                      ? programadas.filter((o) => o.programada === d && o.acompanantes.some((t) => t.id === f.id))
                      : []
                    // La jornada del día: la semanal con las licencias, feriados y horarios especiales.
                    const dia = f.tecnico ? jornadaDelDia(f.tecnico, d, excepciones) : null
                    const trabaja = !dia || dia.trabaja
                    const jornada = dia ? minutos(dia.hasta) - minutos(dia.desde) : 0
                    const feriado = !f.tecnico ? excepciones.find((e) => !e.tecnicoId && e.desde <= d && e.hasta >= d) : null
                    const carga = [...del, ...acompanadas]
                      .filter((o) => o.estado !== 'cancelada')
                      .reduce((s, o) => s + o.duracion, 0)
                    return (
                      <td
                        key={d}
                        {...destino(clave, { tecnicoId: f.id, programada: d })}
                        className={`h-24 border-l border-borde p-1 ${trabaja ? '' : 'bg-superficie-2/70'} ${sobre === clave ? 'ring-2 ring-acento ring-inset' : ''}`}
                      >
                        {(dia?.motivo || feriado) && (
                          <span
                            className={`mb-1 block truncate text-[11px] ${dia && !dia.trabaja ? 'text-error' : 'text-texto-2'}`}
                            title={dia?.motivo ?? feriado?.motivo}
                          >
                            {dia && dia.trabaja ? `${dia.desde}–${dia.hasta} · ` : ''}
                            {dia?.motivo ?? feriado?.motivo}
                          </span>
                        )}
                        <div className="flex flex-col gap-1">
                          {del.map((o) => (
                            <Tarjeta key={o.id} o={o} mover={mover} />
                          ))}
                          {acompanadas.map((o) => (
                            <Tarjeta key={`a-${o.id}`} o={o} mover={mover} acompana />
                          ))}
                        </div>
                        {f.tecnico && carga > 0 && (
                          <span className={`mt-1 block text-[11px] ${carga > jornada ? 'text-error' : 'text-texto-3'}`}>
                            {(carga / 60).toLocaleString('es-AR', { maximumFractionDigits: 1 })} de{' '}
                            {(jornada / 60).toLocaleString('es-AR', { maximumFractionDigits: 1 })} h
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
