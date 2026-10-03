import { ArrowRight, ChevronDown, Menu } from 'lucide-react'
import Link from 'next/link'

import { BotonTema } from './BotonTema'
import { Logo } from './Logo'
import { SOLUCIONES } from './soluciones'

const ENLACES = [
  { href: '/funciones', texto: 'Funciones' },
  { href: '/integraciones', texto: 'Integraciones' },
  { href: '/precios', texto: 'Precios' },
  { href: '/contacto', texto: 'Contacto' },
]

/** Sin JavaScript: el menú del celular y el de soluciones son <details>. */
export function Encabezado() {
  return (
    <header className="sticky top-0 z-30 border-b border-borde/60 bg-fondo-sitio/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Vektra ERP, inicio">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 text-sm md:flex">
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3.5 py-2 font-medium text-texto hover:bg-superficie [&::-webkit-details-marker]:hidden">
              Soluciones <ChevronDown aria-hidden className="size-3.5 transition group-open:rotate-180" />
            </summary>
            <div className="absolute left-0 top-full mt-2 w-72 tarjeta p-2 shadow-flotante">
              {SOLUCIONES.map((s) => (
                <Link
                  key={s.slug}
                  href={`/soluciones/${s.slug}`}
                  className="block rounded-md px-3 py-2 text-texto-2 hover:bg-superficie-2 hover:text-texto"
                >
                  {s.menu}
                </Link>
              ))}
            </div>
          </details>
          {ENLACES.map((e) => (
            <Link key={e.href} href={e.href} className="rounded-full px-3.5 py-2 font-medium text-texto hover:bg-superficie">
              {e.texto}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block">
            <BotonTema />
          </span>
          <Link
            href="/ingresar"
            className="hidden rounded-full px-3 py-2 text-sm font-medium text-texto-2 hover:text-texto sm:block"
          >
            Ingresar
          </Link>
          <Link
            href="/registro"
            className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-texto px-4 text-sm font-semibold whitespace-nowrap text-fondo-sitio transition hover:bg-texto/85"
          >
            Probar gratis
            <ArrowRight aria-hidden className="hidden size-4 transition group-hover:translate-x-0.5 sm:block" />
          </Link>
          <details className="relative md:hidden">
            <summary
              aria-label="Menú"
              className="grid size-9 cursor-pointer list-none place-items-center rounded-full ring-1 ring-borde [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden className="size-4" />
            </summary>
            <nav
              aria-label="Menú del celular"
              className="absolute right-0 top-full mt-2 flex w-64 flex-col tarjeta p-2 text-sm shadow-flotante"
            >
              {ENLACES.map((e) => (
                <Link key={e.href} href={e.href} className="rounded-md px-3 py-2 hover:bg-superficie-2">
                  {e.texto}
                </Link>
              ))}
              <span className="mt-2 px-3 text-xs font-medium text-texto-3">Soluciones</span>
              {SOLUCIONES.map((s) => (
                <Link
                  key={s.slug}
                  href={`/soluciones/${s.slug}`}
                  className="rounded-md px-3 py-2 text-texto-2 hover:bg-superficie-2"
                >
                  {s.menu}
                </Link>
              ))}
              <Link href="/ingresar" className="mt-2 rounded-md px-3 py-2 hover:bg-superficie-2">
                Ingresar
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
