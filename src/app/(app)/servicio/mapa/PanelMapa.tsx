'use client'

import { Crosshair, ExternalLink, MapPin, Navigation, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

import { Mapa, type Marcador, type Punto, type Ruta } from '@/components/servicio/Mapa'
import { Aviso, Boton, Panel } from '@/components/ui'
import type { datosMapa } from '@/modulos/servicio/mapa'

import { ubicarAccion, ubicarPendientesAccion } from '../acciones'

type Datos = Awaited<ReturnType<typeof datosMapa>>

/** Colores de los técnicos, siempre en el mismo orden (el técnico conserva su color). */
const COLORES = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#dc2626']
const SIN_TECNICO = '#64748b'

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

const haceCuanto = (d: Date) => {
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60_000)
  return min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`
}

export function PanelMapa({
  fecha,
  hoy,
  puedeUbicar,
  ordenes,
  tecnicos,
  rutas,
}: {
  fecha: string
  hoy: boolean
  puedeUbicar: boolean
  ordenes: Datos['ordenes']
  tecnicos: Datos['tecnicos']
  rutas: Datos['rutas']
}) {
  const [marcando, setMarcando] = useState<{ que: 'orden' | 'tecnico'; id: string; texto: string } | null>(null)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)
  const [trabajando, iniciar] = useTransition()

  const color = useMemo(() => new Map(tecnicos.map((t, i) => [t.id, COLORES[i % COLORES.length]])), [tecnicos])
  const delDia = ordenes.filter((o) => o.programada === fecha)
  const esperan = ordenes.filter((o) => o.programada !== fecha)
  const sinUbicacion = ordenes.filter((o) => !o.punto)

  const marcadores: Marcador[] = [
    ...ordenes
      .filter((o) => o.punto)
      .map((o) => {
        const hecha = !!o.informada || o.estado.startsWith('cerrada')
        const tecnico = tecnicos.find((t) => t.id === o.tecnicoId)
        return {
          id: o.id,
          punto: o.punto!,
          clase: 'orden' as const,
          color: o.tecnicoId && o.programada === fecha ? color.get(o.tecnicoId)! : SIN_TECNICO,
          hueco: !o.tecnicoId || o.programada !== fecha,
          apagado: hecha,
          globo: [
            `N° ${o.numero} · ${o.cliente}`,
            o.tipo ?? 'Servicio técnico',
            o.domicilio ?? '',
            o.programada === fecha
              ? `${o.hora ? `${o.hora.slice(0, 5)} · ` : ''}${tecnico?.nombre ?? 'Sin técnico'}${hecha ? ' · hecha' : o.llegada ? ' · en el lugar' : ''}`
              : 'Espera día y técnico',
          ].filter(Boolean),
          enlace: { href: `/servicio/${o.id}`, texto: 'Abrir la orden' },
        }
      }),
    ...tecnicos.flatMap((t) => {
      const lista: Marcador[] = []
      if (t.partida)
        lista.push({
          id: `partida-${t.id}`,
          punto: t.partida,
          clase: 'partida',
          color: color.get(t.id)!,
          globo: [`Partida de ${t.nombre}`, t.partidaTexto ?? ''].filter(Boolean),
        })
      if (hoy && t.posicion)
        lista.push({
          id: `tecnico-${t.id}`,
          punto: t.posicion,
          clase: 'tecnico',
          color: color.get(t.id)!,
          texto: iniciales(t.nombre),
          globo: [
            t.nombre,
            `Última posición ${haceCuanto(t.posicion.momento)}`,
            t.posicion.precision ? `Precisión: ${t.posicion.precision} m` : '',
          ].filter(Boolean),
        })
      return lista
    }),
  ]

  const lineas: Ruta[] = rutas.map((r) => ({
    id: r.tecnico.id,
    color: color.get(r.tecnico.id) ?? SIN_TECNICO,
    puntos: [...(r.tecnico.punto ? [r.tecnico.punto] : []), ...r.paradas.filter((p) => p.punto).map((p) => p.punto!)],
  }))

  const marcar = (p: Punto) => {
    if (!marcando) return
    const m = marcando
    iniciar(async () => {
      const r = await ubicarAccion(m.que, m.id, p)
      setMensaje(r.ok ? { tono: 'ok', texto: `Ubicación guardada: ${m.texto}.` } : { tono: 'error', texto: r.error })
      setMarcando(null)
    })
  }

  const buscar = () =>
    iniciar(async () => {
      const r = await ubicarPendientesAccion()
      if (!r.ok) return setMensaje({ tono: 'error', texto: r.error })
      setMensaje({
        tono: r.ubicadas ? 'ok' : 'error',
        texto:
          `Ubicadas: ${r.ubicadas}.` +
          (r.sinResultado ? ` Sin resultado: ${r.sinResultado} (marcalas en el mapa).` : '') +
          (r.sinDomicilio ? ` Sin domicilio cargado: ${r.sinDomicilio}.` : ''),
      })
    })

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="flex min-w-0 flex-col gap-3">
        {marcando && (
          <Aviso tono="aviso">
            Hacé clic en el mapa donde está {marcando.texto}.{' '}
            <button type="button" onClick={() => setMarcando(null)} className="font-medium underline">
              Cancelar
            </button>
          </Aviso>
        )}
        {mensaje && <Aviso tono={mensaje.tono === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
        <Mapa
          marcadores={marcadores}
          rutas={lineas}
          alHacerClic={marcando && !trabajando ? marcar : undefined}
          seleccionado={seleccionado}
          className="h-[65vh] min-h-96"
        />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-2">
          {tecnicos.map((t) => (
            <li key={t.id} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: color.get(t.id) }} />
              {t.nombre}
              {hoy && t.posicion && <span className="text-texto-3">({haceCuanto(t.posicion.momento)})</span>}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full border-2" style={{ borderColor: SIN_TECNICO }} />
            Espera día o técnico
          </li>
        </ul>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {rutas.length === 0 && <Panel className="p-4 text-sm text-texto-2">No hay visitas programadas para este día.</Panel>}
        {rutas.map((r) => (
          <Panel key={r.tecnico.id}>
            <div className="flex items-start justify-between gap-2 border-b border-borde px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: color.get(r.tecnico.id) }} />
                  {r.tecnico.nombre}
                </h2>
                <p className="text-xs text-texto-2">
                  {r.paradas.length} {r.paradas.length === 1 ? 'visita' : 'visitas'}
                  {r.km > 0 && ` · ${r.km.toLocaleString('es-AR')} km · ${r.minutos} min de viaje`}
                </p>
              </div>
              {r.enlace && (
                <a
                  href={r.enlace}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1 text-xs text-acento hover:underline"
                >
                  <Navigation aria-hidden className="size-3.5" /> Google Maps
                </a>
              )}
            </div>
            {!r.tecnico.punto && (
              <p className="border-b border-borde px-4 py-2 text-xs text-texto-2">
                Sin punto de partida: el recorrido arranca en la primera visita.
                {puedeUbicar && (
                  <button
                    type="button"
                    onClick={() => setMarcando({ que: 'tecnico', id: r.tecnico.id, texto: `la partida de ${r.tecnico.nombre}` })}
                    className="ml-1 text-acento hover:underline"
                  >
                    Marcarla
                  </button>
                )}
              </p>
            )}
            <ol className="divide-y divide-borde text-sm">
              {r.paradas.map((p, i) => (
                <li key={p.id} className="flex gap-3 px-4 py-2">
                  <span className="cifras mt-0.5 w-5 shrink-0 text-xs text-texto-3">{i + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => p.punto && setSeleccionado(p.id)}
                      className="block w-full truncate text-left font-medium hover:underline"
                    >
                      {p.cliente}
                    </button>
                    <span className="block truncate text-xs text-texto-2">{p.domicilio ?? 'Sin domicilio'}</span>
                    <span className="block text-xs text-texto-3">
                      {p.hora ? p.hora.slice(0, 5) : `≈ ${p.llegaria}`}
                      {p.viajeMinutos !== null && p.viajeMinutos > 0 && ` · ${p.viajeMinutos} min (${p.viajeKm} km)`}
                      {p.informada ? ' · hecha' : p.llegada ? ' · en el lugar' : ''}
                      {!p.punto && ' · sin ubicación'}
                    </span>
                  </span>
                  <Link
                    href={`/servicio/${p.id}`}
                    aria-label={`Abrir la orden ${p.numero}`}
                    className="text-texto-3 hover:text-acento"
                  >
                    <ExternalLink aria-hidden className="size-4" />
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        ))}

        {esperan.length > 0 && (
          <Panel>
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Esperan día y técnico ({esperan.length})</h2>
            <ul className="max-h-64 divide-y divide-borde overflow-auto text-sm">
              {esperan.map((o) => (
                <li key={o.id} className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => o.punto && setSeleccionado(o.id)}
                    className="block w-full truncate text-left font-medium hover:underline"
                  >
                    N° {o.numero} · {o.cliente}
                  </button>
                  <span className="block truncate text-xs text-texto-2">
                    {o.prioridad === 'urgente' ? 'Urgente · ' : ''}
                    {o.domicilio ?? 'Sin domicilio'}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {puedeUbicar && sinUbicacion.length > 0 && (
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
              <h2 className="text-sm font-semibold">Sin ubicación ({sinUbicacion.length})</h2>
              <Boton type="button" onClick={buscar} disabled={trabajando} className="h-8 px-2 text-xs">
                <Search aria-hidden className="size-3.5" /> {trabajando ? 'Buscando…' : 'Buscar los domicilios'}
              </Boton>
            </div>
            <ul className="max-h-64 divide-y divide-borde overflow-auto text-sm">
              {sinUbicacion.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      N° {o.numero} · {o.cliente}
                    </span>
                    <span className="block truncate text-xs text-texto-2">{o.domicilio ?? 'Sin domicilio'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMarcando({ que: 'orden', id: o.id, texto: `la orden ${o.numero}` })}
                    className="flex shrink-0 items-center gap-1 text-xs text-acento hover:underline"
                  >
                    <Crosshair aria-hidden className="size-3.5" /> Marcar
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {delDia.length === 0 && esperan.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-texto-2">
            <MapPin aria-hidden className="size-4" /> Nada para mostrar este día.
          </p>
        )}
      </div>
    </div>
  )
}
