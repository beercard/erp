'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PESTANAS = [
  { href: '/crm', texto: 'Embudo' },
  { href: '/crm/lista', texto: 'Lista' },
  { href: '/crm/actividades', texto: 'Mis actividades' },
  { href: '/crm/pronostico', texto: 'Pronóstico' },
]

/** Pestañas de la sección, como el menú de cada aplicación en Odoo. */
export function NavCrm({ configurar }: { configurar: boolean }) {
  const ruta = usePathname()
  const pestanas = configurar ? [...PESTANAS, { href: '/crm/configuracion', texto: 'Configuración' }] : PESTANAS
  // En la ficha de una oportunidad se marca "Embudo".
  const activa =
    pestanas
      .map((p) => p.href)
      .filter((h) => ruta === h || ruta.startsWith(`${h}/`))
      .sort((a, b) => b.length - a.length)[0] ?? '/crm'
  return (
    <nav aria-label="CRM" className="-mt-1 mb-5 flex gap-1 overflow-x-auto border-b border-borde">
      {pestanas.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.href === activa ? 'page' : undefined}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-texto-2 hover:text-texto aria-[current=page]:border-acento aria-[current=page]:text-texto"
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  )
}
