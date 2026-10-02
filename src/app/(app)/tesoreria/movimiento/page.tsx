import { asc, eq } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { cuentasTesoreria } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'

import { FormularioMovimiento } from '../FormulariosTesoreria'

export const metadata: Metadata = { title: 'Movimiento de tesorería' }

export default async function Movimiento({ searchParams }: PageProps<'/tesoreria/movimiento'>) {
  await exigirPermiso('tesoreria.mover')
  const { cuenta } = await searchParams
  const cuentas = await enLaEmpresa('tesoreria.mover', (tx) =>
    tx
      .select({
        id: cuentasTesoreria.id,
        nombre: cuentasTesoreria.nombre,
        tipo: cuentasTesoreria.tipo,
        moneda: cuentasTesoreria.moneda,
      })
      .from(cuentasTesoreria)
      .where(eq(cuentasTesoreria.activa, true))
      .orderBy(asc(cuentasTesoreria.tipo), asc(cuentasTesoreria.nombre)),
  )
  return (
    <>
      <Link href="/tesoreria" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Tesorería
      </Link>
      <EncabezadoPagina
        titulo="Movimiento de tesorería"
        bajada="Gastos, retiros, ingresos varios, depósitos y extracciones, pago del resumen de la tarjeta, acreditación de cupones."
      />
      <Panel className="p-4">
        <FormularioMovimiento
          cuentas={cuentas}
          hoy={hoyArgentina()}
          cuentaInicial={typeof cuenta === 'string' && cuentas.some((c) => c.id === cuenta) ? cuenta : undefined}
        />
      </Panel>
    </>
  )
}
