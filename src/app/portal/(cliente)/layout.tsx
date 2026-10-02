import { LogOut } from 'lucide-react'
import Link from 'next/link'

import { salirAccion } from '../acciones'
import { colores, requerirPortal } from '../sesion'

/** Marco del portal de clientes: la marca de la empresa, el cliente y su menú. */
export default async function MarcoPortal({ children }: LayoutProps<'/portal'>) {
  const s = await requerirPortal()
  const menu = [
    { href: '/portal', texto: 'Inicio' },
    ...(s.ordenes ? [{ href: '/portal/pedir', texto: 'Pedir servicio' }] : []),
    ...(s.contadores ? [{ href: '/portal/contadores', texto: 'Contadores' }] : []),
    ...(s.formularios ? [{ href: '/portal/formularios', texto: 'Formularios' }] : []),
  ]
  return (
    <div style={colores(s.color)} className="flex min-h-full flex-col">
      <header className="no-imprimir border-b border-borde bg-superficie">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold" style={{ color: s.color }}>
              {s.empresa}
            </p>
            <p className="truncate text-xs text-texto-2">
              {s.cliente.razonSocial} · {s.usuario.nombre ?? s.usuario.email}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {menu.map((m) => (
              <Link key={m.href} href={m.href} className="rounded-md px-3 py-1.5 hover:bg-superficie-2">
                {m.texto}
              </Link>
            ))}
            <form action={salirAccion}>
              <button type="submit" className="flex items-center gap-1 rounded-md px-3 py-1.5 text-texto-2 hover:bg-superficie-2">
                <LogOut aria-hidden className="size-4" /> Salir
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6">{children}</main>
    </div>
  )
}
