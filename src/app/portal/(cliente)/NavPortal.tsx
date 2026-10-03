'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Menú del portal, con la pantalla actual marcada. */
export function NavPortal({ menu }: { menu: { href: string; texto: string }[] }) {
  const ruta = usePathname()
  return (
    <>
      {menu.map((m) => {
        const activo = m.href === '/portal' ? ruta === '/portal' : ruta.startsWith(m.href)
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={activo ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
              activo ? 'bg-acento-suave text-acento' : 'text-texto-2 hover:bg-superficie-2 hover:text-texto'
            }`}
          >
            {m.texto}
          </Link>
        )
      })}
    </>
  )
}
