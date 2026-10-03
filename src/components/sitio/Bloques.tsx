import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { DIAS_DE_PRUEBA } from '@/lib/planes'

export function Contenedor({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>
}

/** Rótulo de sección en mono, entre corchetes: [ 01 · LO ESENCIAL ]. */
export function Rotulo({ children, numero }: { children: ReactNode; numero?: number }) {
  return (
    <p className="font-mono text-xs font-medium tracking-[0.2em] text-acento uppercase">
      [ {numero !== undefined && <>{String(numero).padStart(2, '0')} · </>}
      {children} ]
    </p>
  )
}

/** La palabra que se destaca dentro de un título, en mono itálica y color. */
export function Destacado({ children }: { children: ReactNode }) {
  return <em className="font-mono font-semibold tracking-[-0.06em] text-acento italic">{children}</em>
}

export function TituloSeccion({
  rotulo,
  numero,
  titulo,
  bajada,
}: {
  rotulo?: string
  numero?: number
  titulo: ReactNode
  bajada?: string
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
      {rotulo && <Rotulo numero={numero}>{rotulo}</Rotulo>}
      <h2 className="text-4xl leading-[1.02] font-bold tracking-[-0.045em] text-balance sm:text-6xl">{titulo}</h2>
      {bajada && <p className="max-w-2xl text-lg text-pretty text-texto-2">{bajada}</p>}
    </div>
  )
}

/** Botón píldora: lleno (tinta) o con contorno. */
export function Pildora({
  href,
  children,
  variante = 'lleno',
  className = '',
}: {
  href: string
  children: ReactNode
  variante?: 'lleno' | 'contorno' | 'blanco' | 'translucido'
  className?: string
}) {
  const estilos = {
    lleno: 'bg-texto text-fondo-sitio hover:bg-texto/85 shadow-[0_8px_20px_-8px_rgb(0_0_0/0.45)]',
    contorno: 'bg-superficie/60 text-texto ring-1 ring-borde-fuerte/70 hover:bg-superficie hover:ring-borde-fuerte',
    blanco: 'bg-white text-marca-2 hover:bg-white/90',
    translucido: 'bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/15',
  }[variante]
  return (
    <Link
      href={href}
      className={`group inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition ${estilos} ${className}`}
    >
      {children}
      <ArrowRight aria-hidden className="size-4 transition group-hover:translate-x-0.5" />
    </Link>
  )
}

export function BotonesInicio({ centrado = false }: { centrado?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${centrado ? 'justify-center' : ''}`}>
      <Pildora href="/registro">Probar {DIAS_DE_PRUEBA} días gratis</Pildora>
      <Pildora href="/contacto" variante="contorno">
        Hablar con un asesor
      </Pildora>
    </div>
  )
}

export function Lista({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i} className="flex gap-2.5 text-texto-2">
          <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  )
}

/** Preguntas frecuentes en acordeón, sin JavaScript. */
export function Preguntas({ preguntas }: { preguntas: { p: string; r: string }[] }) {
  return (
    <div className="flex flex-col divide-y divide-borde border-y border-borde">
      {preguntas.map((q, n) => (
        <details key={q.p} className="group py-1" open={n === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
            {q.p}
            <ChevronDown aria-hidden className="size-4 shrink-0 text-texto-3 transition group-open:rotate-180" />
          </summary>
          <p className="pb-5 leading-relaxed text-texto-2">{q.r}</p>
        </details>
      ))}
    </div>
  )
}

/** Cierre de página: panel de la marca con los dos llamados. */
export function Llamado({ titulo, bajada }: { titulo: ReactNode; bajada: string }) {
  return (
    <section className="py-20 sm:py-28">
      <Contenedor>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-marca to-marca-2 px-6 py-16 text-center text-white sm:py-24">
          <div aria-hidden className="puntos-sitio pointer-events-none absolute inset-0 opacity-40" />
          <div
            aria-hidden
            className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-white/15 blur-3xl"
          />
          <div className="relative flex flex-col items-center gap-6">
            <h2 className="max-w-3xl text-4xl leading-[1.02] font-bold tracking-[-0.045em] text-balance sm:text-6xl">{titulo}</h2>
            <p className="max-w-xl text-lg text-white/80">{bajada}</p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Pildora href="/registro" variante="blanco">
                Probar {DIAS_DE_PRUEBA} días gratis
              </Pildora>
              <Pildora href="/precios" variante="translucido">
                Ver precios
              </Pildora>
            </div>
            <p className="font-mono text-xs tracking-wide text-white/70">Sin tarjeta · Sin permanencia · Migramos tus datos</p>
          </div>
        </div>
      </Contenedor>
    </section>
  )
}
