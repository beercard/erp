import { ChevronLeft, Printer } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ChipEstado } from '@/components/comercial/VistaDocumento'
import { Aviso, Boton, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/formato'
import { obtenerRecibo } from '@/modulos/facturacion/cuentas'
import { MEDIOS } from '@/modulos/facturacion/medios'
import { abreviatura } from '@/modulos/facturacion/tipos'

import { anularReciboAccion } from '../../facturacion/acciones'

export const metadata: Metadata = { title: 'Recibo' }

export default async function Recibo({ params, searchParams }: PageProps<'/cobranzas/[id]'>) {
  const { id } = await params
  const { guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const r = await enLaEmpresa('ventas.ver', (tx) => obtenerRecibo(tx, id))
  if (!r) notFound()

  return (
    <>
      <Link href="/cobranzas" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Cobranzas
      </Link>
      <EncabezadoPagina
        titulo={`Recibo ${formatearNumero(r.puntoVenta, r.numero)}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <ChipEstado estado={r.estado} />
            <span>
              <Link href={`/terceros/${r.terceroId}/cuenta`} className="hover:text-acento">
                {r.cliente?.razonSocial}
              </Link>{' '}
              · {fechaCorta(r.fecha)}
            </span>
          </span>
        }
        acciones={
          <BotonEnlace href={`/imprimir/recibo/${r.id}`} target="_blank">
            <Printer aria-hidden className="size-4" /> Imprimir
          </BotonEnlace>
        }
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {guardado && <Aviso tono="ok">Recibo emitido.</Aviso>}
        {typeof error === 'string' && <Aviso>{error}</Aviso>}
        {r.estado === 'anulado' && <Aviso tono="aviso">Recibo anulado: no cuenta en la cuenta corriente.</Aviso>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Valores</h2>
            <table className="w-full min-w-[480px] text-sm">
              <tbody className="divide-y divide-borde">
                {r.valores.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2">{MEDIOS[v.medio as keyof typeof MEDIOS] ?? v.medio}</td>
                    <td className="px-4 py-2 text-texto-2">
                      {[
                        v.banco,
                        v.numeroValor && `N° ${v.numeroValor}`,
                        v.fechaPago && `paga el ${fechaCorta(v.fechaPago)}`,
                        v.detalle,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="cifras px-4 py-2 text-right">{formatearMonto(v.importe, '$')}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="px-4 py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="cifras px-4 py-2 text-right">{formatearMonto(r.total, '$')}</td>
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Aplicado a</h2>
            <table className="w-full min-w-[480px] text-sm">
              <tbody className="divide-y divide-borde">
                {r.imputaciones.map((i) => (
                  <tr key={i.id}>
                    <td className="cifras px-4 py-2">
                      <Link href={`/facturas/${i.comprobanteId}`} className="hover:text-acento">
                        {abreviatura(i.tipo)} {formatearNumero(i.puntoVenta, i.numero ?? 0)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-texto-2">{fechaCorta(i.fecha)}</td>
                    <td className="cifras px-4 py-2 text-right">{formatearMonto(i.importe, '$')}</td>
                  </tr>
                ))}
                {Number(r.aCuenta) > 0 && (
                  <tr>
                    <td className="px-4 py-2" colSpan={2}>
                      A cuenta
                    </td>
                    <td className="cifras px-4 py-2 text-right">{formatearMonto(r.aCuenta, '$')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
          {r.observaciones && <Panel className="p-4 text-sm text-texto-2">{r.observaciones}</Panel>}
        </div>
        <aside className="flex flex-col gap-3">
          <BotonEnlace href={`/terceros/${r.terceroId}/cuenta`} className="justify-center">
            Ver la cuenta corriente
          </BotonEnlace>
          {r.estado === 'emitido' && tienePermiso(sesion.permisos, 'ventas.anular') && (
            <form action={anularReciboAccion.bind(null, r.id)}>
              <Boton type="submit" variante="fantasma" className="w-full">
                Anular el recibo (la deuda vuelve)
              </Boton>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
