import { ChevronRight, Clock, LifeBuoy, Search } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel, Vacio } from '@/components/ui'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { buscarGuias, CATEGORIAS, type Categoria } from '@/lib/ayuda/guias'

export const metadata: Metadata = { title: 'Ayuda y guías' }

export default async function Ayuda({ searchParams }: PageProps<'/ayuda'>) {
  await requerirEmpresa()
  const { q } = await searchParams
  const texto = typeof q === 'string' ? q : ''
  const guias = buscarGuias(texto)
  const categorias = (Object.keys(CATEGORIAS) as Categoria[]).filter((c) => guias.some((g) => g.categoria === c))
  return (
    <>
      <EncabezadoPagina
        titulo="Ayuda y guías"
        bajada="Guías paso a paso para conectar ARCA, Mercado Pago, WhatsApp, tus tiendas y tu equipo por tu cuenta. Cada una se puede imprimir o guardar en PDF."
      />
      <form role="search" className="relative mb-6 max-w-xl">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-3" />
        <label htmlFor="q" className="sr-only">
          Buscar en las guías
        </label>
        <input
          id="q"
          name="q"
          defaultValue={texto}
          placeholder="Buscá: certificado, token, webhook, punto de venta…"
          className="h-10 w-full rounded-lg border border-borde-fuerte/80 bg-superficie pr-3 pl-9 text-sm shadow-suave placeholder:text-texto-3 focus:border-acento"
        />
      </form>
      {!guias.length ? (
        <Panel>
          <Vacio icono={LifeBuoy} titulo={`No encontramos guías sobre "${texto}"`}>
            Probá con otra palabra o{' '}
            <Link href="/ayuda" className="text-acento hover:underline">
              mirá todas
            </Link>
            .
          </Vacio>
        </Panel>
      ) : (
        <div className="flex flex-col gap-8">
          {categorias.map((c) => (
            <section key={c}>
              <h2 className="mb-3 text-sm font-semibold text-texto-2">{CATEGORIAS[c]}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {guias
                  .filter((g) => g.categoria === c)
                  .map((g) => (
                    <Link
                      key={g.id}
                      href={`/ayuda/${g.id}`}
                      className="tarjeta group flex flex-col gap-1.5 p-4 hover:bg-superficie-2/60"
                    >
                      <span className="flex items-start justify-between gap-2 font-semibold">
                        {g.titulo}
                        <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-texto-3 group-hover:text-acento" />
                      </span>
                      <span className="text-sm text-texto-2">{g.resumen}</span>
                      <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs text-texto-3">
                        <Clock aria-hidden className="size-3.5" /> {g.minutos} min · {g.pasos.length} pasos
                      </span>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
