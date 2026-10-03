import { and, asc, eq } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { cuentasTesoreria } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { gastosPorConcepto, listarVales } from '@/modulos/tesoreria/vales'

import { ListaVales, NuevoVale } from './Piezas'

export const metadata: Metadata = { title: 'Vales a rendir' }

const FILTROS = [
  { valor: 'abierto', texto: 'Sin rendir' },
  { valor: 'rendido', texto: 'Rendidos' },
  { valor: 'anulado', texto: 'Anulados' },
] as const

export default async function Vales({ searchParams }: PageProps<'/tesoreria/vales'>) {
  const sesion = await requerirEmpresa()
  const sp = await searchParams
  const estado = FILTROS.find((f) => f.valor === sp.estado)?.valor ?? 'abierto'
  const hoy = hoyArgentina()
  const mes = hoy.slice(0, 8) + '01'
  const datos = await enLaEmpresa('tesoreria.ver', async (tx) => ({
    vales: await listarVales(tx, { estado }),
    pendientes: await listarVales(tx, { estado: 'abierto' }),
    conceptos: await gastosPorConcepto(tx, mes, hoy),
    cajas: await tx
      .select({ id: cuentasTesoreria.id, nombre: cuentasTesoreria.nombre })
      .from(cuentasTesoreria)
      .where(and(eq(cuentasTesoreria.tipo, 'caja'), eq(cuentasTesoreria.activa, true)))
      .orderBy(asc(cuentasTesoreria.nombre)),
  }))
  const puede = tienePermiso(sesion.permisos, 'tesoreria.mover')
  const afuera = datos.pendientes.reduce((s, v) => s + Number(v.importe), 0)
  const totalMes = datos.conceptos.reduce((s, c) => s + Number(c.total), 0)
  return (
    <>
      <Link href="/tesoreria" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Tesorería
      </Link>
      <EncabezadoPagina
        titulo="Vales a rendir"
        bajada={`Plata que sale de la caja para compras chicas, viáticos o trámites. Hay ${datos.pendientes.length} sin rendir por ${formatearMonto(afuera.toFixed(2), '$')}.`}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <nav aria-label="Estado" className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <Link
                key={f.valor}
                href={`/tesoreria/vales?estado=${f.valor}`}
                aria-current={f.valor === estado ? 'page' : undefined}
                className="inline-flex h-8 items-center rounded-full border border-borde px-3 text-[13px] font-medium text-texto-2 aria-[current=page]:border-acento aria-[current=page]:bg-acento-suave aria-[current=page]:text-acento"
              >
                {f.texto}
              </Link>
            ))}
          </nav>
          <ListaVales vales={datos.vales} hoy={hoy} puede={puede} />
        </div>
        <div className="flex flex-col gap-5">
          {puede && (
            <Panel className="p-5">
              <h2 className="mb-3 font-semibold">Dar un vale</h2>
              <NuevoVale cajas={datos.cajas} hoy={hoy} />
            </Panel>
          )}
          <Panel className="p-5">
            <h2 className="mb-1 font-semibold">Gastos rendidos este mes</h2>
            <p className="mb-3 text-xs text-texto-3">Por concepto, de los vales rendidos desde el 1°.</p>
            {datos.conceptos.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-borde">
                  {datos.conceptos.map((c) => (
                    <tr key={c.concepto}>
                      <td className="py-1.5">{c.concepto}</td>
                      <td className="cifras py-1.5 text-right">{formatearMonto(c.total, '$')}</td>
                      <td className="cifras py-1.5 pl-2 text-right text-xs text-texto-3">
                        {totalMes ? Math.round((Number(c.total) / totalMes) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-texto-3">Todavía no hay gastos rendidos este mes.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
