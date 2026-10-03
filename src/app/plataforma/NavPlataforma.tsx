'use client'

import { Activity, ArrowLeft, Building2, Inbox, LayoutDashboard, ScrollText, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SECCIONES = [
  { href: '/plataforma', texto: 'Resumen', icono: LayoutDashboard },
  { href: '/plataforma/empresas', texto: 'Empresas', icono: Building2 },
  { href: '/plataforma/pedidos', texto: 'Pedidos y consultas', icono: Inbox },
  { href: '/plataforma/usuarios', texto: 'Usuarios', icono: Users },
  { href: '/plataforma/operacion', texto: 'Operación', icono: Activity },
  { href: '/plataforma/auditoria', texto: 'Auditoría', icono: ScrollText },
] as const

/** Menú de la consola. `avisos` pone un contador al lado de una sección (pedidos sin atender, errores). */
export function NavPlataforma({ avisos }: { avisos: Partial<Record<(typeof SECCIONES)[number]['href'], number>> }) {
  const ruta = usePathname()
  const activa = (href: string) => (href === '/plataforma' ? ruta === href : ruta === href || ruta.startsWith(`${href}/`))
  return (
    <nav aria-label="Consola de la plataforma" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-px">
      {SECCIONES.map(({ href, texto, icono: Icono }) => {
        const actual = activa(href)
        const n = avisos[href] ?? 0
        return (
          <Link
            key={href}
            href={href}
            aria-current={actual ? 'page' : undefined}
            className={`flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${
              actual
                ? 'bg-superficie font-semibold text-texto shadow-[0_1px_0_var(--tarjeta-borde-abajo),0_0_0_1px_var(--tarjeta-borde)]'
                : 'font-medium text-texto-2 hover:bg-texto/[0.05] hover:text-texto'
            }`}
          >
            <Icono aria-hidden className="size-4 shrink-0" />
            <span className="flex-1 whitespace-nowrap">{texto}</span>
            {n > 0 && (
              <span className="cifras rounded-full bg-aviso-suave px-1.5 text-[11px] font-semibold text-aviso">
                {n}
                <span className="sr-only"> pendientes</span>
              </span>
            )}
          </Link>
        )
      })}
      <span className="hidden lg:mt-3 lg:block lg:border-t lg:border-borde lg:pt-3" />
      <Link
        href="/"
        className="flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-texto-2 hover:bg-texto/[0.05] hover:text-texto"
      >
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        Volver al sistema
      </Link>
    </nav>
  )
}
