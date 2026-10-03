'use client'

import { useEffect, useRef, useState } from 'react'

/** Menú desplegable: se cierra con Escape, al tocar afuera y al navegar (lo llama quien lo usa). */
export function useFlotante<T extends HTMLElement>() {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])
  return { abierto, setAbierto, ref }
}
