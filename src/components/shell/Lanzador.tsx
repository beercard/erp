'use client'

import { LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { COLOR_APP_LLENO, CONFIGURACION, seccionesVisibles, type App } from './menu'
import { useFlotante } from './useFlotante'

/**
 * Lanzador de aplicaciones (el menú de íconos de Odoo): cada área del sistema
 * con su color, para saltar de una a otra sin recorrer el menú lateral.
 */
export function Lanzador({ funciones, permisos }: { funciones: string[]; permisos: string[] }) {
  const { abierto, setAbierto, ref } = useFlotante<HTMLDivElement>()
  const ruta = usePathname()
  useEffect(() => setAbierto(false), [ruta, setAbierto])

  const apps: { href: string; texto: string; app: App; icono: typeof CONFIGURACION.icono }[] = seccionesVisibles(
    funciones,
    permisos,
  )
    .filter((s) => s.enLanzador !== false && s.titulo && s.app && s.icono)
    .map((s) => {
      // Entra por la primera pantalla habilitada del área.
      const item = s.items.find((i) => !i.funcion || funciones.includes(i.funcion)) ?? s.items[0]
      return { href: item.href, texto: s.titulo!, app: s.app!, icono: s.icono! }
    })
  apps.push({ href: CONFIGURACION.href, texto: CONFIGURACION.texto, app: 'ajustes', icono: CONFIGURACION.icono })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="true"
        title="Aplicaciones"
        className="grid size-9 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 hover:text-texto aria-expanded:bg-superficie-2"
      >
        <LayoutGrid aria-hidden className="size-[18px]" />
        <span className="sr-only">Aplicaciones</span>
      </button>
      {abierto && (
        <div className="aparecer absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] rounded-xl border border-borde bg-superficie p-3 shadow-flotante">
          <p className="px-1 pb-2 text-xs font-semibold text-texto-2">Aplicaciones</p>
          <ul className="grid grid-cols-3 gap-1">
            {apps.map(({ href, texto, app, icono: Icono }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex flex-col items-center gap-2 rounded-lg px-1 py-3 text-center text-xs font-medium text-texto-2 hover:bg-superficie-2 hover:text-texto"
                >
                  <span
                    aria-hidden
                    className={`grid size-11 place-items-center rounded-xl text-white shadow-suave ${COLOR_APP_LLENO[app]}`}
                  >
                    <Icono className="size-5" />
                  </span>
                  <span className="line-clamp-2 leading-tight">{texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
