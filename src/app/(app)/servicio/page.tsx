import { CalendarDays, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { after } from 'next/server'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { enviarPendientes } from '@/modulos/comunicaciones/correo'
import { ponerAlDia } from '@/modulos/servicio/avisos'
import { etiquetasDeOrdenes, listarEtiquetas } from '@/modulos/servicio/etiquetas'
import { LOTE_MAXIMO, listarOrdenes, listarTecnicos, marcarVencidas, resumenOrdenes } from '@/modulos/servicio/servicio'
import { ESTADOS_ORDEN, estaAbierta, TIPOS_ORDEN } from '@/modulos/servicio/tipos'

import { paginaContratos } from '../contratos/modulo'
import { ChipEstado, ChipSla } from './ChipEstado'
import { CierreEnLote } from './CierreEnLote'
import { ChipEtiqueta } from './EtiquetasOrden'

export const metadata: Metadata = { title: 'Servicio técnico' }

/** Días entre dos fechas AAAA-MM-DD. */
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)

export default async function Servicio({ searchParams }: PageProps<'/servicio'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { q, estado, tecnico, etiqueta } = (await searchParams) as {
    q?: string
    estado?: string
    tecnico?: string
    etiqueta?: string
  }
  const { lista, resumen, tecnicos, etiquetas, deOrdenes } = await conEmpresa(sesion.empresa.id, async (tx) => {
    // Al entrar se ponen al día los vencimientos y los preventivos (no hay procesos aparte).
    if (tienePermiso(sesion.permisos, 'servicio.cargar')) await ponerAlDia(tx, sesion.usuario.id)
    else await marcarVencidas(tx)
    const lista = await listarOrdenes(tx, {
      q,
      estado: estado ?? 'activas',
      limite: estado === 'informe' ? LOTE_MAXIMO : undefined,
      tecnicoId: tecnico || undefined,
      incluirAcompanante: true,
      etiquetaId: etiqueta && /^[0-9a-f-]{36}$/i.test(etiqueta) ? etiqueta : undefined,
    })
    return {
      lista,
      resumen: await resumenOrdenes(tx),
      tecnicos: await listarTecnicos(tx),
      etiquetas: await listarEtiquetas(tx, true),
      deOrdenes: await etiquetasDeOrdenes(
        tx,
        lista.map((o) => o.id),
      ),
    }
  })
  const hoy = hoyArgentina()
  after(() => enviarPendientes(sesion.empresa.id).catch(() => undefined))

  return (
    <>
      <EncabezadoPagina
        titulo="Servicio técnico"
        bajada={
          <>
            {resumen.abiertas} activas
            {resumen.sinAsignar > 0 && ` · ${resumen.sinAsignar} sin técnico`}
            {resumen.urgentes > 0 && ` · ${resumen.urgentes} urgentes`}
            {resumen.paraRevisar > 0 && (
              <>
                {' · '}
                <Link href="/servicio?estado=informe" className="text-acento hover:underline">
                  {resumen.paraRevisar} para revisar
                </Link>
              </>
            )}
            {resumen.vencidas > 0 && (
              <>
                {' · '}
                <Link href="/servicio?estado=vencida" className="text-error hover:underline">
                  {resumen.vencidas} vencidas
                </Link>
              </>
            )}
            {resumen.porFacturar > 0 && (
              <>
                {' · '}
                <Link href="/servicio?estado=cerradas" className="text-acento hover:underline">
                  {resumen.porFacturar} con cargo para facturar
                </Link>
              </>
            )}
          </>
        }
        acciones={
          <>
            <BotonEnlace href="/servicio/calendario">
              <CalendarDays aria-hidden className="size-4" /> Calendario
            </BotonEnlace>
            {tienePermiso(sesion.permisos, 'servicio.cargar') && (
              <BotonEnlace href="/servicio/nueva" variante="primario">
                <Plus aria-hidden className="size-4" /> Nueva orden
              </BotonEnlace>
            )}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cliente, serie, falla o número"
          className="h-9 min-w-64 flex-1 rounded-md border border-borde bg-superficie px-2.5 text-sm focus:border-acento"
        />
        <select
          name="estado"
          defaultValue={estado ?? 'activas'}
          className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
        >
          <option value="activas">Activas (sin cerrar)</option>
          <option value="cerradas">Cerradas</option>
          {Object.entries(ESTADOS_ORDEN).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
          <option value="todas">Todas</option>
        </select>
        {tecnicos.length > 0 && (
          <select
            name="tecnico"
            defaultValue={tecnico ?? ''}
            className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
          >
            <option value="">Todos los técnicos</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        )}
        {etiquetas.length > 0 && (
          <select
            name="etiqueta"
            defaultValue={etiqueta ?? ''}
            aria-label="Etiqueta"
            className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
          >
            <option value="">Todas las etiquetas</option>
            {etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        )}
        <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Buscar</button>
      </form>
      {estado === 'informe' && lista.length > 0 && tienePermiso(sesion.permisos, 'servicio.cargar') ? (
        <CierreEnLote
          total={resumen.paraRevisar}
          ordenes={lista.map((o) => ({
            id: o.id,
            numero: o.numero,
            cliente: o.cliente,
            tecnico: o.tecnico,
            tipoOrden: o.tipoOrden,
            falla: o.falla,
            cierreTecnico: o.cierreTecnico,
            informada: o.informada,
          }))}
        />
      ) : lista.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">
          {q || (estado && estado !== 'activas') ? 'No hay órdenes que coincidan.' : 'No hay órdenes activas.'}
          {tecnicos.length === 0 && tienePermiso(sesion.permisos, 'maestros.configuracion') && (
            <>
              {' '}
              Para asignarlas, cargá los técnicos en{' '}
              <Link href="/configuracion/tecnicos" className="text-acento hover:underline">
                Configuración › Técnicos
              </Link>
              .
            </>
          )}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">N°</th>
                <th className="px-4 py-2 font-medium">Cliente y equipo</th>
                <th className="px-4 py-2 font-medium">Pedido</th>
                <th className="px-4 py-2 font-medium">Técnico</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((o) => {
                const abierta = estaAbierta(o.estado)
                const demora = abierta ? dias(o.fecha, hoy) : null
                return (
                  <tr key={o.id} className="group align-top hover:bg-superficie-2">
                    <td className="cifras px-4 py-2">
                      <Link href={`/servicio/${o.id}`} className="font-medium group-hover:text-acento">
                        {o.numero}
                      </Link>
                      <span className="block text-xs text-texto-3">{o.fecha.split('-').reverse().join('/')}</span>
                    </td>
                    <td className="px-4 py-2">
                      {o.cliente}
                      {o.serie && (
                        <span className="block text-xs text-texto-3">
                          <span className="cifras">{o.serie}</span>
                          {o.modelo ? ` · ${o.modelo}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="max-w-80 px-4 py-2">
                      <span className="line-clamp-2">{o.falla}</span>
                      <span className="flex items-center gap-1.5 text-xs text-texto-3">
                        {o.color && <span aria-hidden className="size-2 rounded-full" style={{ background: o.color }} />}
                        {o.tipoOrden ?? TIPOS_ORDEN[o.tipo as keyof typeof TIPOS_ORDEN]}
                      </span>
                      {!!deOrdenes.get(o.id)?.length && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {deOrdenes.get(o.id)!.map((e) => (
                            <ChipEtiqueta key={e.id} e={e} />
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {o.tecnico ?? <span className="text-texto-3">Sin técnico</span>}
                      {o.programada && abierta && (
                        <span className={`block text-xs ${o.programada < hoy ? 'text-error' : 'text-texto-3'}`}>
                          Visita {o.programada === hoy ? 'hoy' : o.programada.split('-').reverse().join('/')}
                          {o.hora ? ` ${o.hora}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {o.prioridad === 'urgente' && abierta && <Chip tono="error">Urgente</Chip>}
                        <ChipEstado
                          estado={o.estado}
                          cobertura={o.cobertura}
                          facturada={!!o.comprobanteId}
                          migrada={o.origen === 'persat' && !o.cerradaPor}
                        />
                        <ChipSla o={o} compacto />
                      </div>
                      {demora !== null && demora > 0 && (
                        <span className={`text-xs ${demora > 3 ? 'text-aviso' : 'text-texto-3'}`}>
                          hace {demora} {demora === 1 ? 'día' : 'días'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
