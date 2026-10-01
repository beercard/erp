import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { saldosPorCliente } from '@/modulos/facturacion/cuentas'

export const metadata: Metadata = { title: 'Cuentas corrientes' }

export default async function Cuentas() {
  const filas = await enLaEmpresa('ventas.ver', (tx) => saldosPorCliente(tx))
  const deudores = filas.filter((f) => Number(f.saldo) > 0)
  const total = deudores.reduce((s, f) => s + Number(f.saldo), 0)
  return (
    <>
      <EncabezadoPagina
        titulo="Cuentas corrientes"
        bajada={`${deudores.length} clientes deben ${formatearMonto(total.toFixed(2), '$')} en total`}
      />
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-texto-2">
                  Ningún cliente tiene saldo.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="group hover:bg-superficie-2">
                <td className="cifras px-4 py-2.5 text-texto-2">{f.codigo}</td>
                <td className="px-4 py-2.5">
                  <Link href={`/terceros/${f.id}/cuenta`} className="font-medium group-hover:text-acento">
                    {f.razonSocial}
                  </Link>
                </td>
                <td className={`cifras px-4 py-2.5 text-right ${Number(f.saldo) < 0 ? 'text-ok' : ''}`}>
                  {formatearMonto(f.saldo, '$')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
