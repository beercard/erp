import { AlertTriangle, ArrowRight, ChevronLeft, CircleCheck, Clock, UserRound } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Codigo, ImprimirGuia } from '@/components/ayuda/Piezas'
import { BotonEnlace, Panel } from '@/components/ui'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { CATEGORIAS, GUIAS, guiaPorId } from '@/lib/ayuda/guias'
import { contacto, MARCA, URL_SITIO } from '@/lib/marca'

export async function generateMetadata({ params }: PageProps<'/ayuda/[id]'>): Promise<Metadata> {
  const g = guiaPorId((await params).id)
  return { title: g ? `${g.titulo} · Ayuda` : 'Ayuda' }
}

/** Párrafos y listas: las líneas que empiezan con "- " se agrupan en una lista. */
function Texto({ lineas }: { lineas: string[] }) {
  const bloques: (string | string[])[] = []
  for (const l of lineas) {
    if (l.startsWith('- ')) {
      const ultimo = bloques.at(-1)
      if (Array.isArray(ultimo)) ultimo.push(l.slice(2))
      else bloques.push([l.slice(2)])
    } else bloques.push(l)
  }
  return (
    <>
      {bloques.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i} className="mt-2 list-disc space-y-1 pl-5 text-texto-2">
            {b.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mt-2 text-texto-2">
            {b}
          </p>
        ),
      )}
    </>
  )
}

export default async function GuiaAyuda({ params }: PageProps<'/ayuda/[id]'>) {
  await requerirEmpresa()
  const g = guiaPorId((await params).id)
  if (!g) notFound()
  const relacionadas = (g.relacionadas ?? []).map(guiaPorId).filter((x) => x !== null)
  const c = contacto()

  return (
    <article className="mx-auto max-w-3xl print:max-w-none">
      <Link href="/ayuda" className="no-imprimir mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Ayuda y guías
      </Link>
      <p className="text-xs font-medium tracking-wide text-acento uppercase">{CATEGORIAS[g.categoria]}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{g.titulo}</h1>
      <p className="mt-1.5 text-texto-2">{g.resumen}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-texto-3">
        <span className="inline-flex items-center gap-1">
          <Clock aria-hidden className="size-3.5" /> Unos {g.minutos} minutos
        </span>
        <span className="inline-flex items-center gap-1">
          <UserRound aria-hidden className="size-3.5" /> {g.quien}
        </span>
      </div>
      <div className="no-imprimir mt-4 flex flex-wrap gap-2">
        {g.pantalla && (
          <BotonEnlace href={g.pantalla.href} variante="primario">
            {g.pantalla.texto} <ArrowRight aria-hidden />
          </BotonEnlace>
        )}
        <ImprimirGuia />
      </div>

      {g.antes.length > 0 && (
        <Panel className="mt-6 p-4 print:border print:shadow-none">
          <h2 className="font-semibold">Antes de empezar</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {g.antes.map((a) => (
              <li key={a} className="flex gap-2">
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-acento" />
                <span className="text-texto-2">{a}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ol className="mt-6 flex flex-col gap-5">
        {g.pasos.map((p, i) => (
          <li key={p.titulo} className="flex gap-3 break-inside-avoid">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-acento text-[13px] font-semibold text-sobre-acento print:border print:border-texto print:bg-transparent print:text-texto"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 text-[14.5px] leading-relaxed">
              <h3 className="font-semibold">{p.titulo}</h3>
              <Texto lineas={p.texto} />
              {p.codigo && <Codigo texto={p.codigo} />}
              {p.ojo && (
                <p className="mt-2 flex gap-2 rounded-lg bg-aviso-suave p-3 text-sm text-aviso">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>{p.ojo}</span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {g.problemas && g.problemas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Si algo no funciona</h2>
          <div className="flex flex-col divide-y divide-borde rounded-xl border border-borde">
            {g.problemas.map((x) => (
              <details key={x.sintoma} className="group p-3 print:block" open>
                <summary className="cursor-pointer text-sm font-medium">{x.sintoma}</summary>
                <p className="mt-1.5 text-sm text-texto-2">{x.solucion}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {relacionadas.length > 0 && (
        <section className="no-imprimir mt-8">
          <h2 className="mb-2 font-semibold">Guías relacionadas</h2>
          <div className="flex flex-wrap gap-2">
            {relacionadas.map((r) => (
              <Link
                key={r.id}
                href={`/ayuda/${r.id}`}
                className="rounded-full border border-borde px-3 py-1 text-sm hover:border-acento hover:text-acento"
              >
                {r.titulo}
              </Link>
            ))}
          </div>
        </section>
      )}

      <Panel className="no-imprimir mt-8 p-4 text-sm">
        <p className="font-medium">¿Seguís con dudas?</p>
        <p className="mt-1 text-texto-2">
          Escribinos{' '}
          {c.email ? (
            <>
              a{' '}
              <a className="text-acento hover:underline" href={`mailto:${c.email}`}>
                {c.email}
              </a>
            </>
          ) : null}
          {c.whatsapp ? (
            <>
              {c.email ? ' o ' : ''}por{' '}
              <a className="text-acento hover:underline" href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </>
          ) : null}
          {!c.email && !c.whatsapp && (
            <>
              desde el{' '}
              <a className="text-acento hover:underline" href={`${URL_SITIO}/contacto`} target="_blank" rel="noreferrer">
                formulario de contacto
              </a>
            </>
          )}
          . Nunca te vamos a pedir claves, certificados ni tokens.
        </p>
      </Panel>
      <p className="mt-6 hidden text-xs text-texto-3 print:block">
        {MARCA.producto} · Guía &quot;{g.titulo}&quot; · {GUIAS.length} guías disponibles en Ayuda y guías.
      </p>
    </article>
  )
}
