'use client'

import { Maximize2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Panel lateral de vista rápida: se abre a la derecha sin perder el embudo.
 * Esc o la cruz lo cierran; el ícono de expandir abre la ficha completa.
 */
export function Cajon({
  cerrar,
  expandir,
  titulo,
  children,
}: {
  cerrar: string
  expandir: string
  titulo: string
  children: ReactNode
}) {
  const router = useRouter()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panel.current?.focus()
    const tecla = (e: KeyboardEvent) => {
      const escribiendo = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
      if (e.key === 'Escape' && !escribiendo && !document.querySelector('details[open], [role=dialog][data-encima]')) {
        router.push(cerrar, { scroll: false })
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [cerrar, router])
  return (
    <>
      <Link
        href={cerrar}
        scroll={false}
        aria-label="Cerrar la vista rápida"
        tabIndex={-1}
        className="fixed inset-0 z-40 bg-texto/10 lg:bg-transparent"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={titulo}
        className="aparecer fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-borde bg-fondo shadow-flotante outline-none sm:w-[min(44rem,92vw)]"
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-borde bg-superficie px-3">
          <span className="rounded-md bg-app-crm/15 px-2 py-0.5 text-xs font-semibold text-app-crm">Oportunidad</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{titulo}</span>
          <Link
            href={expandir}
            title="Abrir la ficha completa"
            aria-label="Abrir la ficha completa"
            className="grid size-8 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 hover:text-texto"
          >
            <Maximize2 aria-hidden className="size-4" />
          </Link>
          <Link
            href={cerrar}
            scroll={false}
            title="Cerrar (Esc)"
            aria-label="Cerrar"
            className="grid size-8 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 hover:text-texto"
          >
            <X aria-hidden className="size-4" />
          </Link>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </>
  )
}
