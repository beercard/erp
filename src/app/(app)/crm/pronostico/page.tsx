import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina, sumarDias } from '@/lib/fechas'
import { pronostico } from '@/modulos/crm/crm'

import { pesosServidor } from '../formato'

export const metadata: Metadata = { title: 'Pronóstico de ventas' }

const PERIODOS = [
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
  { dias: 365, texto: '12 meses' },
]

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const nombreMes = (m: string) => (m === 'sin-fecha' ? 'Sin fecha' : `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`)

/** Barra horizontal simple: el valor sobre el máximo de la serie. */
function Barra({ valor, maximo, tono = 'bg-acento' }: { valor: number; maximo: number; tono?: string }) {
  return (
    <span className="block h-2 flex-1 overflow-hidden rounded-full bg-superficie-2">
      <span
        style={{ width: `${maximo ? Math.max(2, (valor / maximo) * 100) : 0}%` }}
        className={`block h-full rounded-full ${tono}`}
      />
    </span>
  )
}

export default async function Pronostico({ searchParams }: PageProps<'/crm/pronostico'>) {
  await exigirPermiso('crm.ver')
  const { dias } = await searchParams
  const periodo = PERIODOS.find((p) => String(p.dias) === dias) ?? PERIODOS[1]
  const p = await enLaEmpresa('crm.ver', (tx) => pronostico(tx, sumarDias(hoyArgentina(), -periodo.dias)))
  const maxEtapa = Math.max(...p.etapas.map((e) => e.total), 0)
  const maxMes = Math.max(...p.porMes.map((m) => m.total), 0)
  const maxMotivo = Math.max(...p.motivos.map((m) => m.cantidad), 0)

  const kpis = [
    { t: 'En juego', v: pesosServidor(p.embudo), d: `${p.abiertas} oportunidades abiertas` },
    { t: 'Pronóstico ponderado', v: pesosServidor(p.ponderado), d: 'ingreso × probabilidad' },
    {
      t: `Ganado en ${periodo.texto}`,
      v: pesosServidor(p.ganado),
      d: `${p.ganadas} ganadas · ticket ${p.ticketPromedio ? pesosServidor(p.ticketPromedio) : '—'}`,
    },
    {
      t: 'Tasa de cierre',
      v: p.tasa === null ? '—' : `${Math.round(p.tasa * 100)} %`,
      d: `${p.ganadas} ganadas de ${p.ganadas + p.perdidas} cerradas${p.diasPromedioCierre !== null ? ` · ${Math.round(p.diasPromedioCierre)} días promedio` : ''}`,
    },
  ]

  return (
    <>
      <EncabezadoPagina
        titulo="Pronóstico de ventas"
        bajada="Lo que hay en el embudo, lo que se espera cerrar y por qué se pierde."
        acciones={
          <nav aria-label="Período" className="flex gap-1.5">
            {PERIODOS.map((x) => (
              <a
                key={x.dias}
                href={`/crm/pronostico?dias=${x.dias}`}
                aria-current={x.dias === periodo.dias ? 'page' : undefined}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium ${
                  x.dias === periodo.dias
                    ? 'border-acento bg-acento-suave text-acento'
                    : 'border-borde text-texto-2 hover:bg-superficie-2'
                }`}
              >
                {x.texto}
              </a>
            ))}
          </nav>
        }
      />
      <div className="tarjeta mb-5 grid grid-cols-2 overflow-hidden lg:grid-cols-4">
        {kpis.map((k, n) => (
          <div
            key={k.t}
            className={`p-5 ${n ? 'border-l border-texto/[0.07]' : ''} ${n >= 2 ? 'max-lg:border-t' : ''} ${n === 2 ? 'max-lg:border-l-0' : ''}`}
          >
            <p className="text-[13px] text-texto-2">{k.t}</p>
            <p className="cifras mt-1.5 text-2xl font-bold tracking-tight">{k.v}</p>
            <p className="mt-1 text-xs text-texto-3">{k.d}</p>
          </div>
        ))}
      </div>
      {(p.estancadas > 0 || p.sinActividad > 0) && (
        <p className="mb-5 rounded-xl bg-aviso-suave px-4 py-3 text-sm text-aviso">
          {p.estancadas > 0 && <>{p.estancadas} oportunidades estancadas (pasaron los días de alerta de su etapa). </>}
          {p.sinActividad > 0 && <>{p.sinActividad} sin ninguna actividad agendada.</>}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-4 font-semibold">Embudo por etapa</h2>
          <ul className="flex flex-col gap-3">
            {p.etapas
              .filter((e) => !e.ganada)
              .map((e) => (
                <li key={e.id} className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-sm">
                    <span>
                      {e.nombre} <span className="text-texto-3">({e.cantidad})</span>
                    </span>
                    <span className="cifras font-medium">{pesosServidor(e.total)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Barra valor={e.total} maximo={maxEtapa} />
                    <span className="cifras w-28 text-right text-xs text-texto-3">{pesosServidor(e.ponderado)} pond.</span>
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-4 font-semibold">Cierres esperados por mes</h2>
          {p.porMes.length ? (
            <ul className="flex flex-col gap-3">
              {p.porMes.map((m) => (
                <li key={m.mes} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 capitalize">{nombreMes(m.mes)}</span>
                  <Barra valor={m.total} maximo={maxMes} tono="bg-info" />
                  <span className="cifras w-32 text-right">
                    {pesosServidor(m.ponderado)} <span className="text-xs text-texto-3">pond.</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-texto-3">
              Cargá la fecha de cierre estimada en las oportunidades para ver el pronóstico por mes.
            </p>
          )}
        </Panel>
        <Panel className="overflow-x-auto">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Por responsable</h2>
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-y border-borde text-left text-xs text-texto-2">
                <th className="px-5 py-2 font-medium">Responsable</th>
                <th className="px-3 py-2 text-right font-medium">Abiertas</th>
                <th className="px-3 py-2 text-right font-medium">En juego</th>
                <th className="px-3 py-2 text-right font-medium">Ganadas</th>
                <th className="px-5 py-2 text-right font-medium">Ganado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {p.porResponsable.map((r) => (
                <tr key={r.nombre}>
                  <td className="px-5 py-2.5 font-medium">{r.nombre}</td>
                  <td className="cifras px-3 py-2.5 text-right">{r.abiertas}</td>
                  <td className="cifras px-3 py-2.5 text-right">{pesosServidor(r.embudo)}</td>
                  <td className="cifras px-3 py-2.5 text-right">
                    {r.ganadas}
                    {r.perdidas > 0 && <span className="text-texto-3"> / {r.ganadas + r.perdidas}</span>}
                  </td>
                  <td className="cifras px-5 py-2.5 text-right">{pesosServidor(r.ganado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-4 font-semibold">Por qué se pierden</h2>
          {p.motivos.length ? (
            <>
              <ul className="flex flex-col gap-3">
                {p.motivos.map((m) => (
                  <li key={m.nombre} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate">{m.nombre}</span>
                    <Barra valor={m.cantidad} maximo={maxMotivo} tono="bg-error" />
                    <span className="cifras w-8 text-right">{m.cantidad}</span>
                  </li>
                ))}
              </ul>
              {p.perdidasPorEtapa.length > 0 && (
                <p className="mt-4 text-xs text-texto-2">
                  Se pierden en:{' '}
                  {p.perdidasPorEtapa.map((e, n) => (
                    <span key={e.nombre}>
                      {n ? ', ' : ''}
                      {e.nombre} ({e.cantidad})
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-texto-3">No hay oportunidades perdidas en el período.</p>
          )}
        </Panel>
        {p.origenes.length > 0 && (
          <Panel className="p-5 lg:col-span-2">
            <h2 className="mb-4 font-semibold">De dónde vienen las ventas</h2>
            <div className="flex flex-wrap gap-3">
              {p.origenes.map((o) => (
                <div key={o.nombre} className="min-w-40 rounded-xl bg-superficie-2 px-4 py-3">
                  <p className="text-sm font-medium">{o.nombre}</p>
                  <p className="cifras mt-1 font-semibold">{pesosServidor(o.ganado)}</p>
                  <p className="text-xs text-texto-3">
                    {o.ganadas} ganadas · {o.perdidas} perdidas
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </>
  )
}
