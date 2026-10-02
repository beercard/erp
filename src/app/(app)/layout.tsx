import { LogOut, Server } from 'lucide-react'
import Link from 'next/link'

import { MenuMovil } from '@/components/shell/MenuMovil'
import { Navegacion } from '@/components/shell/Navegacion'
import { PaletaComandos } from '@/components/shell/PaletaComandos'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'

import { salir } from '../ingresar/acciones'

const TONO_AVISO = {
  info: 'border-info/30 bg-info-suave text-info',
  aviso: 'border-aviso/30 bg-aviso-suave text-aviso',
  error: 'border-error/30 bg-error-suave text-error',
}

/** Marco de la aplicación: menú lateral, barra con la búsqueda y la empresa. */
export default async function LayoutApp({ children }: LayoutProps<'/'>) {
  const sesion = await requerirEmpresa()
  const aviso = sesion.suscripcion.aviso
  const iniciales = sesion.usuario.nombre
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-borde bg-superficie lg:flex lg:flex-col">
        <div className="sticky top-0 flex h-screen flex-col gap-5 overflow-y-auto px-3 py-4">
          <Link href="/empresas" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-superficie-2">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-md bg-acento text-sm font-bold text-sobre-acento"
            >
              {sesion.empresa.razonSocial[0]}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{sesion.empresa.razonSocial}</span>
              <span className="cifras block text-[11px] text-texto-3">{formatearCuit(sesion.empresa.cuit)}</span>
            </span>
          </Link>
          <Navegacion funciones={sesion.suscripcion.funciones} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-borde bg-superficie/95 px-4 backdrop-blur sm:px-6">
          <MenuMovil funciones={sesion.suscripcion.funciones} />
          <Link href="/empresas" className="hidden truncate text-sm font-semibold sm:block lg:hidden">
            {sesion.empresa.razonSocial}
          </Link>
          <div className="flex flex-1 justify-center lg:justify-start">
            <PaletaComandos funciones={sesion.suscripcion.funciones} />
          </div>
          <div className="flex items-center gap-2">
            {sesion.usuario.adminPlataforma && (
              <Link
                href="/plataforma"
                title="Administración de la plataforma"
                className="grid size-8 place-items-center rounded-md text-texto-3 hover:bg-superficie-2 hover:text-texto"
              >
                <Server aria-hidden className="size-4" />
                <span className="sr-only">Plataforma</span>
              </Link>
            )}
            <span
              title={`${sesion.usuario.nombre} · ${sesion.rol}`}
              className="grid size-8 place-items-center rounded-full bg-superficie-2 text-xs font-semibold text-texto-2"
            >
              {iniciales}
            </span>
            <form action={salir}>
              <button
                type="submit"
                title="Cerrar sesión"
                className="grid size-8 place-items-center rounded-md text-texto-3 hover:bg-superficie-2 hover:text-texto"
              >
                <LogOut aria-hidden className="size-4" />
                <span className="sr-only">Cerrar sesión</span>
              </button>
            </form>
          </div>
        </header>
        {aviso && (
          <div role="status" className={`border-b px-4 py-2 text-sm sm:px-6 ${TONO_AVISO[aviso.tono]}`}>
            {aviso.texto}{' '}
            <Link href="/configuracion/suscripcion" className="font-medium underline">
              {sesion.suscripcion.soloLectura ? 'Elegir un plan' : 'Ver planes'}
            </Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  )
}
