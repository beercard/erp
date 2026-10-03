import { ArrowDownToLine } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { conEmpresa } from '@/db/empresa'
import { formatearMonto } from '@/lib/dinero'
import { leerEnlace } from '@/lib/enlaces'
import { estadoDeuda, etiquetaComprobante } from '@/modulos/facturacion/cobranza'

export const metadata: Metadata = { title: 'Estado de cuenta', robots: { index: false, follow: false } }

const dma = (f: string) => f.split('-').reverse().join('/')

/** El estado de cuenta que llega en los recordatorios: enlace firmado, sin usuario. */
export default async function DeudaPublica({ params }: PageProps<'/deuda/[token]'>) {
  const { token } = await params
  const e = leerEnlace(decodeURIComponent(token), 'deuda')
  if (!e) notFound()
  const d = await conEmpresa(e.empresaId, (tx) => estadoDeuda(tx, e.id))
  if (!d) notFound()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm text-texto-3">{d.empresa}</p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estado de cuenta</h1>
          <p className="text-sm text-texto-2">
            {d.cliente.nombre} · al {dma(d.hoy)}
          </p>
        </div>
        <a
          href={`/deuda/${token}/pdf`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borde px-3 text-sm font-medium hover:bg-superficie-2"
        >
          <ArrowDownToLine aria-hidden className="size-4" /> PDF
        </a>
      </div>
      <dl className="mb-5 grid grid-cols-3 gap-3">
        {[
          ['Vencido', d.vencido],
          ['A vencer', d.aVencer],
          ['Total', d.total],
        ].map(([t, v]) => (
          <div key={t} className="rounded-xl border border-borde bg-superficie p-4">
            <dt className="text-xs text-texto-2">{t}</dt>
            <dd className={`cifras mt-1 text-xl font-bold ${t === 'Vencido' && Number(v) > 0 ? 'text-error' : ''}`}>
              {formatearMonto(v, '$')}
            </dd>
          </div>
        ))}
      </dl>
      {d.renglones.length ? (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-superficie-2 text-left text-xs text-texto-2">
              <tr>
                <th className="px-3 py-2 font-medium">Comprobante</th>
                <th className="px-3 py-2 font-medium">Vence</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {d.renglones.map((r) => (
                <tr key={r.id}>
                  <td className="cifras px-3 py-2">{etiquetaComprobante(r)}</td>
                  <td className="px-3 py-2">{dma(r.vence)}</td>
                  <td className={`px-3 py-2 ${r.diasVencido > 0 ? 'text-error' : 'text-texto-2'}`}>
                    {r.diasVencido > 0
                      ? `Vencida hace ${r.diasVencido} días`
                      : r.diasVencido === 0
                        ? 'Vence hoy'
                        : `Vence en ${-r.diasVencido} días`}
                  </td>
                  <td className="cifras px-3 py-2 text-right">{formatearMonto(r.saldo, '$')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-borde p-6 text-center text-sm text-texto-2">No hay deuda pendiente. ¡Gracias!</p>
      )}
      <p className="mt-4 text-xs text-texto-3">Si ya pagaste, puede que el pago todavía no esté registrado.</p>
    </main>
  )
}
