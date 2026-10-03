import { ArrowDownToLine } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { conEmpresa } from '@/db/empresa'
import { leerEnlace } from '@/lib/enlaces'
import { datosReporte } from '@/modulos/tesoreria/reporteCierre'

import { ResumenCaja } from '../../(app)/cobranzas/caja/Resumen'

export const metadata: Metadata = { title: 'Cierre de caja', robots: { index: false, follow: false } }

const hora = (d: Date) =>
  d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

/** El reporte del cierre que llega por WhatsApp: enlace firmado, sin usuario. */
export default async function CierrePublico({ params }: PageProps<'/cierre/[token]'>) {
  const { token } = await params
  const e = leerEnlace(decodeURIComponent(token), 'cierre')
  if (!e) notFound()
  const r = await conEmpresa(e.empresaId, (tx) => datosReporte(tx, e.id))
  if (!r) notFound()
  const c = r.cierre
  return (
    <main className="mx-auto max-w-5xl bg-fondo px-4 py-8">
      <p className="text-sm text-texto-3">{r.empresa}</p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cierre de {c.caja}</h1>
          <p className="text-sm text-texto-2">
            Del {hora(c.desde)} al {hora(c.hasta)} · cerró {c.usuario ?? '—'}
          </p>
        </div>
        <a
          href={`/cierre/${token}/pdf`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borde px-3 text-sm font-medium hover:bg-superficie-2"
        >
          <ArrowDownToLine aria-hidden className="size-4" /> PDF
        </a>
      </div>
      <ResumenCaja r={c.resumen} contado={c.contado} diferencia={c.diferencia} />
    </main>
  )
}
