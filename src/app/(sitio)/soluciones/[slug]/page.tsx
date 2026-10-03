import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonesInicio, Contenedor, Llamado, Preguntas, Rotulo, TituloSeccion } from '@/components/sitio/Bloques'
import { JsonLd } from '@/components/sitio/JsonLd'
import { SOLUCIONES, solucionPorSlug } from '@/components/sitio/soluciones'
import { URL_SITIO } from '@/lib/marca'

export const dynamicParams = false

export function generateStaticParams() {
  return SOLUCIONES.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: PageProps<'/soluciones/[slug]'>): Promise<Metadata> {
  const s = solucionPorSlug((await params).slug)
  if (!s) return {}
  return {
    title: s.titulo,
    description: s.descripcion,
    alternates: { canonical: `/soluciones/${s.slug}` },
    openGraph: { title: s.titulo, description: s.descripcion, url: `/soluciones/${s.slug}` },
  }
}

export default async function Solucion({ params }: PageProps<'/soluciones/[slug]'>) {
  const s = solucionPorSlug((await params).slug)
  if (!s) notFound()
  return (
    <>
      <JsonLd
        datos={[
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Inicio', item: URL_SITIO },
              { '@type': 'ListItem', position: 2, name: s.menu, item: `${URL_SITIO}/soluciones/${s.slug}` },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: s.preguntas.map((q) => ({
              '@type': 'Question',
              name: q.p,
              acceptedAnswer: { '@type': 'Answer', text: q.r },
            })),
          },
        ]}
      />
      <section className="relative overflow-hidden border-b border-borde">
        <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0" />
        <Contenedor className="relative flex flex-col gap-6 py-16 sm:py-24">
          <nav aria-label="Ruta" className="text-sm text-texto-3">
            <Link href="/" className="hover:text-texto">
              Inicio
            </Link>{' '}
            / <span>{s.menu}</span>
          </nav>
          <Rotulo>{s.menu}</Rotulo>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{s.h1}</h1>
          <p className="max-w-2xl text-lg text-texto-2">{s.bajada}</p>
          <BotonesInicio />
        </Contenedor>
      </section>

      <section className="py-16 sm:py-20">
        <Contenedor className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">¿Te pasa esto?</h2>
            <ul className="flex flex-col gap-3">
              {s.dolores.map((d) => (
                <li key={d} className="flex gap-3 tarjeta p-4">
                  <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-aviso" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-center gap-4 rounded-xl bg-acento-suave p-8">
            <CheckCircle2 aria-hidden className="size-8 text-acento" />
            <p className="text-2xl font-semibold tracking-tight text-balance">
              Con Vektra ERP cada dato se carga una sola vez y llega a donde tiene que llegar.
            </p>
            <p className="text-texto-2">Ventas, stock, cobranzas, impuestos y contabilidad, siempre coinciden.</p>
          </div>
        </Contenedor>
      </section>

      <section className="bg-superficie py-16 sm:py-20">
        <Contenedor className="flex flex-col gap-10">
          <TituloSeccion titulo="Cómo te ayuda" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.funciones.map((f) => (
              <article key={f.titulo} className="rounded-xl border border-borde bg-fondo p-6">
                <h3 className="font-semibold">{f.titulo}</h3>
                <p className="mt-2 text-texto-2">{f.texto}</p>
              </article>
            ))}
          </div>
        </Contenedor>
      </section>

      <section className="py-16 sm:py-20">
        <Contenedor className="flex flex-col gap-10">
          <TituloSeccion titulo="Preguntas frecuentes" />
          <Preguntas preguntas={s.preguntas} />
          <p className="text-center text-sm text-texto-2">
            Mirá también:{' '}
            {SOLUCIONES.filter((o) => o.slug !== s.slug).map((o, i, l) => (
              <span key={o.slug}>
                <Link href={`/soluciones/${o.slug}`} className="text-acento hover:underline">
                  {o.menu}
                </Link>
                {i < l.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        </Contenedor>
      </section>

      <Llamado titulo={s.h1} bajada="Probalo gratis con tus datos. Sin tarjeta y sin permanencia." />
    </>
  )
}
