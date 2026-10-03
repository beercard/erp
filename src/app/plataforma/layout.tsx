import { LogOut } from 'lucide-react'
import Link from 'next/link'

import { salir } from '@/app/ingresar/acciones'
import { Isotipo } from '@/components/sitio/Logo'
import { MARCA } from '@/lib/marca'
import { pedidosPendientes } from '@/modulos/plataforma/suscripciones'
import { listarConsultas } from '@/modulos/plataforma/consultas'
import { erroresRecientes } from '@/modulos/plataforma/monitoreo'

import { exigirAdmin } from './admin'
import { erroresDelDia } from './componentes'
import { NavPlataforma } from './NavPlataforma'

/**
 * Consola de la plataforma: barra propia y menú lateral con sus secciones.
 * El layout no se vuelve a ejecutar al navegar, así que cada página y cada
 * acción vuelven a verificar que quien llama administre la plataforma.
 */
export default async function LayoutPlataforma({ children }: LayoutProps<'/plataforma'>) {
  const sesion = await exigirAdmin()
  const [pedidos, consultas, errores] = await Promise.all([pedidosPendientes(), listarConsultas(100), erroresRecientes(100)])

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 bg-barra px-3 text-sobre-barra sm:px-4">
        <Link href="/plataforma" className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10">
          <Isotipo className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">
            {MARCA.corto}
            <span className="font-normal text-sobre-barra-2"> · Plataforma</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-right text-xs leading-tight sm:block">
            <span className="block font-medium">{sesion.usuario.nombre}</span>
            <span className="text-sobre-barra-2">{sesion.usuario.email}</span>
          </span>
          <form action={salir}>
            <button
              type="submit"
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium hover:bg-white/10"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </form>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="border-b border-borde bg-lateral px-3 py-2 lg:border-b-0">
          <div className="lg:sticky lg:top-[4.25rem]">
            <p className="mb-2 hidden px-2.5 text-xs font-semibold text-texto-3 lg:block">Consola de administración</p>
            <NavPlataforma
              avisos={{
                '/plataforma/pedidos': pedidos.length + consultas.filter((c) => c.estado === 'nueva').length,
                '/plataforma/operacion': erroresDelDia(errores),
              }}
            />
          </div>
        </aside>
        <main id="contenido" className="contenido mx-auto w-full max-w-[1240px] min-w-0 px-4 pt-5 pb-12 sm:px-8 sm:pt-6">
          {children}
        </main>
      </div>
    </div>
  )
}
