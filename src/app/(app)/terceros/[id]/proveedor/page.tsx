import { eq } from 'drizzle-orm'
import { ChevronLeft, FilePlus, Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { terceros } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/formato'
import { cuentaProveedor } from '@/modulos/compras/cuentas'
import { abreviaturaCompra } from '@/modulos/compras/tipos'

export const metadata: Metadata = { title: 'Cuenta del proveedor' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const MONEDA: Record<string, string> = { PES: 'Pesos', DOL: 'Dólares' }

export default async function CuentaProveedor({ params }: PageProps<'/terceros/[id]/proveedor'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('compras.ver', async (tx) => {
    const [t] = await tx.select().from(terceros).where(eq(terceros.id, id))
    if (!t) return null
    return { t, cc: await cuentaProveedor(tx, id) }
  })
  if (!datos) notFound()
  const { t, cc } = datos
  const hoy = hoyArgentina()

  return (
    <>
      <Link href={`/terceros/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> {t.razonSocial}
      </Link>
      <EncabezadoPagina
        titulo="Cuenta del proveedor"
        bajada={`${t.razonSocial} · lo que le debemos, por moneda`}
        acciones={
          <>
            {tienePermiso(sesion.permisos, 'compras.cargar') && (
              <BotonEnlace href={`/compras/nueva?proveedor=${id}`}>
                <FilePlus aria-hidden className="size-4" /> Registrar compra
              </BotonEnlace>
            )}
            {tienePermiso(sesion.permisos, 'compras.pagar') && (
              <BotonEnlace href={`/pagos/nuevo?proveedor=${id}`} variante="primario">
                <Wallet aria-hidden className="size-4" /> Pagar
              </BotonEnlace>
            )}
          </>
        }
      />
      {cc.cuentas.length === 0 && <Panel className="p-6 text-sm text-texto-2">Sin movimientos con este proveedor.</Panel>}

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde empty:hidden lg:grid-cols-4">
        {cc.cuentas.flatMap((c) => [
          <div key={`${c.moneda}-s`} className="bg-superficie px-4 py-4">
            <span className={`cifras block text-xl font-medium ${Number(c.saldo) > 0 ? '' : 'text-ok'}`}>
              {formatearMonto(c.saldo, SIMBOLO[c.moneda] ?? c.moneda)}
            </span>
            <span className="mt-1 block text-xs text-texto-2">Saldo en {MONEDA[c.moneda]?.toLowerCase() ?? c.moneda}</span>
          </div>,
          <div key={`${c.moneda}-a`} className="bg-superficie px-4 py-4">
            <span className="cifras block text-xl font-medium">{formatearMonto(c.aCuenta, SIMBOLO[c.moneda] ?? c.moneda)}</span>
            <span className="mt-1 block text-xs text-texto-2">A cuenta sin aplicar ({c.moneda})</span>
          </div>,
        ])}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          {cc.cuentas.map((c) => {
            const simbolo = SIMBOLO[c.moneda] ?? c.moneda
            return (
              <Panel key={c.moneda} className="overflow-x-auto">
                <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
                  Movimientos en {MONEDA[c.moneda]?.toLowerCase()}
                </h2>
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-borde text-left text-xs text-texto-2">
                      <th className="px-4 py-2 font-medium">Fecha</th>
                      <th className="px-4 py-2 font-medium">Comprobante</th>
                      <th className="px-4 py-2 text-right font-medium">Compras</th>
                      <th className="px-4 py-2 text-right font-medium">Pagos y créditos</th>
                      <th className="px-4 py-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {c.movimientos.map((m) => (
                      <tr key={`${m.tipo}-${m.id}`}>
                        <td className="px-4 py-2 text-texto-2">{fechaCorta(m.fecha)}</td>
                        <td className="cifras px-4 py-2">
                          <Link href={m.tipo === 'pago' ? `/pagos/${m.id}` : `/compras/${m.id}`} className="hover:text-acento">
                            <span className="mr-2 inline-block w-10 text-texto-2">
                              {m.tipo === 'pago' ? 'OP' : abreviaturaCompra(m.compraTipo!)}
                            </span>
                            {m.tipo === 'pago' ? String(m.numero).padStart(6, '0') : formatearNumero(m.puntoVenta ?? 0, m.numero)}
                          </Link>
                        </td>
                        <td className="cifras px-4 py-2 text-right">{Number(m.haber) ? formatearMonto(m.haber, simbolo) : ''}</td>
                        <td className="cifras px-4 py-2 text-right">{Number(m.debe) ? formatearMonto(m.debe, simbolo) : ''}</td>
                        <td className="cifras px-4 py-2 text-right font-medium">{formatearMonto(m.saldo, simbolo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )
          })}
        </div>
        <div className="flex flex-col gap-4">
          <Panel className="h-fit">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Pendiente de pago</h2>
            <ul className="divide-y divide-borde text-sm">
              {cc.pendientes.length === 0 && <li className="px-4 py-4 text-texto-2">Nada pendiente.</li>}
              {cc.pendientes.map((p) => {
                const vencida = p.vencimiento && p.vencimiento < hoy
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link href={`/compras/${p.id}`} className="cifras hover:text-acento">
                      {abreviaturaCompra(p.tipo)} {formatearNumero(p.puntoVenta, p.numero)}
                      <span className={`block font-sans text-xs ${vencida ? 'text-error' : 'text-texto-3'}`}>
                        {p.vencimiento ? `${vencida ? 'venció' : 'vence'} el ${fechaCorta(p.vencimiento)}` : fechaCorta(p.fecha)}
                      </span>
                    </Link>
                    <span className="cifras">{formatearMonto(p.saldo, SIMBOLO[p.moneda] ?? p.moneda)}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
          {cc.notasCredito.length > 0 && (
            <Panel className="h-fit">
              <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Notas de crédito sin aplicar</h2>
              <ul className="divide-y divide-borde text-sm">
                {cc.notasCredito.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link href={`/compras/${n.id}`} className="cifras hover:text-acento">
                      {abreviaturaCompra(n.tipo)} {formatearNumero(n.puntoVenta, n.numero)}
                    </Link>
                    <span className="cifras">{formatearMonto(n.disponible, SIMBOLO[n.moneda] ?? n.moneda)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
