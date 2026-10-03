import { ChevronLeft, ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { obtenerCanal } from '@/modulos/tiendas/canales'
import { NOMBRES_CANAL, type TipoCanal } from '@/modulos/tiendas/tipos'

import { desconectarAccion } from '../acciones'
import { Configuracion, Sincronizar, Vincular } from '../Formularios'

export const metadata: Metadata = { title: 'Tienda online' }

const UUID = /^[0-9a-f-]{36}$/i
const pesos = (v: string | null) =>
  v === null ? '—' : Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
const TONO_PEDIDO = { importado: 'ok', error: 'error', ignorado: 'neutro' } as const

export default async function Canal({ params, searchParams }: PageProps<'/tiendas/[id]'>) {
  const sesion = await exigirPermiso('tienda.ver')
  const { id } = await params
  const { conectado, ver, error } = await searchParams
  if (!UUID.test(id)) notFound()
  const datos = await conEmpresa(sesion, (tx) => obtenerCanal(tx, id))
  if (!datos) notFound()
  const { canal, publicaciones, pedidos, listas, depositos, cuentas, puntosVenta } = datos
  const puede = tienePermiso(sesion.permisos, 'tienda.configurar')
  const sinVincular = publicaciones.filter((p) => p.activa && !p.articuloId)
  const lista = ver === 'todas' ? publicaciones.filter((p) => p.activa) : sinVincular
  const activo = canal.estado !== 'desconectado'

  return (
    <>
      <Link href="/tiendas" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Tiendas online
      </Link>
      <EncabezadoPagina
        titulo={canal.nombre}
        bajada={`${NOMBRES_CANAL[canal.tipo as TipoCanal]} · ${canal.cuenta}`}
        acciones={puede && activo ? <Sincronizar id={id} /> : undefined}
      />
      <div className="mb-4 flex flex-col gap-2">
        {conectado && (
          <Aviso tono="ok">
            Conectada. Estamos trayendo las publicaciones: en un minuto aparecen acá. Las que tengan como SKU el código de un
            artículo quedan vinculadas solas.
          </Aviso>
        )}
        {typeof error === 'string' && <Aviso>{error}</Aviso>}
        {canal.estado === 'error' && (
          <Aviso>
            La plataforma rechazó la conexión (se venció o se revocó el permiso). Volvé a conectarla desde Tiendas online.
          </Aviso>
        )}
        {canal.estado === 'desconectado' && <Aviso tono="info">Desconectada: queda el historial de pedidos.</Aviso>}
        {canal.ultimoError && canal.estado === 'conectado' && <Aviso tono="aviso">Último problema: {canal.ultimoError}</Aviso>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
              <h2 className="text-sm font-semibold">
                Publicaciones {sinVincular.length > 0 && <Chip tono="aviso">{sinVincular.length} sin vincular</Chip>}
              </h2>
              <span className="flex gap-3 text-xs">
                <Link href={`/tiendas/${id}`} className={ver !== 'todas' ? 'font-semibold text-acento' : 'text-texto-2'}>
                  Sin vincular
                </Link>
                <Link
                  href={`/tiendas/${id}?ver=todas`}
                  className={ver === 'todas' ? 'font-semibold text-acento' : 'text-texto-2'}
                >
                  Todas
                </Link>
              </span>
            </div>
            {lista.length === 0 ? (
              <p className="px-4 py-6 text-sm text-texto-2">
                {ver === 'todas'
                  ? 'Todavía no hay publicaciones. Tocá "Sincronizar ahora".'
                  : 'Todas las publicaciones están vinculadas a un artículo.'}
              </p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                    <th className="px-4 py-2 font-medium">Publicación</th>
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 text-right font-medium">Stock / precio enviados</th>
                    <th className="px-4 py-2 font-medium">Artículo del ERP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {lista.slice(0, 300).map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-1">
                          {p.titulo}
                          {p.enlace && (
                            <a
                              href={p.enlace}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Ver en la tienda"
                              className="text-texto-3"
                            >
                              <ExternalLink aria-hidden className="size-3.5" />
                            </a>
                          )}
                        </span>
                        {p.error && <span className="block text-xs text-error">{p.error}</span>}
                      </td>
                      <td className="cifras px-4 py-2 text-xs">{p.sku ?? '—'}</td>
                      <td className="cifras px-4 py-2 text-right text-xs">
                        {p.stockEnviado === null ? '—' : Number(p.stockEnviado)} · {pesos(p.precioEnviado)}
                      </td>
                      <td className="px-4 py-2">
                        {puede ? (
                          <Vincular canalId={id} id={p.id} codigo={p.articuloCodigo} />
                        ) : p.articuloId ? (
                          <Chip tono="ok">Vinculada</Chip>
                        ) : (
                          <Chip tono="aviso">Sin vincular</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Pedidos que llegaron</h2>
            {pedidos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-texto-2">Todavía no llegó ningún pedido pagado.</p>
            ) : (
              <table className="w-full min-w-[600px] text-sm">
                <tbody className="divide-y divide-borde">
                  {pedidos.map((p) => (
                    <tr key={p.id}>
                      <td className="cifras px-4 py-2 text-xs text-texto-2">
                        {p.fecha?.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2">
                        <span className="font-medium">#{p.numero}</span> · {p.comprador}
                        {p.detalle && <span className="block text-xs text-texto-2">{p.detalle}</span>}
                      </td>
                      <td className="cifras px-4 py-2 text-right">{pesos(p.total)}</td>
                      <td className="px-4 py-2 text-right">
                        {p.pedidoId ? (
                          <Link href={`/pedidos/${p.pedidoId}`} className="text-xs font-medium text-acento hover:underline">
                            Ver pedido
                          </Link>
                        ) : (
                          <Chip tono={TONO_PEDIDO[p.estado as keyof typeof TONO_PEDIDO]}>{p.estado}</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {puede && activo && (
            <Panel className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Qué se sincroniza</h2>
              <Configuracion
                id={id}
                canal={canal}
                listas={listas.map((l) => ({ id: l.id, nombre: l.nombre }))}
                depositos={depositos}
                cuentas={cuentas}
                puntosVenta={puntosVenta}
              />
            </Panel>
          )}
          <Panel className="p-4 text-sm text-texto-2">
            <p>
              Cada 15 minutos se traen los pedidos y se manda lo que cambió; los pedidos pagados también avisan al momento. Las
              ventas entran como pedidos: el remito descuenta el stock y la factura se hace como siempre.
            </p>
            {puede && activo && (
              <form action={desconectarAccion.bind(null, id)} className="mt-4">
                <BotonConfirmar
                  variante="peligro"
                  pregunta="¿Desconectar la tienda? Se borran las claves y deja de sincronizar; el historial queda."
                >
                  Desconectar
                </BotonConfirmar>
              </form>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
