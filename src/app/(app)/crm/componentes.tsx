'use client'

import { CalendarClock, Mail, MessageCircle, Phone, SquareCheck, Star, Users } from 'lucide-react'

import { formatearMonto } from '@/lib/dinero'

/** Íconos y colores de cada tipo de actividad. */
export const ICONO_ACTIVIDAD = {
  llamada: Phone,
  reunion: Users,
  email: Mail,
  whatsapp: MessageCircle,
  tarea: SquareCheck,
} as const

export const TONO_VENCIMIENTO = {
  vencida: 'text-error',
  hoy: 'text-aviso',
  futura: 'text-texto-3',
} as const

export const pesos = (v: string | number) => formatearMonto(v, '$').replace(/,00$/, '')

/** Prioridad de 0 a 3 estrellas; si hay `alCambiar`, se puede tocar. */
export function Estrellas({
  valor,
  alCambiar,
  tamano = 'size-3.5',
}: {
  valor: number
  alCambiar?: (v: number) => void
  tamano?: string
}) {
  return (
    <span className="inline-flex items-center" role={alCambiar ? 'radiogroup' : undefined} aria-label={`Prioridad ${valor} de 3`}>
      {[1, 2, 3].map((n) => {
        const llena = n <= valor
        const estrella = <Star aria-hidden className={`${tamano} ${llena ? 'fill-aviso text-aviso' : 'text-texto-3/60'}`} />
        return alCambiar ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              alCambiar(valor === n ? 0 : n)
            }}
            className="rounded p-px hover:scale-110"
          >
            {estrella}
          </button>
        ) : (
          <span key={n}>{estrella}</span>
        )
      })}
    </span>
  )
}

/** Próxima actividad de una oportunidad, con el color de su vencimiento. */
export function ProximaActividad({
  proxima,
}: {
  proxima: { tipo: string; resumen: string; vence: string; estado: 'vencida' | 'hoy' | 'futura' } | null
}) {
  if (!proxima) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-texto-3" title="No hay nada agendado">
        <CalendarClock aria-hidden className="size-3.5" /> Sin actividad
      </span>
    )
  }
  const Icono = ICONO_ACTIVIDAD[proxima.tipo as keyof typeof ICONO_ACTIVIDAD] ?? CalendarClock
  const cuando = proxima.estado === 'hoy' ? 'hoy' : proxima.vence.split('-').reverse().slice(0, 2).join('/')
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 text-xs ${TONO_VENCIMIENTO[proxima.estado]}`}
      title={proxima.resumen}
    >
      <Icono aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">
        {proxima.estado === 'vencida' ? 'Vencida ' : ''}
        {cuando}
      </span>
    </span>
  )
}

export function Iniciales({ nombre }: { nombre: string | null }) {
  if (!nombre) return null
  const ini = nombre
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span
      title={nombre}
      className="grid size-6 shrink-0 place-items-center rounded-full bg-acento-suave text-[10px] font-semibold text-acento"
    >
      {ini}
    </span>
  )
}
