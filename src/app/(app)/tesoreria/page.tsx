import { ArrowLeftRight, FileCheck2, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { tienePermiso } from '@/lib/permisos'
import { listarCheques } from '@/modulos/tesoreria/cheques'
import { saldosCuentas } from '@/modulos/tesoreria/cuentas'
import { TIPOS_CUENTA, type TipoCuenta } from '@/modulos/tesoreria/medios'

export const metadata: Metadata = { title: 'Tesorería' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Tesoreria() {
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('tesoreria.ver', async (tx) => ({
    cuentas: await saldosCuentas(tx),
    cartera: await listarCheques(tx, { estado: 'cartera' }),
  }))
  const activas = datos.cuentas.filter((c) => c.activa)
  const total = (moneda: string, tipos: string[]) =>
    activas.filter((c) => c.moneda === moneda && tipos.includes(c.tipo)).reduce((s, c) => s + Number(c.saldo), 0)
  const cartera = datos.cartera.reduce((s, c) => s + Number(c.importe), 0)
  const puede = tienePermiso(sesion.permisos, 'tesoreria.mover')
  const tipos = Object.keys(TIPOS_CUENTA) as TipoCuenta[]

  return (
    <>
      <EncabezadoPagina
        titulo="Tesorería"
        bajada="Saldos de cajas, bancos y billeteras. Salen de cobranzas, pagos y movimientos: no se cargan a mano."
        acciones={
          puede && (
            <>
              <BotonEnlace href="/tesoreria/cuentas/nueva">
                <Plus aria-hidden className="size-4" /> Nueva cuenta
              </BotonEnlace>
              <BotonEnlace href="/tesoreria/movimiento" variante="primario">
                <ArrowLeftRight aria-hidden className="size-4" /> Movimiento
              </BotonEnlace>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-4">
        {[
          { texto: 'Cajas y bancos en pesos', valor: total('PES', ['caja', 'banco', 'billetera']), simbolo: '$' },
          { texto: 'En dólares', valor: total('DOL', ['caja', 'banco', 'billetera', 'inversion']), simbolo: 'US$' },
          { texto: `Cheques en cartera (${datos.cartera.length})`, valor: cartera, simbolo: '$', href: '/tesoreria/cheques' },
          { texto: 'Cupones a acreditar', valor: total('PES', ['cupones']), simbolo: '$' },
        ].map((c) => (
          <div key={c.texto} className="bg-superficie px-4 py-4">
            <span className="cifras block text-xl font-medium">{formatearMonto(c.valor.toFixed(2), c.simbolo)}</span>
            {c.href ? (
              <Link href={c.href} className="mt-1 block text-xs text-acento hover:underline">
                {c.texto}
              </Link>
            ) : (
              <span className="mt-1 block text-xs text-texto-2">{c.texto}</span>
            )}
          </div>
        ))}
      </div>

      {datos.cuentas.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">
          Todavía no hay cuentas. Creá la caja y las cuentas bancarias, y marcá en cada una qué medios entran o salen por ella
          (efectivo, transferencias, Mercado Pago, cheques propios…).
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {tipos
            .filter((t) => datos.cuentas.some((c) => c.tipo === t))
            .map((t) => (
              <Panel key={t} className="overflow-x-auto">
                <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">{TIPOS_CUENTA[t]}</h2>
                <table className="w-full min-w-[560px] text-sm">
                  <tbody className="divide-y divide-borde">
                    {datos.cuentas
                      .filter((c) => c.tipo === t)
                      .map((c) => (
                        <tr key={c.id} className={`group hover:bg-superficie-2 ${c.activa ? '' : 'text-texto-3'}`}>
                          <td className="px-4 py-2.5">
                            <Link href={`/tesoreria/cuentas/${c.id}`} className="font-medium group-hover:text-acento">
                              {c.nombre}
                            </Link>
                            <span className="cifras ml-2 text-xs text-texto-3">{c.codigo}</span>
                            {!c.activa && (
                              <span className="ml-2">
                                <Chip>Inactiva</Chip>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-texto-3">{c.numeroCuenta}</td>
                          <td className="px-4 py-2.5 text-right">
                            {(c.tipo === 'banco' || c.tipo === 'billetera') && (
                              <Link
                                href={`/tesoreria/conciliacion/${c.id}`}
                                className="inline-flex items-center gap-1 text-xs text-acento hover:underline"
                              >
                                <FileCheck2 aria-hidden className="size-3.5" /> Conciliar
                              </Link>
                            )}
                          </td>
                          <td className="cifras px-4 py-2.5 text-right">
                            <span className={`font-medium ${Number(c.saldo) < 0 ? 'text-error' : ''}`}>
                              {formatearMonto(c.saldo, SIMBOLO[c.moneda] ?? c.moneda)}
                            </span>
                            {Number(c.aFuturo) !== 0 && (
                              <span className="block text-xs text-texto-3">
                                {formatearMonto(c.aFuturo, SIMBOLO[c.moneda] ?? c.moneda)} a debitar o acreditar
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Panel>
            ))}
        </div>
      )}
    </>
  )
}
