import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { saldosPorProveedor } from '@/modulos/compras/cuentas'

export const metadata: Metadata = { title: 'Cuentas de proveedores' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function CuentasProveedores() {
  const filas = await enLaEmpresa('compras.ver', (tx) => saldosPorProveedor(tx))
  const total = (moneda: string) => filas.filter((f) => f.moneda === moneda).reduce((s, f) => s + Number(f.saldo), 0)
  return (
    <>
      <EncabezadoPagina
        titulo="Cuentas de proveedores"
        bajada="Lo que se le debe a cada proveedor, por moneda. Negativo: pagado de más o a cuenta."
      />
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-4">
        {['PES', 'DOL'].map((m) => (
          <div key={m} className="bg-superficie px-4 py-4">
            <span className="cifras block text-xl font-medium">{formatearMonto(total(m).toFixed(2), SIMBOLO[m])}</span>
            <span className="mt-1 block text-xs text-texto-2">Total en {m === 'PES' ? 'pesos' : 'dólares'}</span>
          </div>
        ))}
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 font-medium">Moneda</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-texto-2">
                  No hay saldos con proveedores.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={`${f.id}-${f.moneda}`} className="group hover:bg-superficie-2">
                <td className="px-4 py-2.5">
                  <Link href={`/terceros/${f.id}/proveedor`} className="group-hover:text-acento">
                    {f.razonSocial}
                  </Link>
                  <span className="cifras ml-2 text-xs text-texto-3">{f.codigo}</span>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{f.moneda === 'PES' ? 'Pesos' : 'Dólares'}</td>
                <td className={`cifras px-4 py-2.5 text-right ${Number(f.saldo) < 0 ? 'text-ok' : ''}`}>
                  {formatearMonto(f.saldo, SIMBOLO[f.moneda] ?? f.moneda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
