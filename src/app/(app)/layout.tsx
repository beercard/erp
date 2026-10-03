import { ChevronsUpDown } from 'lucide-react'
import Link from 'next/link'

import { Lanzador } from '@/components/shell/Lanzador'
import { MenuMovil } from '@/components/shell/MenuMovil'
import { MenuUsuario } from '@/components/shell/MenuUsuario'
import { Migas } from '@/components/shell/Migas'
import { Navegacion } from '@/components/shell/Navegacion'
import { PaletaComandos } from '@/components/shell/PaletaComandos'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'

const TONO_AVISO = {
  info: 'border-info/30 bg-info-suave text-info',
  aviso: 'border-aviso/30 bg-aviso-suave text-aviso',
  error: 'border-error/30 bg-error-suave text-error',
}

/** Marco de la aplicación: menú lateral, barra con la búsqueda y la empresa. */
export default async function LayoutApp({ children }: LayoutProps<'/'>) {
  const sesion = await requerirEmpresa()
  const aviso = sesion.suscripcion.aviso

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="hidden border-r border-borde bg-lateral lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <Link
            href="/empresas"
            title="Cambiar de empresa"
            className="mx-3 mt-3 mb-2 flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-borde hover:bg-superficie"
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-acento to-acento-hover text-sm font-bold text-sobre-acento shadow-suave"
            >
              {sesion.empresa.razonSocial[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-tight font-semibold">{sesion.empresa.razonSocial}</span>
              <span className="cifras block text-[11px] text-texto-3">{formatearCuit(sesion.empresa.cuit)}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-texto-3" />
          </Link>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-1 pb-3">
            <Navegacion funciones={sesion.suscripcion.funciones} permisos={sesion.permisos} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-borde bg-superficie/85 px-3 backdrop-blur-md sm:px-6">
          <MenuMovil funciones={sesion.suscripcion.funciones} permisos={sesion.permisos} />
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Migas funciones={sesion.suscripcion.funciones} permisos={sesion.permisos} />
            <div className="flex min-w-0 flex-1 justify-end md:justify-center">
              <PaletaComandos funciones={sesion.suscripcion.funciones} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Lanzador funciones={sesion.suscripcion.funciones} permisos={sesion.permisos} />
            <MenuUsuario
              nombre={sesion.usuario.nombre}
              email={sesion.usuario.email}
              rol={sesion.rol ?? ''}
              empresa={sesion.empresa.razonSocial}
              adminPlataforma={sesion.usuario.adminPlataforma}
            />
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
        <main id="contenido" className="contenido mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
