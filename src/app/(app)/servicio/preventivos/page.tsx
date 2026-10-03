import { RefreshCw } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarReglas, siguienteFecha } from '@/modulos/servicio/preventivo'
import { listarTecnicos } from '@/modulos/servicio/servicio'
import { listarTipos } from '@/modulos/servicio/tiposOrden'

import { paginaContratos } from '../../contratos/modulo'
import { generarPreventivosAccion, pausarReglaAccion } from '../acciones'
import { FormularioRegla } from './FormularioRegla'

export const metadata: Metadata = { title: 'Mantenimiento preventivo' }

export default async function Preventivos({ searchParams }: PageProps<'/servicio/preventivos'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { generadas, error } = (await searchParams) as { generadas?: string; error?: string }
  const { reglas, tipos, tecnicos } = await conEmpresa(sesion, async (tx) => ({
    reglas: await listarReglas(tx),
    tipos: await listarTipos(tx, true),
    tecnicos: await listarTecnicos(tx),
  }))
  const cargar = tienePermiso(sesion.permisos, 'servicio.cargar')
  const hoy = hoyArgentina()
  const proxima = (r: (typeof reglas)[number]) =>
    r.frecuencia === 'copias'
      ? `a las ${((r.contadorBase ?? 0) + r.cada).toLocaleString('es-AR')} copias`
      : siguienteFecha(r.desde, r.frecuencia as 'semanal' | 'mensual', r.cada, r.ultimaFecha)
          .split('-')
          .reverse()
          .join('/')
  const cada = (r: (typeof reglas)[number]) =>
    r.frecuencia === 'copias'
      ? `Cada ${r.cada.toLocaleString('es-AR')} copias`
      : `Cada ${r.cada === 1 ? '' : `${r.cada} `}${r.frecuencia === 'semanal' ? (r.cada === 1 ? 'semana' : 'semanas') : r.cada === 1 ? 'mes' : 'meses'}`

  return (
    <>
      <EncabezadoPagina
        titulo="Mantenimiento preventivo"
        bajada="Las órdenes se generan solas: por tiempo, hasta 30 días antes; por copias, cuando las lecturas del equipo llegan al número."
        acciones={
          cargar && (
            <form action={generarPreventivosAccion}>
              <Boton type="submit">
                <RefreshCw aria-hidden className="size-4" /> Generar ahora
              </Boton>
            </form>
          )
        }
      />
      {generadas && (
        <div className="mb-4">
          <Aviso tono="ok">
            {generadas === '0' ? 'No había órdenes nuevas para generar.' : `Se generaron ${generadas} órdenes.`}
          </Aviso>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {cargar &&
        (tipos.length ? (
          <Panel className="mb-4 p-4">
            <h2 className="mb-3 text-sm font-semibold">Nueva regla</h2>
            <FormularioRegla
              hoy={hoy}
              tipos={tipos.map((t) => ({ valor: t.id, texto: t.nombre }))}
              tecnicos={tecnicos.map((t) => ({ valor: t.id, texto: t.nombre }))}
            />
          </Panel>
        ) : (
          <Panel className="mb-4 p-4 text-sm text-texto-2">
            Primero cargá los{' '}
            <Link href="/servicio/tipos" className="text-acento hover:underline">
              tipos de orden
            </Link>
            .
          </Panel>
        ))}
      {reglas.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">No hay reglas de preventivo.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente y equipo</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Frecuencia</th>
                <th className="px-4 py-2 font-medium">Próxima</th>
                <th className="px-4 py-2 font-medium">Técnico</th>
                {cargar && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {reglas.map((r) => (
                <tr key={r.id} className={r.activa ? '' : 'text-texto-3'}>
                  <td className="px-4 py-2">
                    {r.cliente}
                    {r.serie && (
                      <span className="block text-xs text-texto-3">
                        <span className="cifras">{r.serie}</span> {r.modelo}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{r.tipoOrden}</td>
                  <td className="px-4 py-2">{cada(r)}</td>
                  <td className="px-4 py-2">
                    {r.activa ? proxima(r) : <Chip>En pausa</Chip>}
                    {r.hora && r.activa && r.frecuencia !== 'copias' && <span className="text-texto-3"> {r.hora}</span>}
                  </td>
                  <td className="px-4 py-2">{r.tecnico ?? <span className="text-texto-3">—</span>}</td>
                  {cargar && (
                    <td className="px-4 py-2 text-right">
                      <form action={pausarReglaAccion.bind(null, r.id, !r.activa)}>
                        <BotonConfirmar
                          pregunta={
                            r.activa ? '¿Pausar la regla? No se generan más órdenes hasta reanudarla.' : '¿Reanudar la regla?'
                          }
                          className="h-7 px-2 text-xs"
                        >
                          {r.activa ? 'Pausar' : 'Reanudar'}
                        </BotonConfirmar>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
