'use client'

import { CalendarPlus, Check, ThumbsDown, Trash2 } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { sumarDias } from '@/lib/fechas'

import { agendarAccion, borrarActividadAccion, completarAccion, perderAccion } from '../acciones'
import { ICONO_ACTIVIDAD, TONO_VENCIMIENTO } from '../componentes'

const TIPOS = [
  ['llamada', 'Llamada'],
  ['reunion', 'Reunión'],
  ['email', 'Email'],
  ['whatsapp', 'WhatsApp'],
  ['tarea', 'Tarea'],
] as const

/** "Perdida": pide el motivo (y una nota si es "Otro"). */
export function Perder({ id, motivos }: { id: string; motivos: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, accion, enviando] = useActionState(perderAccion.bind(null, id), undefined)
  const [motivo, setMotivo] = useState('')
  const esOtro = motivos.find((m) => m.id === motivo)?.nombre.toLowerCase() === 'otro'
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar al marcarla perdida
    if (estado?.ok) setAbierto(false)
  }, [estado])
  return (
    <div className="relative">
      <Boton type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <ThumbsDown aria-hidden /> Perdida
      </Boton>
      {abierto && (
        <form
          action={accion}
          className="aparecer absolute right-0 z-30 mt-2 flex w-80 flex-col gap-3 rounded-xl border border-borde bg-superficie p-4 shadow-flotante"
        >
          <p className="font-semibold">¿Por qué se perdió?</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motivo">
            {motivos.map((m) => (
              <label
                key={m.id}
                className="cursor-pointer rounded-full border border-borde px-3 py-1 text-sm has-checked:border-error has-checked:bg-error-suave has-checked:text-error"
              >
                <input type="radio" name="motivoId" value={m.id} className="sr-only" onChange={() => setMotivo(m.id)} />
                {m.nombre}
              </label>
            ))}
          </div>
          <textarea
            name="nota"
            rows={2}
            required={esOtro}
            placeholder={esOtro ? 'Contá en una línea qué pasó (obligatorio)' : 'Nota (opcional)'}
            className="rounded-lg border border-borde-fuerte/80 bg-superficie px-3 py-2 text-sm"
          />
          {estado?.error && <p className="text-sm text-error">{estado.error}</p>}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="peligro" disabled={enviando || !motivo}>
              Marcar perdida
            </Boton>
          </div>
        </form>
      )}
    </div>
  )
}

/** Agendar una actividad: tipo, qué hacer, para cuándo y quién. */
export function Agendar({
  oportunidadId,
  hoy,
  personas,
  yo,
}: {
  oportunidadId: string
  hoy: string
  personas: { id: string; nombre: string }[]
  yo: string
}) {
  const [estado, accion, enviando] = useActionState(agendarAccion.bind(null, oportunidadId), undefined)
  const [tipo, setTipo] = useState<string>('llamada')
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok) form.current?.reset()
  }, [estado])
  const atajos = [
    ['Hoy', hoy],
    ['Mañana', sumarDias(hoy, 1)],
  ]
  return (
    <form ref={form} action={accion} className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Tipo de actividad" className="flex flex-wrap gap-1">
        {TIPOS.map(([v, t]) => {
          const I = ICONO_ACTIVIDAD[v]
          return (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-texto-2 ring-1 ring-borde has-checked:bg-acento-suave has-checked:text-acento has-checked:ring-acento/40"
            >
              <input type="radio" name="tipo" value={v} checked={tipo === v} onChange={() => setTipo(v)} className="sr-only" />
              <I aria-hidden className="size-4" /> {t}
            </label>
          )
        })}
      </div>
      <input
        name="resumen"
        required
        placeholder={tipo === 'llamada' ? 'Ej.: Llamar para confirmar la propuesta' : 'Qué hay que hacer'}
        defaultValue={estado?.valores?.resumen}
        className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm shadow-suave"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="vence"
          type="date"
          required
          defaultValue={estado?.valores?.vence ?? hoy}
          aria-label="Para cuándo"
          className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm shadow-suave"
        />
        {atajos.map(([t, f]) => (
          <button
            key={t}
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.form?.elements.namedItem('vence') as HTMLInputElement
              input.value = f
            }}
            className="h-8 rounded-full px-3 text-xs font-medium text-texto-2 ring-1 ring-borde hover:bg-superficie-2"
          >
            {t}
          </button>
        ))}
        {personas.length > 1 && (
          <select
            name="responsableId"
            defaultValue={yo}
            aria-label="Responsable"
            className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave"
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        )}
        <Boton type="submit" variante="primario" disabled={enviando} className="ml-auto">
          <CalendarPlus aria-hidden /> Agendar
        </Boton>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </form>
  )
}

/** Una actividad pendiente: marcarla hecha (con lo que pasó) o borrarla. */
export function ActividadPendiente({
  a,
  oportunidadId,
  editar,
}: {
  a: {
    id: string
    tipo: string
    resumen: string
    vence: string
    estado: 'vencida' | 'hoy' | 'futura' | null
    responsable: string | null
  }
  oportunidadId: string
  editar: boolean
}) {
  const [cerrando, setCerrando] = useState(false)
  const I = ICONO_ACTIVIDAD[a.tipo as keyof typeof ICONO_ACTIVIDAD]
  const tono = a.estado ? TONO_VENCIMIENTO[a.estado] : ''
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-superficie-2 ${tono}`}>
          <I aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{a.resumen}</p>
          <p className={`text-xs ${tono}`}>
            {a.estado === 'vencida' ? 'Vencida · ' : a.estado === 'hoy' ? 'Hoy · ' : ''}
            {a.vence.split('-').reverse().join('/')}
            {a.responsable && <span className="text-texto-3"> · {a.responsable}</span>}
          </p>
        </div>
        {editar && !cerrando && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setCerrando(true)}
              className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-ok ring-1 ring-ok/30 hover:bg-ok-suave"
            >
              <Check aria-hidden className="size-3.5" /> Hecha
            </button>
            <form action={borrarActividadAccion.bind(null, a.id, oportunidadId)}>
              <button
                type="submit"
                aria-label="Borrar actividad"
                className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-error"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </form>
          </div>
        )}
      </div>
      {cerrando && (
        <form action={completarAccion.bind(null, a.id, oportunidadId)} className="ml-11 flex gap-2">
          <input
            name="resultado"
            autoFocus
            placeholder="¿Qué pasó? (opcional)"
            className="h-9 min-w-0 flex-1 rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm shadow-suave"
          />
          <Boton type="submit" variante="primario">
            Listo
          </Boton>
        </form>
      )}
    </li>
  )
}
