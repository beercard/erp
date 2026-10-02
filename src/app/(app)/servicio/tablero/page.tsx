import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { sumarDias } from '@/modulos/servicio/agenda'
import { indicadores, nps } from '@/modulos/servicio/tablero'

import { paginaContratos } from '../../contratos/modulo'

export const metadata: Metadata = { title: 'Tablero de servicio técnico' }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null)
const horas = (h: number | null) =>
  h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`
const fecha = (d: string) => d.split('-').reverse().join('/')

function periodos(hoy: string) {
  const [a, m] = hoy.split('-').map(Number)
  const inicioMes = `${hoy.slice(0, 7)}-01`
  const mesAnterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
  return {
    mes: { texto: 'Este mes', desde: inicioMes, hasta: hoy },
    anterior: { texto: 'Mes anterior', desde: `${mesAnterior}-01`, hasta: sumarDias(inicioMes, -1) },
    '30': { texto: 'Últimos 30 días', desde: sumarDias(hoy, -29), hasta: hoy },
    '90': { texto: 'Últimos 90 días', desde: sumarDias(hoy, -89), hasta: hoy },
    anio: { texto: 'Este año', desde: `${a}-01-01`, hasta: hoy },
  }
}

/** Medidor: el relleno lleva la severidad (y el texto la dice, no solo el color). */
function Medidor({ valor, meta = 90 }: { valor: number | null; meta?: number }) {
  if (valor === null) return <span className="text-texto-3">—</span>
  const tono = valor >= meta ? 'bg-acento' : valor >= meta - 15 ? 'bg-aviso' : 'bg-error'
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-superficie-2" aria-hidden>
        <span className={`block h-full rounded-full ${tono}`} style={{ width: `${Math.max(2, valor)}%` }} />
      </span>
      <span className="cifras w-10 shrink-0 text-right">{valor}%</span>
    </span>
  )
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  children,
}: {
  titulo: string
  valor: string
  detalle?: string
  children?: React.ReactNode
}) {
  return (
    <Panel className="flex flex-col gap-1 p-4">
      <span className="text-xs text-texto-2">{titulo}</span>
      <span className="text-2xl font-semibold">{valor}</span>
      {children}
      {detalle && <span className="text-xs text-texto-3">{detalle}</span>}
    </Panel>
  )
}

export default async function Tablero({ searchParams }: PageProps<'/servicio/tablero'>) {
  const sesion = await paginaContratos('servicio.ver')
  const q = (await searchParams) as { periodo?: string; desde?: string; hasta?: string }
  const hoy = hoyArgentina()
  const opciones = periodos(hoy)
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)
  const elegido = opciones[(q.periodo ?? 'mes') as keyof typeof opciones]
  const desde = valida(q.desde) ?? elegido?.desde ?? opciones.mes.desde
  const hasta = valida(q.hasta) ?? elegido?.hasta ?? hoy
  const {
    resumen: r,
    porTecnico,
    porTipo,
    reincidentes,
    materiales,
  } = await conEmpresa(sesion.empresa.id, (tx) => indicadores(tx, desde, hasta))
  const valorNps = nps(r.encuestas)
  const slaResp = pct(r.slaRespuesta.cumplidas, r.slaRespuesta.total)
  const slaResol = pct(r.slaResolucion.cumplidas, r.slaResolucion.total)

  return (
    <>
      <EncabezadoPagina titulo="Tablero" bajada={`Servicio técnico del ${fecha(desde)} al ${fecha(hasta)}`} />
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Período">
          {Object.entries(opciones).map(([k, p]) => (
            <Link
              key={k}
              href={`/servicio/tablero?periodo=${k}`}
              aria-current={!q.desde && (q.periodo ?? 'mes') === k ? 'page' : undefined}
              className="h-9 rounded-md border border-borde px-3 text-sm leading-9 hover:bg-superficie-2 aria-[current=page]:border-acento aria-[current=page]:bg-acento-suave"
            >
              {p.texto}
            </Link>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-texto-2">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-texto-2">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
          />
        </label>
        <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Ver</button>
      </form>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <Panel className="flex flex-col justify-center gap-2 p-5">
          <span className="text-sm text-texto-2">Órdenes cerradas</span>
          <span className="text-5xl font-semibold">{r.cerradas.toLocaleString('es-AR')}</span>
          <span className="text-sm text-texto-2">
            {pct(r.ok, r.cerradas) ?? 0}% OK · {r.desvio} con desvío · {r.noCumplida} no cumplidas
          </span>
          <span className="text-xs text-texto-3">
            {r.creadas} abiertas en el período · {r.activas} activas hoy
            {r.vencidas > 0 && (
              <>
                {' · '}
                <Link href="/servicio?estado=vencida" className="text-error hover:underline">
                  {r.vencidas} vencidas
                </Link>
              </>
            )}
          </span>
        </Panel>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Tarjeta
            titulo="Resueltas en la 1ª visita"
            valor={pct(r.primeraVisita, r.ok) === null ? '—' : `${pct(r.primeraVisita, r.ok)}%`}
            detalle="De las cerradas OK, con una sola visita"
          />
          <Tarjeta
            titulo="Llegada promedio"
            valor={horas(r.respuestaHoras)}
            detalle="Desde que se abre hasta que llega el técnico"
          />
          <Tarjeta titulo="Resolución promedio" valor={horas(r.resolucionHoras)} detalle="Desde que se abre hasta el informe" />
          <Tarjeta
            titulo="Cierre técnico = supervisor"
            valor={
              pct(r.coincidencia.iguales, r.coincidencia.total) === null
                ? '—'
                : `${pct(r.coincidencia.iguales, r.coincidencia.total)}%`
            }
            detalle={`${r.coincidencia.total} informes`}
          />
          <Tarjeta
            titulo="SLA de llegada"
            valor={slaResp === null ? '—' : `${slaResp}%`}
            detalle={`${r.slaRespuesta.cumplidas} de ${r.slaRespuesta.total} a tiempo`}
          >
            <Medidor valor={slaResp} />
          </Tarjeta>
          <Tarjeta
            titulo="SLA de resolución"
            valor={slaResol === null ? '—' : `${slaResol}%`}
            detalle={`${r.slaResolucion.cumplidas} de ${r.slaResolucion.total} a tiempo`}
          >
            <Medidor valor={slaResol} />
          </Tarjeta>
          <Tarjeta
            titulo="Satisfacción"
            valor={
              r.encuestas.puntaje === null
                ? '—'
                : `${r.encuestas.puntaje.toLocaleString('es-AR', { maximumFractionDigits: 1 })} / 5`
            }
            detalle={`${r.encuestas.respondidas} de ${r.encuestas.enviadas} encuestas respondidas`}
          />
          <Tarjeta
            titulo="NPS"
            valor={valorNps === null ? '—' : String(valorNps)}
            detalle="% que recomienda (9-10) menos % que no (0-6)"
          />
        </div>
      </div>

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Por técnico</h2>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-borde text-left text-xs text-texto-2">
            <tr>
              <th className="px-4 py-2 font-medium">Técnico</th>
              <th className="px-4 py-2 text-right font-medium">Cerradas</th>
              <th className="w-40 px-4 py-2 font-medium">OK</th>
              <th className="px-4 py-2 text-right font-medium">1ª visita</th>
              <th className="px-4 py-2 text-right font-medium">Llegada prom.</th>
              <th className="px-4 py-2 text-right font-medium">Horas en cliente</th>
              <th className="px-4 py-2 text-right font-medium">Cierre coincide</th>
              <th className="px-4 py-2 text-right font-medium">Satisfacción</th>
              <th className="px-4 py-2 text-right font-medium">Por hacer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {porTecnico.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/servicio?tecnico=${t.id}&estado=cerradas`} className="hover:text-acento">
                    {t.nombre}
                  </Link>
                </td>
                <td className="cifras px-4 py-2 text-right">{t.cerradas}</td>
                <td className="px-4 py-2">
                  <Medidor valor={pct(t.ok, t.cerradas)} />
                </td>
                <td className="cifras px-4 py-2 text-right">
                  {pct(t.primeraVisita, t.ok) ?? '—'}
                  {pct(t.primeraVisita, t.ok) !== null && '%'}
                </td>
                <td className="cifras px-4 py-2 text-right">{horas(t.respuestaHoras)}</td>
                <td className="cifras px-4 py-2 text-right">{t.horas.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</td>
                <td className="cifras px-4 py-2 text-right">
                  {pct(t.coincidencia.iguales, t.coincidencia.total) ?? '—'}
                  {pct(t.coincidencia.iguales, t.coincidencia.total) !== null && '%'}
                </td>
                <td className="cifras px-4 py-2 text-right">
                  {t.puntaje === null ? '—' : t.puntaje.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                </td>
                <td className="cifras px-4 py-2 text-right">{t.pendientes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Por tipo de orden</h2>
          {porTipo.length === 0 ? (
            <p className="p-4 text-sm text-texto-2">Sin órdenes cerradas en el período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-borde text-left text-xs text-texto-2">
                <tr>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 text-right font-medium">Cerradas</th>
                  <th className="px-4 py-2 text-right font-medium">OK</th>
                  <th className="px-4 py-2 text-right font-medium">Duración real / estimada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: t.color ?? '#94a3b8' }} />
                        {t.tipo}
                      </span>
                    </td>
                    <td className="cifras px-4 py-2 text-right">{t.cerradas}</td>
                    <td className="cifras px-4 py-2 text-right">{pct(t.ok, t.cerradas)}%</td>
                    <td className="cifras px-4 py-2 text-right">
                      {t.real === null ? '—' : `${Math.round(t.real)} min`} /{' '}
                      {t.estimada === null ? '—' : `${Math.round(t.estimada)} min`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Equipos que reinciden</h2>
          {reincidentes.length === 0 ? (
            <p className="p-4 text-sm text-texto-2">Ningún equipo con más de un correctivo en el período.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-borde">
                {reincidentes.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2">
                      <Link href={`/equipos/${e.id}`} className="cifras font-medium hover:text-acento">
                        {e.serie}
                      </Link>{' '}
                      {e.modelo}
                      <span className="block text-xs text-texto-3">{e.cliente}</span>
                    </td>
                    <td className="cifras px-4 py-2 text-right">{e.correctivos} correctivos</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel className="overflow-x-auto lg:col-span-2">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Repuestos e insumos más usados</h2>
          {materiales.length === 0 ? (
            <p className="p-4 text-sm text-texto-2">Sin consumos en el período.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-borde">
                {materiales.map((m) => (
                  <tr key={m.descripcion}>
                    <td className="px-4 py-2">{m.descripcion}</td>
                    <td className="cifras px-4 py-2 text-right">{m.cantidad.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-2 text-right text-xs text-texto-3">en {m.ordenes} órdenes</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  )
}
