import { and, asc, eq } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina } from '@/components/ui'
import { cuentasTesoreria } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarCheques } from '@/modulos/tesoreria/cheques'
import { ESTADOS_CHEQUE, type EstadoCheque } from '@/modulos/tesoreria/medios'

import { Cheques } from './Cheques'

export const metadata: Metadata = { title: 'Cheques' }

const FILTROS: { valor: EstadoCheque | ''; texto: string }[] = [
  { valor: 'cartera', texto: 'En cartera' },
  { valor: 'depositado', texto: 'Depositados' },
  { valor: 'entregado', texto: 'Entregados' },
  { valor: 'rechazado', texto: 'Rechazados' },
  { valor: '', texto: 'Todos' },
]

export default async function PaginaCheques({ searchParams }: PageProps<'/tesoreria/cheques'>) {
  const sp = await searchParams
  const sesion = await requerirEmpresa()
  const estado = (
    typeof sp.estado === 'string' && sp.estado in ESTADOS_CHEQUE ? sp.estado : sp.estado === '' ? '' : 'cartera'
  ) as EstadoCheque | ''
  const q = typeof sp.q === 'string' ? sp.q : ''
  const datos = await enLaEmpresa('tesoreria.ver', async (tx) => ({
    cheques: await listarCheques(tx, { estado: estado || undefined, q }),
    bancos: await tx
      .select({ id: cuentasTesoreria.id, nombre: cuentasTesoreria.nombre })
      .from(cuentasTesoreria)
      .where(and(eq(cuentasTesoreria.tipo, 'banco'), eq(cuentasTesoreria.moneda, 'PES'), eq(cuentasTesoreria.activa, true)))
      .orderBy(asc(cuentasTesoreria.nombre)),
  }))
  const total = datos.cheques.reduce((s, c) => s + Number(c.importe), 0)
  return (
    <>
      <Link href="/tesoreria" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Tesorería
      </Link>
      <EncabezadoPagina
        titulo="Cheques y ECHEQ de terceros"
        bajada={`${datos.cheques.length} cheques por ${formatearMonto(total.toFixed(2), '$')}. Entran con las cobranzas; salen depositados o entregados en pagos.`}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form role="search" className="w-full max-w-xs">
          <input type="hidden" name="estado" value={estado} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Cliente, banco o número, y Enter"
            aria-label="Buscar"
            className="h-9 w-full rounded-md border border-borde bg-superficie px-3 text-sm placeholder:text-texto-3 focus:border-acento"
          />
        </form>
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={`/tesoreria/cheques?${new URLSearchParams({ estado: f.valor, ...(q && { q }) })}`}
              aria-current={estado === f.valor ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-xs ${
                estado === f.valor
                  ? 'border-acento bg-acento-suave text-acento'
                  : 'border-borde text-texto-2 hover:bg-superficie-2'
              }`}
            >
              {f.texto}
            </Link>
          ))}
        </nav>
      </div>
      <Cheques
        cheques={datos.cheques}
        bancos={datos.bancos}
        hoy={hoyArgentina()}
        puede={tienePermiso(sesion.permisos, 'tesoreria.mover')}
      />
    </>
  )
}
