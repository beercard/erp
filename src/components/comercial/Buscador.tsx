'use client'

import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

/**
 * Campo de búsqueda con resultados del servidor y navegación con teclado
 * (flechas, Enter, Escape). Lo usan el editor de documentos para clientes y
 * artículos.
 */
export function Buscador<T>({
  buscar,
  alElegir,
  render,
  clave,
  placeholder,
  etiqueta,
  autoFocus,
  limpiarAlElegir = true,
  valorInicial = '',
}: {
  buscar: (texto: string) => Promise<T[]>
  alElegir: (item: T) => void
  render: (item: T) => React.ReactNode
  clave: (item: T) => string
  placeholder: string
  etiqueta: string
  autoFocus?: boolean
  limpiarAlElegir?: boolean
  valorInicial?: string
}) {
  const [texto, setTexto] = useState(valorInicial)
  const [resultados, setResultados] = useState<T[]>([])
  const [activo, setActivo] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const [buscando, iniciar] = useTransition()
  const ultimo = useRef(0)
  const id = useId()

  useEffect(() => {
    const q = texto.trim()
    const pedido = ++ultimo.current
    if (q.length < 2) return
    const espera = setTimeout(() => {
      iniciar(async () => {
        const r = await buscar(q)
        if (pedido === ultimo.current) {
          setResultados(r)
          setActivo(0)
        }
      })
    }, 200)
    return () => clearTimeout(espera)
  }, [texto, buscar])

  function elegir(item: T) {
    alElegir(item)
    setAbierto(false)
    setResultados([])
    if (limpiarAlElegir) setTexto('')
  }

  const visibles = texto.trim().length >= 2 ? resultados : []

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <div className="flex h-9 items-center gap-2 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2.5 focus-within:border-acento focus-within:ring-3 focus-within:ring-anillo">
        <Search aria-hidden className="size-4 shrink-0 text-texto-3" />
        <input
          id={id}
          value={texto}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto && visibles.length > 0}
          aria-controls={`${id}-lista`}
          placeholder={placeholder}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (!visibles.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActivo((a) => Math.min(a + 1, visibles.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActivo((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              elegir(visibles[activo])
            } else if (e.key === 'Escape') setAbierto(false)
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-texto-3"
        />
        {buscando && <span className="text-xs text-texto-3">Buscando…</span>}
      </div>
      {abierto && visibles.length > 0 && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute inset-x-0 top-10 z-30 max-h-80 overflow-y-auto rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave py-1 shadow-panel"
        >
          {visibles.map((item, i) => (
            <li
              key={clave(item)}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(item)
              }}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === activo ? 'bg-acento-suave' : ''}`}
            >
              {render(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
