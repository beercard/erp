import { eq } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Boton, EncabezadoPagina, Panel } from '@/components/ui'
import { cuentasTesoreria } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { estadoConciliacion } from '@/modulos/tesoreria/conciliacion'

import { aceptarSugerenciasAccion, desconciliarAccion } from '../../acciones'
import { ConciliarAMano, SubirExtracto } from './Conciliacion'

export const metadata: Metadata = { title: 'Conciliación bancaria' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Conciliacion({ params }: PageProps<'/tesoreria/conciliacion/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('tesoreria.ver', async (tx) => {
    const [c] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, id))
    return c ? { c, e: await estadoConciliacion(tx, id) } : null
  })
  if (!datos) notFound()
  const { c, e } = datos
  const simbolo = SIMBOLO[c.moneda] ?? c.moneda
  const puede = tienePermiso(sesion.permisos, 'tesoreria.conciliar')
  const lineaDe = new Map(e.pendientesBanco.map((l) => [l.id, l]))
  const movDe = new Map(e.pendientesSistema.map((m) => [`${m.origen}|${m.id}`, m]))
  const conciliadas = e.lineas
    .filter((l) => l.conciliada)
    .slice(-30)
    .reverse()

  return (
    <>
      <Link
        href={`/tesoreria/cuentas/${c.id}`}
        className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento"
      >
        <ChevronLeft aria-hidden className="size-3.5" /> {c.nombre}
      </Link>
      <EncabezadoPagina titulo="Conciliación bancaria" bajada={`${c.nombre}: lo que dice el banco contra lo registrado.`} />

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-4">
        {[
          {
            texto: `Saldo según el banco${e.fechaSaldoBanco ? ` al ${fechaCorta(e.fechaSaldoBanco)}` : ''}`,
            valor: e.saldoBanco,
          },
          { texto: 'Saldo en el sistema', valor: e.saldoSistema },
          { texto: 'Líneas del banco sin conciliar', valor: String(e.pendientesBanco.length), cantidad: true },
          { texto: 'Movimientos del sistema sin conciliar', valor: String(e.pendientesSistema.length), cantidad: true },
        ].map((x) => (
          <div key={x.texto} className="bg-superficie px-4 py-4">
            <span className="cifras block text-xl font-medium">
              {x.valor === null ? '—' : x.cantidad ? x.valor : formatearMonto(x.valor, simbolo)}
            </span>
            <span className="mt-1 block text-xs text-texto-2">{x.texto}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {puede && (
          <Panel className="p-4">
            <SubirExtracto cuentaId={c.id} />
          </Panel>
        )}

        {e.sugerencias.length > 0 && (
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
              <h2 className="text-sm font-semibold">Coincidencias propuestas ({e.sugerencias.length})</h2>
              {puede && (
                <form action={aceptarSugerenciasAccion.bind(null, c.id)}>
                  <input type="hidden" name="sugerencias" value={JSON.stringify(e.sugerencias)} />
                  <Boton type="submit" variante="primario">
                    Aceptar todas
                  </Boton>
                </form>
              )}
            </div>
            <ul className="divide-y divide-borde text-sm">
              {e.sugerencias.map((s) => {
                const l = lineaDe.get(s.lineaId)!
                const m = movDe.get(`${s.movimientos[0].origen}|${s.movimientos[0].id}`)!
                return (
                  <li key={s.lineaId} className="grid gap-2 px-4 py-2 md:grid-cols-[1fr_auto_1fr]">
                    <span>
                      {l.descripcion} <span className="text-xs text-texto-3">{fechaCorta(l.fecha)}</span>
                    </span>
                    <span className="cifras text-center font-medium">{formatearMonto(l.importe, simbolo)}</span>
                    <span className="text-texto-2">
                      {m.descripcion} <span className="text-xs text-texto-3">{fechaCorta(m.fecha)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        )}

        {puede && (
          <ConciliarAMano
            cuentaId={c.id}
            simbolo={simbolo}
            lineas={e.pendientesBanco.map((l) => ({ ...l, importe: String(l.importe) }))}
            movimientos={e.pendientesSistema.map((m) => ({
              origen: m.origen,
              id: m.id,
              fecha: m.fecha,
              importe: m.importe,
              descripcion: m.descripcion,
            }))}
          />
        )}

        {conciliadas.length > 0 && (
          <Panel>
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Últimas conciliadas</h2>
            <ul className="divide-y divide-borde text-sm">
              {conciliadas.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span>
                    {l.descripcion} <span className="text-xs text-texto-3">{fechaCorta(l.fecha)}</span>
                  </span>
                  <span className="cifras">{formatearMonto(String(l.importe), simbolo)}</span>
                  {puede && (
                    <form action={desconciliarAccion.bind(null, c.id, l.id)}>
                      <button type="submit" className="text-xs text-texto-2 hover:text-acento">
                        Deshacer
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  )
}
