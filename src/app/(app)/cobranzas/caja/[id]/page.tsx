import { ArrowDownToLine, Printer } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Aviso, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { obtenerCierre } from '@/modulos/tesoreria/cierres'

import { ResumenCaja } from '../Resumen'
import { Imprimir } from './Imprimir'

export const metadata: Metadata = { title: 'Cierre de caja' }

const hora = (d: Date) =>
  d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

export default async function DetalleCierre({ params, searchParams }: PageProps<'/cobranzas/caja/[id]'>) {
  const { id } = await params
  const { cerrado } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const c = await enLaEmpresa('ventas.ver', (tx) => obtenerCierre(tx, id))
  if (!c) notFound()
  const conteo = Object.entries(c.conteo ?? {}).sort((a, b) => Number(b[0]) - Number(a[0]))
  return (
    <>
      <EncabezadoPagina
        titulo={`Cierre de ${c.caja}`}
        bajada={`Del ${hora(c.desde)} al ${hora(c.hasta)} · cerró ${c.usuario ?? '—'}`}
        acciones={
          <>
            <Imprimir>
              <Printer aria-hidden /> Imprimir
            </Imprimir>
            <BotonEnlace href={`/cobranzas/caja/${c.id}/excel`}>
              <ArrowDownToLine aria-hidden /> Excel
            </BotonEnlace>
          </>
        }
      />
      {cerrado && (
        <div className="mb-4">
          <Aviso tono="ok">
            Caja cerrada. El próximo turno arranca con {formatearMonto(c.contado, '$')} en efectivo.{' '}
            <Link href={`/cobranzas/caja?c=${c.cuentaId}`} className="font-medium underline">
              Ver el turno nuevo
            </Link>
          </Aviso>
        </div>
      )}
      <ResumenCaja r={c.resumen} contado={c.contado} diferencia={c.diferencia} />
      {(conteo.length > 0 || c.observaciones) && (
        <Panel className="mt-5 grid gap-5 p-5 md:grid-cols-2">
          {conteo.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">Conteo</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-borde">
                  {conteo.map(([d, n]) => (
                    <tr key={d}>
                      <td className="cifras py-1.5">$ {Number(d).toLocaleString('es-AR')}</td>
                      <td className="cifras py-1.5 text-right">× {n}</td>
                      <td className="cifras py-1.5 text-right">$ {(Number(d) * n).toLocaleString('es-AR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.observaciones && (
            <div>
              <h3 className="mb-2 font-semibold">Observaciones</h3>
              <p className="text-sm whitespace-pre-line text-texto-2">{c.observaciones}</p>
            </div>
          )}
        </Panel>
      )}
    </>
  )
}
