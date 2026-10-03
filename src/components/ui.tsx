import { CircleAlert, CircleCheck, Inbox, Info, type LucideIcon, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/**
 * Componentes base del ERP. Usan solo los tokens de globals.css: un color
 * suelto acá rompe el tema oscuro.
 */

function unir(...clases: (string | false | null | undefined)[]) {
  return clases.filter(Boolean).join(' ')
}

const VARIANTES = {
  primario: 'bg-acento text-sobre-acento hover:bg-acento-hover boton-lleno',
  secundario: 'bg-superficie text-texto hover:bg-superficie-2 boton-relieve',
  fantasma: 'bg-transparent text-texto-2 hover:bg-texto/[0.06] hover:text-texto',
  peligro: 'bg-error text-white hover:brightness-95 boton-lleno',
} as const

const BASE_BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-9 text-[13px] font-semibold transition-[background-color,color,box-shadow] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap [&_svg]:shrink-0 [&_svg]:size-4'

type Variante = keyof typeof VARIANTES

export function Boton({ variante = 'secundario', className, ...props }: ComponentProps<'button'> & { variante?: Variante }) {
  return <button className={unir(BASE_BOTON, VARIANTES[variante], className)} {...props} />
}

export function BotonEnlace({
  variante = 'secundario',
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={unir(BASE_BOTON, VARIANTES[variante], className)} {...props} />
}

/** Atajo de teclado visible: <Tecla>Ctrl</Tecla>. */
export function Tecla({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-borde border-b-borde-fuerte bg-superficie px-1.5 font-sans text-[11px] font-medium text-texto-2">
      {children}
    </kbd>
  )
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  className,
  id,
  ...props
}: ComponentProps<'input'> & { etiqueta: string; error?: string; ayuda?: string; id: string }) {
  return (
    <div className={unir('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-texto-2">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        className={unir(
          'h-9 rounded-lg border bg-superficie px-3 text-sm text-texto shadow-suave placeholder:text-texto-3 disabled:bg-superficie-2 disabled:text-texto-2',
          error ? 'border-error' : 'border-borde-fuerte/80 hover:border-borde-fuerte focus:border-acento',
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-error">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-xs text-texto-3">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}

export function Selector({
  etiqueta,
  error,
  className,
  id,
  opciones,
  vacio,
  ...props
}: ComponentProps<'select'> & {
  etiqueta: string
  error?: string
  id: string
  opciones: { valor: string | number; texto: string }[]
  vacio?: string
}) {
  return (
    <div className={unir('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-texto-2">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={unir(
          'h-9 rounded-lg border bg-superficie px-2.5 text-sm text-texto shadow-suave disabled:bg-superficie-2',
          error ? 'border-error' : 'border-borde-fuerte/80 hover:border-borde-fuerte focus:border-acento',
        )}
        {...props}
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}

const TONOS = {
  ok: 'bg-ok-suave text-ok',
  aviso: 'bg-aviso-suave text-aviso',
  error: 'bg-error-suave text-error',
  info: 'bg-info-suave text-info',
  neutro: 'bg-superficie-2 text-texto-2',
  acento: 'bg-acento-suave text-acento',
} as const

/** Estado que se ve sin leer: emitido, vencido, en cartera… El punto repite el color para quien no distingue el fondo. */
export function Chip({ tono = 'neutro', children }: { tono?: keyof typeof TONOS; children: ReactNode }) {
  return (
    <span
      className={unir(
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONOS[tono],
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  )
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={unir('tarjeta', className)} {...props} />
}

/**
 * Encabezado de cada pantalla (el "panel de control" de Odoo): título,
 * una bajada corta y las acciones a la derecha, con la principal al final.
 */
export function EncabezadoPagina({ titulo, bajada, acciones }: { titulo: string; bajada?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance">{titulo}</h1>
        {bajada && <p className="mt-1.5 text-sm text-texto-2">{bajada}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  )
}

const ICONO_AVISO = { error: CircleAlert, ok: CircleCheck, aviso: TriangleAlert, info: Info } as const

export function Aviso({ tono = 'error', children }: { tono?: 'error' | 'ok' | 'aviso' | 'info'; children: ReactNode }) {
  const Icono = ICONO_AVISO[tono]
  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      className={unir('flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm ring-1 ring-current/15 ring-inset', TONOS[tono])}
    >
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Lista vacía: qué es y cómo empezar, en vez de una tabla en blanco. */
export function Vacio({
  icono: Icono = Inbox,
  titulo,
  children,
  accion,
}: {
  icono?: LucideIcon
  titulo: string
  children?: ReactNode
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 grid size-11 place-items-center rounded-full bg-superficie-2 text-texto-3">
        <Icono aria-hidden className="size-5" />
      </span>
      <p className="font-medium">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-texto-2">{children}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}
