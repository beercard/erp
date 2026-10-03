'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Carrusel de pantallas del sistema dentro del panel de color de la portada.
 * Avanza solo cada pocos segundos (salvo que el sistema pida reducir
 * movimiento o la persona haya elegido una) y se maneja con las pestañas.
 */
export function Vitrina({ vistas }: { vistas: { titulo: string; contenido: ReactNode }[] }) {
  const [actual, setActual] = useState(0)
  const [quieto, setQuieto] = useState(false)

  useEffect(() => {
    if (quieto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setActual((a) => (a + 1) % vistas.length), 5500)
    return () => clearInterval(t)
  }, [quieto, vistas.length])

  return (
    <div className="relative">
      <div role="tablist" aria-label="Pantallas del sistema" className="mb-5 flex flex-wrap justify-center gap-1.5">
        {vistas.map((v, n) => (
          <button
            key={v.titulo}
            type="button"
            role="tab"
            aria-selected={n === actual}
            aria-controls={`vitrina-${n}`}
            onClick={() => {
              setActual(n)
              setQuieto(true)
            }}
            className="rounded-full px-3.5 py-1.5 text-sm font-medium text-white/75 transition hover:text-white aria-selected:bg-white aria-selected:text-marca-2"
          >
            {v.titulo}
          </button>
        ))}
      </div>
      <div className="grid">
        {vistas.map((v, n) => (
          <div
            key={v.titulo}
            id={`vitrina-${n}`}
            role="tabpanel"
            aria-hidden={n !== actual}
            className={`col-start-1 row-start-1 transition duration-500 ${
              n === actual ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
            }`}
          >
            {v.contenido}
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-6 flex justify-center gap-1.5">
        {vistas.map((v, n) => (
          <span
            key={v.titulo}
            className={`h-1.5 rounded-full transition-all ${n === actual ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
          />
        ))}
      </div>
    </div>
  )
}
