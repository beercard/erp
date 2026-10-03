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
        className="grid size-9 place-items-center rounded-md text-texto-2 hover:bg-superficie-2"
      >
        {abierto ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
      </button>
      {/* Fuera del encabezado: su desenfoque (backdrop-filter) encierra a los elementos fijos y el panel quedaba cortado. */}
      {abierto &&
        createPortal(
          <div
            id="menu-movil"
            className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto border-t border-borde bg-superficie p-4 lg:hidden"
          >
            <Navegacion funciones={funciones} permisos={permisos} />
          </div>,
          document.body,
        )}
    </div>
  )
}
