import { Building2, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

import { Boton, Panel } from '@/components/ui'
import { requerirSesion } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'

import { elegir, salir } from '../ingresar/acciones'

export const metadata: Metadata = { title: 'Elegir empresa' }

export default async function PaginaEmpresas() {
  const sesion = await requerirSesion()
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Hola, {sesion.usuario.nombre.split(' ')[0]}</h1>
      <p className="mt-1 mb-6 text-sm text-texto-2">
        {sesion.empresas.length ? 'Elegí la empresa en la que vas a trabajar.' : 'Todavía no tenés acceso a ninguna empresa.'}
      </p>
      {sesion.empresas.length > 0 && (
        <Panel className="divide-y divide-borde overflow-hidden">
          {sesion.empresas.map((e) => (
            <form key={e.id} action={elegir}>
              <input type="hidden" name="empresa" value={e.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-superficie-2"
              >
                <Building2 aria-hidden className="size-5 shrink-0 text-texto-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.razonSocial}</span>
                  <span className="cifras block text-xs text-texto-3">
                    CUIT {formatearCuit(e.cuit)} · {e.rol}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 text-texto-3" />
              </button>
            </form>
          ))}
        </Panel>
      )}
      <form action={salir} className="mt-6">
        <Boton type="submit" variante="fantasma">
          Cerrar sesión
        </Boton>
      </form>
    </main>
  )
}
