import { CreditCard } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Aviso, Boton, Chip, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { formatearNumero } from '@/modulos/comercial/formato'
import { hayPasarelas } from '@/modulos/cobros/cobros'
import { cuentaCorriente } from '@/modulos/facturacion/cuentas'
import { nombreComprobante } from '@/modulos/facturacion/tipos'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'

import { pagarDesdePortalAccion } from '../../acciones'
import { requerirPortal } from '../../sesion'

export const metadata: Metadata = { title: 'Mi cuenta' }

const pesos = (v: string | number) =>
  Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

/** Cuenta corriente del cliente en el portal: saldo, lo que debe y los últimos movimientos. */
export default async function MiCuenta({ searchParams }: PageProps<'/portal/cuenta'>) {
  const s = await requerirPortal()
  if (!s.cuenta) notFound()
  const { error } = await searchParams
  const [c, pagable] = await conEmpresa(
    s.empresaId,
    async (tx) => [await cuentaCorriente(tx, s.cliente.id), await hayPasarelas(tx)] as const,
  )
  const hoy = hoyArgentina()
  const vencido = c.pendientes.filter((p) => p.vencimiento && p.vencimiento < hoy).reduce((t, p) => t + Number(p.saldo), 0)
  const saldo = Number(c.saldo)
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Mi cuenta</h1>
        {pagable && saldo > 0 && (
          <form action={pagarDesdePortalAccion.bind(null, null)}>
            <Boton type="submit" variante="primario">
              <CreditCard aria-hidden /> Pagar todo ({pesos(saldo)})
            </Boton>
          </form>
        )}
      </div>
      {typeof error === 'string' && <Aviso>{error}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <p className="text-xs text-texto-2">{saldo > 0 ? 'Saldo a pagar' : saldo < 0 ? 'Saldo a tu favor' : 'Saldo'}</p>
          <p className="cifras mt-1 text-2xl font-semibold">{pesos(Math.abs(saldo))}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-texto-2">Vencido</p>
          <p className={`cifras mt-1 text-2xl font-semibold ${vencido > 0 ? 'text-error' : ''}`}>{pesos(vencido)}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-texto-2">Facturas sin pagar</p>
          <p className="cifras mt-1 text-2xl font-semibold">{c.pendientes.length}</p>
        </Panel>
      </div>

      <Panel className="overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Facturas sin pagar</h2>
        {c.pendientes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-texto-2">No tenés facturas pendientes.</p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                <th className="px-4 py-2 font-medium">Comprobante</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
                {pagable && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {c.pendientes.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    {nombreComprobante(p.tipo)} <span className="cifras">{formatearNumero(p.puntoVenta, p.numero ?? 0)}</span>
                  </td>
                  <td className="cifras px-4 py-2">{fechaCorta(p.fecha)}</td>
                  <td className="cifras px-4 py-2">
                    {p.vencimiento ? (
                      p.vencimiento < hoy ? (
                        <Chip tono="error">Vencida {fechaCorta(p.vencimiento)}</Chip>
                      ) : (
                        fechaCorta(p.vencimiento)
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="cifras px-4 py-2 text-right font-medium">{pesos(p.saldo)}</td>
                  {pagable && (
                    <td className="px-4 py-2 text-right">
                      <form action={pagarDesdePortalAccion.bind(null, p.id)}>
                        <button type="submit" className="text-sm font-medium text-acento hover:underline">
                          Pagar
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel className="overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Últimos movimientos</h2>
        {c.movimientos.length === 0 ? (
          <p className="px-4 py-3 text-sm text-texto-2">Todavía no hay movimientos.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
                <th className="px-4 py-2 text-right font-medium">Debe</th>
                <th className="px-4 py-2 text-right font-medium">Haber</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
                {pagable && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {c.movimientos
                .slice(-50)
                .reverse()
                .map((m) => (
                  <tr key={`${m.tipo}-${m.id}`}>
                    <td className="cifras px-4 py-2">{fechaCorta(m.fecha)}</td>
                    <td className="px-4 py-2">
                      {m.tipo === 'recibo' ? 'Pago (recibo)' : nombreComprobante(m.comprobanteTipo!)}{' '}
                      <span className="cifras text-texto-2">{formatearNumero(m.puntoVenta, m.numero ?? 0)}</span>
                    </td>
                    <td className="cifras px-4 py-2 text-right">{Number(m.debe) ? pesos(m.debe) : ''}</td>
                    <td className="cifras px-4 py-2 text-right">{Number(m.haber) ? pesos(m.haber) : ''}</td>
                    <td className="cifras px-4 py-2 text-right">{pesos(m.saldo)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="text-xs text-texto-3">
        Si ves algo que no coincide, escribile a {s.empresa}. Los pagos pueden tardar en reflejarse hasta que se registran.
      </p>
    </>
  )
}
