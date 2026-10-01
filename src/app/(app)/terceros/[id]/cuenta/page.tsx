import { eq } from 'drizzle-orm'
import { ChevronLeft, Wallet } from 'lucide-react'
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
import { cuentaCorriente } from '@/modulos/facturacion/cuentas'
import { abreviatura } from '@/modulos/facturacion/tipos'

export const metadata: Metadata = { title: 'Cuenta corriente' }

export default async function CuentaCorriente({ params }: PageProps<'/terceros/[id]/cuenta'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('ventas.ver', async (tx) => {
    const [t] = await tx.select().from(terceros).where(eq(terceros.id, id))
    if (!t) return null
    return { t, cc: await cuentaCorriente(tx, id) }
  })
  if (!datos) notFound()
  const { t, cc } = datos
  const hoy = hoyArgentina()
  const vencido = cc.pendientes.filter((p) => p.vencimiento && p.vencimiento < hoy).reduce((s, p) => s + Number(p.saldo), 0)

  return (
    <>
      <Link href={`/terceros/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> {t.razonSocial}
      </Link>
      <EncabezadoPagina
        titulo="Cuenta corriente"
        bajada={`${t.razonSocial} · en pesos`}
        acciones={
          tienePermiso(sesion.permisos, 'ventas.cobrar') && (
            <BotonEnlace href={`/cobranzas/nueva?cliente=${id}`} variante="primario">
              <Wallet aria-hidden className="size-4" /> Cobrar
            </BotonEnlace>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-4">
        {[
          { texto: 'Saldo', valor: cc.saldo, tono: Number(cc.saldo) > 0 ? '' : 'text-ok' },
          { texto: 'Comprobantes con deuda', valor: String(cc.pendientes.length), cantidad: true },
          { texto: 'Vencido', valor: vencido.toFixed(2), tono: vencido > 0 ? 'text-error' : '' },
          { texto: 'A cuenta (sin aplicar)', valor: cc.aCuenta },
        ].map((c) => (
          <div key={c.texto} className="bg-superficie px-4 py-4">
            <span className={`cifras block text-xl font-medium ${c.tono ?? ''}`}>
              {c.cantidad ? c.valor : formatearMonto(c.valor, '$')}
            </span>
            <span className="mt-1 block text-xs text-texto-2">{c.texto}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Movimientos</h2>
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-xs text-texto-2">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Comprobante</th>
                <th className="px-4 py-2 text-right font-medium">Debe</th>
                <th className="px-4 py-2 text-right font-medium">Haber</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {cc.movimientos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-texto-2">
                    Sin movimientos.
                  </td>
                </tr>
              )}
              {cc.movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-texto-2">{fechaCorta(m.fecha)}</td>
                  <td className="cifras px-4 py-2">
                    <Link href={m.tipo === 'recibo' ? `/cobranzas/${m.id}` : `/facturas/${m.id}`} className="hover:text-acento">
                      <span className="mr-2 inline-block w-10 text-texto-2">
                        {m.tipo === 'recibo' ? 'RC' : abreviatura(m.comprobanteTipo!)}
                      </span>
                      {formatearNumero(m.puntoVenta, m.numero ?? 0)}
                    </Link>
                  </td>
                  <td className="cifras px-4 py-2 text-right">{Number(m.debe) ? formatearMonto(m.debe, '$') : ''}</td>
                  <td className="cifras px-4 py-2 text-right">{Number(m.haber) ? formatearMonto(m.haber, '$') : ''}</td>
                  <td className="cifras px-4 py-2 text-right font-medium">{formatearMonto(m.saldo, '$')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel className="h-fit overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Pendiente de cobro</h2>
          <ul className="divide-y divide-borde text-sm">
            {cc.pendientes.length === 0 && <li className="px-4 py-4 text-texto-2">Nada pendiente.</li>}
            {cc.pendientes.map((p) => {
              const vencida = p.vencimiento && p.vencimiento < hoy
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/facturas/${p.id}`} className="cifras hover:text-acento">
                    {abreviatura(p.tipo)} {formatearNumero(p.puntoVenta, p.numero ?? 0)}
                    <span className={`block font-sans text-xs ${vencida ? 'text-error' : 'text-texto-3'}`}>
                      {p.vencimiento ? `${vencida ? 'venció' : 'vence'} el ${fechaCorta(p.vencimiento)}` : fechaCorta(p.fecha)}
                    </span>
                  </Link>
                  <span className="cifras">{formatearMonto(p.saldo, '$')}</span>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
    </>
  )
}
