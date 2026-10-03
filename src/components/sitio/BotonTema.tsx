'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { aplicarTema, temaVisible } from '@/lib/tema'

/** Alterna claro y oscuro en el sitio; la elección vale también dentro del sistema. */
export function BotonTema() {
  const [tema, setTema] = useState<'claro' | 'oscuro' | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- el tema se conoce recién en el navegador
  useEffect(() => setTema(temaVisible()), [])
  const otro = tema === 'oscuro' ? 'claro' : 'oscuro'
  return (
    <button
      type="button"
      onClick={() => {
        aplicarTema(otro)
        setTema(otro)
      }}
      aria-label={`Pasar al tema ${otro}`}
      title={`Tema ${otro}`}
      className="grid size-9 place-items-center rounded-full text-texto-2 ring-1 ring-borde transition hover:bg-superficie hover:text-texto"
    >
      {tema === 'oscuro' ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </button>
  )
}
