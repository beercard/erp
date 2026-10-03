import { LogOut } from 'lucide-react'

import { salirAccion } from '../acciones'
import { colores, requerirPortal } from '../sesion'
import { NavPortal } from './NavPortal'

/** Marco del portal de clientes: la marca de la empresa, el cliente y su menú. */
export default async function MarcoPortal({ children }: LayoutProps<'/portal'>) {
  const s = await requerirPortal()
  const menu = [
    { href: '/portal', texto: 'Inicio' },
    ...(s.ordenes ? [{ href: '/portal/pedir', texto: 'Pedir servicio' }] : []),
    ...(s.contadores ? [{ href: '/portal/contadores', texto: 'Contadores' }] : []),
    ...(s.formularios ? [{ href: '/portal/formularios', texto: 'Formularios' }] : []),
    ...(s.cuenta ? [{ href: '/portal/cuenta', texto: 'Mi cuenta' }] : []),
  ]
  return (
    <div style={colores(s.color)} className="flex min-h-full flex-col">
      <header className="no-imprimir sticky top-0 z-30 border-b border-borde bg-superficie/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white shadow-suave"
              style={{ background: s.color }}
            >
              {s.empresa[0]}
            </span>
            <div className="min-w-0">
              <p className="truncate leading-tight font-semibold">{s.empresa}</p>
              <p className="truncate text-xs text-texto-2">
                {s.cliente.razonSocial} · {s.usuario.nombre ?? s.usuario.email}
              </p>
            </div>
          </div>
          <nav aria-label="Portal" className="flex flex-wrap items-center gap-1 text-sm">
            <NavPortal menu={menu} />
            <form action={salirAccion}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-texto-2 hover:bg-superficie-2 hover:text-texto"
              >
                <LogOut aria-hidden className="size-4" /> Salir
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="contenido mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}
