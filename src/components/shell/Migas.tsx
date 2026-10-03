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
  // En la pantalla principal de un área se ve solo el área (el título ya dice la pantalla);
  // más adentro (una ficha, un alta), el camino de vuelta.
  return (
    <nav aria-label="Ubicación" className="mb-3 flex min-w-0 items-center gap-1.5 text-[13px] text-texto-2">
      {seccion.app && (
        <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-md ${COLOR_APP[seccion.app]}`}>
          <Icono className="size-3" strokeWidth={2.4} />
        </span>
      )}
      {seccion.titulo && seccion.titulo !== item.texto && <span className="truncate">{seccion.titulo}</span>}
      {adentro && (
        <>
          {seccion.titulo !== item.texto && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-texto-3" />}
          <Link href={item.href} className="truncate font-medium text-texto hover:text-acento hover:underline">
            {item.texto}
          </Link>
        </>
      )}
      {!adentro && seccion.titulo === item.texto && <span className="truncate">{item.texto}</span>}
    </nav>
  )
}
