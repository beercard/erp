import { ChevronsUpDown, LifeBuoy } from 'lucide-react'
import Link from 'next/link'

import { Lanzador } from '@/components/shell/Lanzador'
import { MenuMovil } from '@/components/shell/MenuMovil'
import { MenuUsuario } from '@/components/shell/MenuUsuario'
import { Migas } from '@/components/shell/Migas'
import { Navegacion } from '@/components/shell/Navegacion'
import { PaletaComandos } from '@/components/shell/PaletaComandos'
import { Isotipo } from '@/components/sitio/Logo'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { MARCA } from '@/lib/marca'
import { salirSoporteAccion } from '@/app/plataforma/acciones'

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
    <div className="flex min-h-full flex-col">
      {/* Barra superior oscura de lado a lado: marca, búsqueda, aplicaciones y la persona. */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 bg-barra px-3 text-sobre-barra sm:px-4">
        <MenuMovil funciones={sesion.suscripcion.funciones} permisos={sesion.permisos} />
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10 lg:w-[232px]">
          <Isotipo className="size-7" />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
            {MARCA.corto}
            <span className="font-normal text-sobre-barra-2"> ERP</span>
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-end md:justify-center">
          <PaletaComandos funciones={sesion.suscripcion.funciones} />
        </div>
        <div className="flex items-center gap-1 lg:w-[232px] lg:justify-end">
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

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden bg-lateral lg:block">
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
            <Link
              href="/empresas"
              title="Cambiar de empresa"
              className="tarjeta mx-3 mt-3 mb-3 flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-superficie-2"
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-acento-suave text-sm font-bold text-acento"
              >
                {sesion.empresa.razonSocial[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-tight font-semibold">{sesion.empresa.razonSocial}</span>
                <span className="cifras block text-[11px] text-texto-3">{formatearCuit(sesion.empresa.cuit)}</span>
              </span>
              <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-texto-3" />
            </Link>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
              <Navegacion funciones={sesion.suscripcion.funciones} permisos={sesion.permisos} />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          {sesion.soporte && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-info/30 bg-info-suave px-4 py-2 text-sm text-info sm:px-8"
            >
              <LifeBuoy aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">
                <strong className="font-semibold">Modo soporte, solo lectura.</strong> Estás viendo {sesion.empresa.razonSocial}{' '}
                como soporte de la plataforma hasta las{' '}
                {sesion.soporte.hasta.toLocaleTimeString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}{' '}
                h. Queda registrado en la auditoría de la empresa.
              </span>
              <form action={salirSoporteAccion.bind(null, sesion.empresa.id)}>
                <button type="submit" className="font-semibold underline">
                  Salir del modo soporte
                </button>
              </form>
            </div>
          )}
          {aviso && !sesion.soporte && (
            <div role="status" className={`border-b px-4 py-2 text-sm sm:px-8 ${TONO_AVISO[aviso.tono]}`}>
              {aviso.texto}{' '}
              <Link href="/configuracion/suscripcion" className="font-medium underline">
                {sesion.suscripcion.soloLectura ? 'Elegir un plan' : 'Ver planes'}
              </Link>
            </div>
          )}
          <main id="contenido" className="contenido mx-auto w-full max-w-[1320px] px-4 pt-4 pb-10 sm:px-8 sm:pt-5">
            <Migas funciones={sesion.suscripcion.funciones} permisos={sesion.permisos} />
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
