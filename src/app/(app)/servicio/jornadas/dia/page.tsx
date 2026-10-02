import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { tecnicos } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { diaDelTecnico } from '@/modulos/servicio/zonas'

import { paginaContratos } from '../../../contratos/modulo'

export const metadata: Metadata = { title: 'Día del técnico' }

const hora = (d: Date) =>
  d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false })

/** Un día de un técnico: visitas detectadas por GPS (con o sin orden) y salidas de su zona. */
export default async function DiaTecnico({ searchParams }: PageProps<'/servicio/jornadas/dia'>) {
  const sesion = await paginaContratos('servicio.cargar')
  const q = (await searchParams) as { tecnico?: string; fecha?: string }
  if (!q.tecnico || !/^[0-9a-f-]{36}$/i.test(q.tecnico) || !q.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(q.fecha)) notFound()
  const { tecnico, fecha } = { tecnico: q.tecnico, fecha: q.fecha }
  const d = await conEmpresa(sesion.empresa.id, async (tx) => {
    const [t] = await tx.select({ nombre: tecnicos.nombre }).from(tecnicos).where(eq(tecnicos.id, tecnico))
    return t ? { nombre: t.nombre, ...(await diaDelTecnico(tx, tecnico, fecha)) } : null
  })
  if (!d) notFound()
  const sinOrden = d.visitas.filter((v) => !v.ordenes.length).length
  return (
    <>
      <Link href="/servicio/jornadas" className="text-sm text-acento hover:underline">
        ← Jornadas
      </Link>
      <EncabezadoPagina
        titulo={`${d.nombre} · ${fecha.split('-').reverse().join('/')}`}
        bajada={`${d.km.toLocaleString('es-AR')} km según el GPS · ${d.visitas.length} visita${d.visitas.length === 1 ? '' : 's'} detectada${d.visitas.length === 1 ? '' : 's'}${sinOrden ? ` (${sinOrden} sin orden)` : ''} · ${d.ordenes.length} orden${d.ordenes.length === 1 ? '' : 'es'} del día`}
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Visitas detectadas</h2>
          {d.visitas.length ? (
            <table className="w-full min-w-[520px] text-sm">
              <tbody className="divide-y divide-borde">
                {d.visitas.map((v, i) => (
                  <tr key={i}>
                    <td className="cifras px-4 py-2 whitespace-nowrap">
                      {hora(v.desde)}–{hora(v.hasta)}
                    </td>
                    <td className="px-4 py-2">{v.cliente}</td>
                    <td className="cifras px-4 py-2 text-right">{v.minutos} min</td>
                    <td className="px-4 py-2">
                      {v.ordenes.length ? (
                        v.ordenes.map((o) => (
                          <Link key={o.id} href={`/servicio/${o.id}`} className="mr-2 text-acento hover:underline">
                            N° {o.numero}
                          </Link>
                        ))
                      ) : (
                        <Chip tono="aviso">Sin orden</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-3 text-sm text-texto-2">
              {d.posiciones
                ? 'No se quedó 5 minutos o más junto a ningún cliente.'
                : 'El técnico no compartió su ubicación ese día.'}
            </p>
          )}
          <p className="border-t border-borde px-4 py-2 text-xs text-texto-3">
            Una visita es quedarse 5 minutos o más a menos de 150 m de un equipo instalado del cliente o del lugar de una orden.
            Para que un cliente cuente, alguno de sus equipos tiene que estar ubicado en el mapa.
          </p>
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Zona de trabajo</h2>
          {d.alertas.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {d.alertas.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <Chip tono={a.tipo === 'salida' ? 'error' : 'ok'}>{a.tipo === 'salida' ? 'Salió' : 'Volvió'}</Chip>
                  <span className="cifras">{hora(a.momento)}</span>
                  <a
                    href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-acento hover:underline"
                  >
                    dónde
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-texto-2">No salió de sus zonas (o no tiene zonas asignadas).</p>
          )}
        </Panel>
      </div>
    </>
  )
}
