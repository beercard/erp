'use client'

import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { Navegacion } from './Navegacion'

/** Menú lateral en pantallas chicas: se abre con el botón y se cierra al navegar. */
export function MenuMovil({ funciones, permisos }: { funciones: string[]; permisos: string[] }) {
  const [abierto, setAbierto] = useState(false)
  const ruta = usePathname()
  // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar al cambiar de página
  useEffect(() => setAbierto(false), [ruta])

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls="menu-movil"
        aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
        className="grid size-9 place-items-center rounded-lg text-sobre-barra hover:bg-white/10"
      >
        {abierto ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
      </button>
      {/* Fuera del encabezado: su desenfoque (backdrop-filter) encierra a los elementos fijos y el panel quedaba cortado. */}
      {abierto &&
        createPortal(
          <>
            <div aria-hidden onClick={() => setAbierto(false)} className="fixed inset-0 top-14 z-40 bg-black/30 lg:hidden" />
            <div
              id="menu-movil"
              className="aparecer fixed top-14 bottom-0 left-0 z-40 flex w-[86vw] max-w-xs flex-col overflow-y-auto border-r border-borde bg-lateral p-3 shadow-flotante lg:hidden"
            >
              <Navegacion funciones={funciones} permisos={permisos} />
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
