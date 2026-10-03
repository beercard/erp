import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { formatearNumero } from '@/modulos/comercial/formato'
import { detalleLote } from '@/modulos/facturacion/automatica'
import { abreviatura } from '@/modulos/facturacion/tipos'

import { AutorizarLote } from './Autorizar'

export const metadata: Metadata = { title: 'Lote de facturas' }

const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export default async function Lote({ params, searchParams }: PageProps<'/facturas/masiva/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  await exigirPermiso('ventas.facturar')
  const d = await enLaEmpresa('ventas.facturar', (tx) => detalleLote(tx, id))
  if (!d) notFound()
  const { noArmadas } = await searchParams
  let sinArmar: { orden: number; error: string }[] = []
  try {
    sinArmar = typeof noArmadas === 'string' ? JSON.parse(noArmadas) : []
  } catch {}
  return (
    <>
      <Link href="/facturas/masiva" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Facturación masiva
      </Link>
      <EncabezadoPagina
        titulo={d.lote.nombre}
        bajada={`${d.facturas.length} facturas por ${pesos(d.total)} · ${d.autorizadas} autorizadas · ${d.borradores} en borrador`}
      />
      {!!sinArmar.length && (
        <div className="mb-4">
          <Aviso tono="aviso">
            {sinArmar.length} no se pudieron armar:{' '}
            {sinArmar
              .slice(0, 10)
              .map((e) => `n.º ${e.orden}: ${e.error}`)
              .join(' · ')}
          </Aviso>
        </div>
      )}
      {d.lote.autorizar && d.borradores > 0 && (
        <Panel className="mb-4 p-4">
          <AutorizarLote id={id} pendientes={d.borradores} />
        </Panel>
      )}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Comprobante</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {d.facturas.map((f) => (
              <tr key={f.id} className="border-b border-borde last:border-0 hover:bg-superficie-2/60">
                <td className="px-4 py-2.5">
                  <Link href={`/facturas/${f.id}`} className="font-medium tabular-nums hover:text-acento">
                    {abreviatura(f.tipo)} {f.numero ? formatearNumero(f.puntoVenta, f.numero) : '(borrador)'}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{f.cliente}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{pesos(Number(f.total))}</td>
                <td className="px-4 py-2.5">
                  {f.estado === 'autorizado' ? (
                    <Chip tono="ok">Autorizada</Chip>
                  ) : f.error ? (
                    <span className="text-xs text-error">{f.error}</span>
                  ) : (
                    <Chip>{f.estado === 'borrador' ? 'Borrador' : 'Pendiente de ARCA'}</Chip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
