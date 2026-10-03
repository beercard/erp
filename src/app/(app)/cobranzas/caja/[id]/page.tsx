import { ArrowDownToLine, FileText, Printer } from 'lucide-react'
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
        bajada={`Del ${hora(c.desde)} al ${hora(c.hasta)} · cerró ${c.usuario ?? '—'}${c.supervisor ? ` · diferencia aprobada por ${c.supervisor}` : ''}`}
        acciones={
          <>
            <Imprimir>
              <Printer aria-hidden /> Imprimir
            </Imprimir>
            <BotonEnlace href={`/cobranzas/caja/${c.id}/pdf`} variante="secundario">
              <FileText aria-hidden /> PDF
            </BotonEnlace>
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
      {(c.turno || (c.medios?.length ?? 0) > 0 || (c.envio?.length ?? 0) > 0) && (
        <Panel className="mt-5 grid gap-5 p-5 md:grid-cols-2">
          {(c.medios?.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">Otros medios rendidos</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-texto-2">
                  <tr>
                    <th className="py-1 text-left font-medium">Medio</th>
                    <th className="py-1 text-right font-medium">Esperado</th>
                    <th className="py-1 text-right font-medium">Rendido</th>
                    <th className="py-1 text-right font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {c.medios!.map((m) => (
                    <tr key={m.medio}>
                      <td className="py-1.5">{m.nombre}</td>
                      <td className="cifras py-1.5 text-right">{formatearMonto(m.esperado, '$')}</td>
                      <td className="cifras py-1.5 text-right">{formatearMonto(m.contado, '$')}</td>
                      <td className={`cifras py-1.5 text-right ${Number(m.diferencia) === 0 ? 'text-ok' : 'text-error'}`}>
                        {Number(m.diferencia) === 0 ? 'Cuadró' : formatearMonto(m.diferencia, '$')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-col gap-4 text-sm">
            {c.turno && (
              <div>
                <h3 className="mb-1 font-semibold">Apertura</h3>
                <p className="text-texto-2">
                  {hora(c.turno.abierto)} · {c.turno.abrio ?? '—'} · fondo contado{' '}
                  <span className="cifras">{formatearMonto(c.turno.fondoContado, '$')}</span>
                  {c.turno.fondoContado !== c.turno.fondoEsperado && (
                    <>
                      {' '}
                      (el sistema decía <span className="cifras">{formatearMonto(c.turno.fondoEsperado, '$')}</span>)
                    </>
                  )}
                </p>
                {c.turno.nota && <p className="mt-1 whitespace-pre-line text-texto-3">{c.turno.nota}</p>}
              </div>
            )}
            {(c.envio?.length ?? 0) > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Reporte enviado</h3>
                <ul className="text-texto-2">
                  {c.envio!.map((e) => (
                    <li key={`${e.via}-${e.destino}`}>
                      {e.via === 'correo' ? 'Correo' : 'WhatsApp'} a {e.destino}:{' '}
                      <span className={e.ok ? 'text-ok' : 'text-error'}>{e.ok ? 'enviado' : (e.error ?? 'no salió')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      )}
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
