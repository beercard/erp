import { and, eq } from 'drizzle-orm'
import { ArrowLeftRight, ChevronLeft, FileCheck2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { arqueos, cuentasTesoreria, movimientosTesoreria } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { movimientosCuenta } from '@/modulos/tesoreria/cuentas'
import { TIPOS_CUENTA, TIPOS_MOVIMIENTO } from '@/modulos/tesoreria/medios'

import { anularMovimientoAccion } from '../../acciones'
import { FormularioArqueo, FormularioCuenta, FormularioSaldoInicial } from '../../FormulariosTesoreria'

export const metadata: Metadata = { title: 'Cuenta de tesorería' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const ORIGEN: Record<string, string> = {
  efectivo: 'Cobro en efectivo',
  transferencia: 'Transferencia',
  tarjeta_credito: 'Cupón de crédito',
  tarjeta_debito: 'Cupón de débito',
  mercado_pago: 'Mercado Pago',
  cheque_propio: 'Cheque propio',
  echeq_propio: 'ECHEQ propio',
  tarjeta: 'Pago con tarjeta',
  otro: 'Otro',
}

export default async function Cuenta({ params, searchParams }: PageProps<'/tesoreria/cuentas/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const hoy = hoyArgentina()
  const desde = typeof sp.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) ? sp.desde : `${hoy.slice(0, 7)}-01`
  const hasta = typeof sp.hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta) ? sp.hasta : undefined
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('tesoreria.ver', async (tx) => {
    const [c] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, id))
    if (!c) return null
    const libro = await movimientosCuenta(tx, id, { desde, hasta })
    const ultimosArqueos = c.tipo === 'caja' ? await tx.select().from(arqueos).where(eq(arqueos.cuentaId, id)) : []
    const [saldoInicial] = await tx
      .select({ id: movimientosTesoreria.id })
      .from(movimientosTesoreria)
      .where(
        and(
          eq(movimientosTesoreria.cuentaId, id),
          eq(movimientosTesoreria.tipo, 'saldo_inicial'),
          eq(movimientosTesoreria.estado, 'vigente'),
        ),
      )
    return {
      c,
      libro,
      tieneSaldoInicial: !!saldoInicial,
      arqueos: ultimosArqueos.sort((a, b) => b.creado.getTime() - a.creado.getTime()).slice(0, 5),
    }
  })
  if (!datos) notFound()
  const { c, libro } = datos
  const simbolo = SIMBOLO[c.moneda] ?? c.moneda
  const puede = tienePermiso(sesion.permisos, 'tesoreria.mover')
  const tieneSaldoInicial = datos.tieneSaldoInicial

  return (
    <>
      <Link href="/tesoreria" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Tesorería
      </Link>
      <EncabezadoPagina
        titulo={c.nombre}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <Chip>{TIPOS_CUENTA[c.tipo as keyof typeof TIPOS_CUENTA]}</Chip>
            {c.numeroCuenta && <span className="cifras">{c.numeroCuenta}</span>}
            {!c.activa && <Chip tono="error">Inactiva</Chip>}
          </span>
        }
        acciones={
          <>
            {(c.tipo === 'banco' || c.tipo === 'billetera') && (
              <BotonEnlace href={`/tesoreria/conciliacion/${c.id}`}>
                <FileCheck2 aria-hidden className="size-4" /> Conciliar
              </BotonEnlace>
            )}
            {puede && (
              <BotonEnlace href={`/tesoreria/movimiento?cuenta=${c.id}`} variante="primario">
                <ArrowLeftRight aria-hidden className="size-4" /> Movimiento
              </BotonEnlace>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {sp.guardado && <Aviso tono="ok">Cuenta guardada.</Aviso>}
        {typeof sp.error === 'string' && <Aviso>{sp.error}</Aviso>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="overflow-x-auto">
          <form className="flex flex-wrap items-end gap-3 border-b border-borde px-4 py-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-texto-2">Desde</span>
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                className="h-8 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-texto-2">Hasta</span>
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                className="h-8 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm"
              />
            </label>
            <button type="submit" className="h-8 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">
              Ver
            </button>
            <span className="ml-auto text-right">
              <span className="block text-xs text-texto-2">Saldo</span>
              <span className={`cifras text-lg font-medium ${Number(libro.saldo) < 0 ? 'text-error' : ''}`}>
                {formatearMonto(libro.saldo, simbolo)}
              </span>
            </span>
          </form>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-xs text-texto-2">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Movimiento</th>
                <th className="px-4 py-2 text-right font-medium">Entra</th>
                <th className="px-4 py-2 text-right font-medium">Sale</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              <tr className="text-texto-2">
                <td className="px-4 py-2" colSpan={4}>
                  Saldo al {fechaCorta(desde)}
                </td>
                <td className="cifras px-4 py-2 text-right">{formatearMonto(libro.saldoAnterior, simbolo)}</td>
                <td />
              </tr>
              {libro.movimientos.map((m) => {
                const enlace =
                  m.origen === 'recibo_valor'
                    ? `/cobranzas/${m.documentoId}`
                    : m.origen === 'pago_valor'
                      ? `/pagos/${m.documentoId}`
                      : null
                const titulo =
                  m.origen === 'movimiento'
                    ? TIPOS_MOVIMIENTO[m.tipo as keyof typeof TIPOS_MOVIMIENTO]
                    : (ORIGEN[m.tipo] ?? m.tipo)
                return (
                  <tr key={`${m.origen}-${m.id}`} className={m.fecha > hoy ? 'text-texto-3' : ''}>
                    <td className="px-4 py-2 whitespace-nowrap text-texto-2">{fechaCorta(m.fecha)}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{titulo}</span>
                      {m.conciliado && (
                        <span className="ml-2">
                          <Chip tono="ok">Conciliado</Chip>
                        </span>
                      )}
                      <span className="block text-xs text-texto-2">
                        {enlace ? (
                          <Link href={enlace} className="hover:text-acento">
                            {m.descripcion}
                          </Link>
                        ) : (
                          m.descripcion
                        )}
                      </span>
                    </td>
                    <td className="cifras px-4 py-2 text-right">
                      {Number(m.importe) > 0 ? formatearMonto(m.importe, simbolo) : ''}
                    </td>
                    <td className="cifras px-4 py-2 text-right">
                      {Number(m.importe) < 0 ? formatearMonto(String(Math.abs(Number(m.importe))), simbolo) : ''}
                    </td>
                    <td className="cifras px-4 py-2 text-right">{formatearMonto(m.saldo, simbolo)}</td>
                    <td className="px-2 py-2">
                      {puede &&
                        m.origen === 'movimiento' &&
                        !m.conciliado &&
                        !['deposito_cheque', 'rechazo_cheque'].includes(m.tipo) && (
                          <form action={anularMovimientoAccion.bind(null, c.id, m.id)}>
                            <BotonConfirmar variante="fantasma" className="h-7 px-2 text-xs" pregunta="¿Anular este movimiento?">
                              Anular
                            </BotonConfirmar>
                          </form>
                        )}
                    </td>
                  </tr>
                )
              })}
              {libro.movimientos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-texto-2">
                    Sin movimientos en el período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        <aside className="flex flex-col gap-4">
          {puede && !tieneSaldoInicial && (
            <Panel className="flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold">Saldo inicial</h2>
              <p className="text-xs text-texto-2">
                El del extracto del banco (o lo contado en la caja) el día que se empieza a usar el sistema.
              </p>
              <FormularioSaldoInicial cuentaId={c.id} hoy={hoy} />
            </Panel>
          )}
          {puede && c.tipo === 'caja' && (
            <Panel className="flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold">Arqueo</h2>
              <FormularioArqueo cuentaId={c.id} hoy={hoy} />
              {datos.arqueos.length > 0 && (
                <ul className="mt-2 divide-y divide-borde text-xs">
                  {datos.arqueos.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2 py-1.5">
                      <span>{fechaCorta(a.fecha)}</span>
                      <span className="cifras">{formatearMonto(a.contado, simbolo)}</span>
                      <span className={`cifras ${Number(a.diferencia) === 0 ? 'text-ok' : 'text-error'}`}>
                        {Number(a.diferencia) === 0 ? 'sin diferencia' : formatearMonto(a.diferencia, simbolo)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {puede && (
            <Panel className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Datos de la cuenta</h2>
              <FormularioCuenta id={c.id} inicial={c} />
            </Panel>
          )}
        </aside>
      </div>
    </>
  )
}
