import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { pesos } from '@/components/planes/TarjetasPlanes'
import { EncabezadoPagina, Panel } from '@/components/ui'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { planPorId, PLANES } from '@/lib/planes'
import { metricas } from '@/modulos/plataforma/consola'
import { estadoCron } from '@/modulos/plataforma/monitoreo'
import { pedidosPendientes } from '@/modulos/plataforma/suscripciones'

import { exigirAdmin } from './admin'
import { ChipEstado, Indicador, Indicadores, TituloPanel } from './componentes'
import { BarrasHorizontales, ColumnasMes } from './Graficos'

export const metadata: Metadata = { title: 'Resumen · Plataforma' }

const porcentaje = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)} %`)

export default async function Resumen() {
  await exigirAdmin()
  const hoy = hoyArgentina()
  const [m, pedidos, cron] = await Promise.all([metricas(hoy), pedidosPendientes(), estadoCron()])

  const pendientes = [
    pedidos.length > 0 && { texto: `${pedidos.length} pedidos de cambio de plan sin atender`, href: '/plataforma/pedidos' },
    m.soloLectura > 0 && {
      texto: `${m.soloLectura} empresas en solo lectura (vencidas o suspendidas)`,
      href: '/plataforma/empresas?estado=solo_lectura',
    },
    (!cron || cron.atrasado || !cron.ok) && { texto: 'La tarea periódica no está al día', href: '/plataforma/operacion' },
  ].filter(Boolean) as { texto: string; href: string }[]

  return (
    <>
      <EncabezadoPagina titulo="Resumen" bajada="Cómo va el servicio: ingresos, empresas, uso y lo que necesita atención." />

      <div className="flex flex-col gap-5">
        <Indicadores>
          <Indicador rotulo="Ingreso mensual recurrente" valor={pesos(m.mrr)} detalle={`${pesos(m.arr)} al año · + IVA`} />
          <Indicador
            rotulo="Empresas que pagan"
            valor={m.pagas}
            detalle={`de ${m.empresas} en total · ticket ${pesos(m.ticketPromedio)}`}
          />
          <Indicador
            rotulo="En prueba gratis"
            valor={m.enPrueba}
            detalle={`conversión ${porcentaje(m.conversion)} (${m.maduras} con la prueba terminada)`}
          />
          <Indicador
            rotulo="Usuarios activos"
            valor={m.usuarios.semana}
            detalle={`en 7 días · ${m.usuarios.mes} en 30 días de ${m.usuarios.total}`}
          />
        </Indicadores>

        {pendientes.length > 0 && (
          <Panel>
            <TituloPanel>Necesita atención</TituloPanel>
            <ul className="divide-y divide-borde text-sm">
              {pendientes.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-superficie-2">
                    {p.texto}
                    <ArrowRight aria-hidden className="size-4 text-texto-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel className="p-4">
            <ColumnasMes titulo="Cobrado por mes (con IVA)" datos={m.cobrado} pesos />
          </Panel>
          <Panel className="p-4">
            <ColumnasMes titulo="Empresas nuevas por mes" datos={m.altas} />
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Panel>
            <TituloPanel extra={<span className="text-xs text-texto-2">{m.bajas} suspendidas, canceladas o de baja</span>}>
              Empresas por plan
            </TituloPanel>
            <div className="p-4">
              <BarrasHorizontales
                datos={PLANES.map((p) => ({ texto: p.nombre, valor: m.porPlan.find((x) => x.plan === p.id)?.n ?? 0 }))}
              />
            </div>
          </Panel>

          <Panel className="overflow-x-auto">
            <TituloPanel
              extra={
                <Link href="/plataforma/empresas?orden=vence" className="text-xs font-medium text-acento hover:underline">
                  Ver todas
                </Link>
              }
            >
              Vencen en los próximos 7 días
            </TituloPanel>
            {m.porVencer.length === 0 ? (
              <p className="px-4 py-6 text-sm text-texto-2">Ninguna prueba ni pago vence esta semana.</p>
            ) : (
              <table className="w-full min-w-[480px] text-sm">
                <tbody className="divide-y divide-borde">
                  {m.porVencer.map((f) => (
                    <tr key={f.empresaId} className="hover:bg-superficie-2">
                      <td className="px-4 py-2.5">
                        <Link href={`/plataforma/empresas/${f.empresaId}`} className="font-medium hover:text-acento">
                          {f.razonSocial}
                        </Link>
                        <span className="block text-xs text-texto-3">Plan {planPorId(f.plan).nombre}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <ChipEstado estado={f.estado} />
                      </td>
                      <td className="cifras px-4 py-2.5 text-right text-xs">
                        {f.estado === 'prueba' ? 'termina la prueba' : 'vence el pago'} {fechaCorta(f.vence!)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
