'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { COLOR_APP, seccionesVisibles, ubicacion } from './menu'

/** Dónde estoy: área › pantalla, con la pantalla como enlace cuando se está más adentro (una ficha, un alta). */
export function Migas({ funciones, permisos }: { funciones: string[]; permisos: string[] }) {
  const ruta = usePathname()
  const donde = ubicacion(ruta, seccionesVisibles(funciones, permisos))
  if (!donde || ruta === '/') return null
  const { seccion, item } = donde
  const adentro = ruta !== item.href
  const Icono = seccion.icono ?? item.icono
  return (
    <nav aria-label="Ubicación" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      {seccion.app && (
        <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-md ${COLOR_APP[seccion.app]}`}>
          <Icono className="size-3.5" strokeWidth={2.2} />
        </span>
      )}
      {seccion.titulo && seccion.titulo !== item.texto && (
        <>
          <span className="truncate text-texto-2">{seccion.titulo}</span>
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-texto-3" />
        </>
      )}
      {adentro ? (
        <Link href={item.href} className="truncate font-medium text-texto hover:text-acento">
          {item.texto}
        </Link>
      ) : (
        <span aria-current="page" className="truncate font-medium text-texto">
          {item.texto}
        </span>
      )}
    </nav>
  )
}
