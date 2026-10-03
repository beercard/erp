import { Check } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { DIAS_DE_PRUEBA } from '@/lib/planes'

export function Contenedor({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold tracking-wide text-acento uppercase">{children}</p>
}

export function TituloSeccion({ rotulo, titulo, bajada }: { rotulo?: string; titulo: string; bajada?: string }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
      {rotulo && <Rotulo>{rotulo}</Rotulo>}
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{titulo}</h2>
      {bajada && <p className="text-lg text-pretty text-texto-2">{bajada}</p>}
    </div>
  )
}

export function BotonesInicio({ centrado = false }: { centrado?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${centrado ? 'justify-center' : ''}`}>
      <Link
        href="/registro"
        className="rounded-lg bg-acento px-6 py-3 text-center font-medium text-sobre-acento shadow-sm hover:bg-acento-hover"
      >
        Probar {DIAS_DE_PRUEBA} días gratis
      </Link>
      <Link
        href="/contacto"
        className="rounded-xl border border-borde bg-superficie shadow-suave px-6 py-3 text-center font-medium hover:bg-superficie-2"
      >
        Hablar con un asesor
      </Link>
    </div>
  )
}

export function Lista({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i} className="flex gap-2.5 text-texto-2">
          <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-acento" />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  )
}

export function Preguntas({ preguntas }: { preguntas: { p: string; r: string }[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col divide-y divide-borde rounded-xl border border-borde bg-superficie">
      {preguntas.map((q) => (
        <details key={q.p} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
            {q.p}
            <span aria-hidden className="text-xl leading-none text-texto-3 transition group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-texto-2">{q.r}</p>
        </details>
      ))}
    </div>
  )
}

/** Banda final de llamado a la acción. */
export function Llamado({ titulo, bajada }: { titulo: string; bajada: string }) {
  return (
    <section className="py-20">
      <Contenedor>
        <div className="relative overflow-hidden rounded-2xl border border-borde bg-superficie px-6 py-14 text-center shadow-panel">
          <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative flex flex-col items-center gap-5">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance">{titulo}</h2>
            <p className="max-w-xl text-texto-2">{bajada}</p>
            <BotonesInicio centrado />
            <p className="text-xs text-texto-3">Sin tarjeta. Sin permanencia. Tus datos siempre son tuyos.</p>
          </div>
        </div>
      </Contenedor>
    </section>
  )
}
