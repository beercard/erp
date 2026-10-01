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
  primario: 'bg-acento text-sobre-acento hover:bg-acento-hover border-transparent',
  secundario: 'bg-superficie text-texto border-borde hover:bg-superficie-2',
  fantasma: 'bg-transparent text-texto-2 border-transparent hover:bg-superficie-2 hover:text-texto',
  peligro: 'bg-error text-white border-transparent hover:opacity-90',
} as const

const BASE_BOTON =
  'inline-flex items-center justify-center gap-2 rounded-md border px-3 h-9 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap'

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
    <kbd className="rounded border border-borde bg-superficie-2 px-1.5 py-px font-sans text-[11px] font-medium text-texto-2">
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
      <label htmlFor={id} className="text-xs font-medium text-texto-2">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        className={unir(
          'h-9 rounded-md border bg-superficie px-2.5 text-sm text-texto placeholder:text-texto-3',
          error ? 'border-error' : 'border-borde focus:border-acento',
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
      <label htmlFor={id} className="text-xs font-medium text-texto-2">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={unir(
          'h-9 rounded-md border bg-superficie px-2 text-sm text-texto',
          error ? 'border-error' : 'border-borde focus:border-acento',
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

/** Estado que se ve sin leer: emitido, vencido, en cartera… */
export function Chip({ tono = 'neutro', children }: { tono?: keyof typeof TONOS; children: ReactNode }) {
  return (
    <span className={unir('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONOS[tono])}>
      {children}
    </span>
  )
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={unir('rounded-lg border border-borde bg-superficie', className)} {...props} />
}

export function EncabezadoPagina({ titulo, bajada, acciones }: { titulo: string; bajada?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{titulo}</h1>
        {bajada && <p className="mt-1 text-sm text-texto-2">{bajada}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  )
}

export function Aviso({ tono = 'error', children }: { tono?: 'error' | 'ok' | 'aviso' | 'info'; children: ReactNode }) {
  return (
    <div role={tono === 'error' ? 'alert' : 'status'} className={unir('rounded-md px-3 py-2 text-sm', TONOS[tono])}>
      {children}
    </div>
  )
}
