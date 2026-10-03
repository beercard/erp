import { ChevronRight, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Logo } from '@/components/sitio/Logo'
import { Boton, Panel } from '@/components/ui'
import { requerirSesion } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { dominioEmpresas, urlDeEmpresa } from '@/lib/subdominio'

import { elegir, salir } from '../ingresar/acciones'
import { FormularioOtraEmpresa } from '../registro/FormularioRegistro'

export const metadata: Metadata = { title: 'Elegir empresa' }

export default async function PaginaEmpresas() {
  const sesion = await requerirSesion()
  const dominio = dominioEmpresas()
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <div className="mb-10">
        <Logo />
      </div>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Hola, {sesion.usuario.nombre.split(' ')[0]}</h1>
      <p className="mt-1 mb-6 text-sm text-texto-2">
        {sesion.empresas.length ? 'Elegí la empresa en la que vas a trabajar.' : 'Todavía no tenés acceso a ninguna empresa.'}
      </p>
      {sesion.empresas.length > 0 && (
        <Panel className="divide-y divide-borde overflow-hidden">
          {sesion.empresas.map((e) => {
            const contenido = (
              <>
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-acento-suave font-semibold text-acento"
                >
                  {e.razonSocial[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.razonSocial}</span>
                  <span className="cifras block text-xs text-texto-3">
                    CUIT {formatearCuit(e.cuit)} · {e.rol}
                  </span>
                  {dominio && e.codigo && (
                    <span className="block truncate text-xs text-acento">
                      {e.codigo}.{dominio}
                    </span>
                  )}
                </span>
                <ChevronRight aria-hidden className="size-4 text-texto-3" />
              </>
            )
            const clase = 'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-superficie-2'
            // Con subdominios, cada empresa se abre en su dirección, con su propia sesión.
            if (dominio && e.codigo) {
              return (
                <a
                  key={e.id}
                  href={urlDeEmpresa(e.codigo, `/ingresar?email=${encodeURIComponent(sesion.usuario.email)}`)}
                  className={clase}
                >
                  {contenido}
                </a>
              )
            }
            return (
              <form key={e.id} action={elegir}>
                <input type="hidden" name="empresa" value={e.id} />
                <button type="submit" className={clase}>
                  {contenido}
                </button>
              </form>
            )
          })}
        </Panel>
      )}
      <details className="mt-6 tarjeta" open={sesion.empresas.length === 0}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          <Plus aria-hidden className="mr-1.5 inline size-4 align-[-3px]" />
          Crear una empresa
        </summary>
        <div className="border-t border-borde p-4">
          <FormularioOtraEmpresa />
        </div>
      </details>
      {sesion.usuario.adminPlataforma && (
        <Link href="/plataforma" className="mt-6 block tarjeta px-4 py-3 text-sm font-medium hover:border-acento">
          Panel de la plataforma →
        </Link>
      )}
      <form action={salir} className="mt-6">
        <Boton type="submit" variante="fantasma">
          Cerrar sesión
        </Boton>
      </form>
    </main>
  )
}
