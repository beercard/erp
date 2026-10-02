import { ChevronLeft, FileText, Printer } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/formato'
import { MEDIOS_PAGO } from '@/modulos/compras/medios'
import { obtenerPago } from '@/modulos/compras/pagos'
import { abreviaturaCompra } from '@/modulos/compras/tipos'

import { anularPagoAccion } from '../../compras/acciones'

export const metadata: Metadata = { title: 'Orden de pago' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Pago({ params, searchParams }: PageProps<'/pagos/[id]'>) {
  const { id } = await params
  const { guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const p = await enLaEmpresa('compras.ver', (tx) => obtenerPago(tx, id))
  if (!p) notFound()
  const simbolo = SIMBOLO[p.moneda] ?? p.moneda
  const numero = String(p.numero).padStart(6, '0')
  const retencion = p.retenciones.find((r) => r.impuesto === 'ganancias')

  return (
    <>
      <Link href="/pagos" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Pagos
      </Link>
      <EncabezadoPagina
        titulo={`Orden de pago ${numero}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            {p.estado === 'anulado' ? <Chip tono="error">Anulada</Chip> : <Chip tono="ok">Emitida</Chip>}
            <Link href={`/terceros/${p.terceroId}`} className="hover:text-acento">
              {p.proveedor?.razonSocial}
            </Link>
            · {fechaCorta(p.fecha)}
          </span>
        }
        acciones={
          <>
            <BotonEnlace href={`/imprimir/pago/${p.id}`} target="_blank">
              <Printer aria-hidden className="size-4" /> Imprimir
            </BotonEnlace>
            {retencion && (
              <BotonEnlace href={`/imprimir/retencion/${retencion.id}`} target="_blank">
                <FileText aria-hidden className="size-4" /> Certificado de retención
              </BotonEnlace>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {guardado && <Aviso tono="ok">Orden de pago {numero} emitida.</Aviso>}
        {typeof error === 'string' && <Aviso>{error}</Aviso>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Panel>
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Comprobantes que cancela</h2>
            <ul className="divide-y divide-borde text-sm">
              {p.imputaciones.length === 0 && <li className="px-4 py-3 text-texto-2">Ninguno: todo queda a cuenta.</li>}
              {p.imputaciones.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <Link href={`/compras/${i.compraId}`} className="cifras hover:text-acento">
                    {abreviaturaCompra(i.tipo)} {formatearNumero(i.puntoVenta, i.numero)}
                  </Link>
                  <span className="text-texto-2">{fechaCorta(i.fecha)}</span>
                  <span className="cifras">
                    {formatearMonto(i.importe, SIMBOLO[i.moneda] ?? i.moneda)}
                    {i.moneda !== p.moneda && (
                      <span className="ml-2 text-xs text-texto-3">({formatearMonto(i.importeOrigen, simbolo)})</span>
                    )}
                  </span>
                </li>
              ))}
              {Number(p.aCuenta) > 0 && (
                <li className="flex justify-between px-4 py-2">
                  <span>A cuenta</span>
                  <span className="cifras">{formatearMonto(p.aCuenta, simbolo)}</span>
                </li>
              )}
            </ul>
          </Panel>
          <Panel>
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Valores entregados</h2>
            <ul className="divide-y divide-borde text-sm">
              {p.valores.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span>{MEDIOS_PAGO[v.medio as keyof typeof MEDIOS_PAGO] ?? v.medio}</span>
                  <span className="text-texto-2">
                    {[v.banco, v.numeroValor && `N° ${v.numeroValor}`, v.fechaPago && fechaCorta(v.fechaPago), v.detalle]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="cifras">{formatearMonto(v.importe, simbolo)}</span>
                </li>
              ))}
              {p.retenciones.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span>Retención de Ganancias (régimen {r.regimen})</span>
                  <span className="cifras text-texto-2">Certificado {String(r.numero).padStart(6, '0')}</span>
                  <span className="cifras">{formatearMonto(r.importe, '$')}</span>
                </li>
              ))}
            </ul>
          </Panel>
          {p.observaciones && <Panel className="p-4 text-sm text-texto-2">{p.observaciones}</Panel>}
        </div>
        <aside className="flex flex-col gap-3">
          <Panel className="flex flex-col gap-1 p-4 text-sm">
            <span className="text-texto-2">Cancela</span>
            <span className="cifras text-lg font-medium">{formatearMonto(p.total, simbolo)}</span>
            {p.moneda !== 'PES' && (
              <span className="text-xs text-texto-3">Dólar {Number(p.cotizacion).toLocaleString('es-AR')}</span>
            )}
          </Panel>
          <BotonEnlace href={`/terceros/${p.terceroId}/proveedor`} className="justify-center">
            Ver la cuenta del proveedor
          </BotonEnlace>
          {p.estado === 'emitido' && tienePermiso(sesion.permisos, 'compras.pagar') && (
            <form action={anularPagoAccion.bind(null, p.id)}>
              <BotonConfirmar
                variante="fantasma"
                className="w-full"
                pregunta={`¿Anular la orden de pago ${numero}? La deuda vuelve, los cheques de terceros vuelven a la cartera${retencion ? ' y el certificado de retención queda anulado' : ''}.`}
              >
                Anular la orden de pago
              </BotonConfirmar>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
