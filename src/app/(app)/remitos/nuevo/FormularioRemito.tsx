'use client'

import { Trash2 } from 'lucide-react'
import { useActionState, useCallback, useState } from 'react'

import { buscarArticulos, buscarClientes, emitirRemitoAccion } from '@/app/(app)/comercial/acciones'
import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton, BotonEnlace, Panel } from '@/components/ui'
import { normalizarNumero } from '@/lib/dinero'

type Opcion = { valor: string; texto: string }
type Cliente = Awaited<ReturnType<typeof buscarClientes>>[number]
type Articulo = Awaited<ReturnType<typeof buscarArticulos>>[number]

export type RenglonRemito = {
  clave: string
  articuloId: string | null
  codigo: string | null
  descripcion: string
  cantidad: string
  /** Lo que queda por entregar si viene de un pedido. */
  pendiente: string | null
  pedidoItemId: string | null
  llevaSerie: boolean
  series: string
}

export function FormularioRemito({
  pedido,
  cliente,
  renglones,
  opciones,
  hoy,
}: {
  pedido: { id: string; numero: number } | null
  cliente: { id: string; razonSocial: string } | null
  renglones: RenglonRemito[]
  opciones: { puntosVenta: Opcion[]; depositos: Opcion[]; transportes: Opcion[]; depositoPedido: string | null }
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(emitirRemitoAccion, undefined)
  const [tercero, setTercero] = useState(cliente)
  const [lineas, setLineas] = useState(renglones)
  const [cab, setCab] = useState({
    puntoVenta: opciones.puntosVenta[0]?.valor ?? '',
    depositoId: opciones.depositoPedido ?? opciones.depositos[0]?.valor ?? '',
    transporteId: '',
    fecha: hoy,
    observaciones: '',
  })
  const buscarArt = useCallback((q: string) => buscarArticulos(q, { listaId: null, moneda: 'PES', cotizacion: '1' }), [])
  const actualizar = (clave: string, cambio: Partial<RenglonRemito>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)))
  const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

  // Con cantidad cero el renglón no se entrega (útil en entregas parciales).
  const aEntregar = lineas.filter((l) => Number(normalizarNumero(l.cantidad || '0')) > 0)
  const remito = {
    ...cab,
    terceroId: tercero?.id ?? '',
    pedidoId: pedido?.id ?? null,
    items: aEntregar.map((l) => ({
      articuloId: l.articuloId,
      descripcion: l.descripcion,
      cantidad: normalizarNumero(l.cantidad),
      pedidoItemId: l.pedidoItemId,
      series: l.series
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    })),
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="remito" value={JSON.stringify(remito)} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Panel className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-texto-2">Cliente</span>
          {tercero ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
              <span className="truncate text-sm font-medium">{tercero.razonSocial}</span>
              {!pedido && (
                <button type="button" onClick={() => setTercero(null)} className="text-xs text-acento hover:underline">
                  Cambiar
                </button>
              )}
            </div>
          ) : (
            <Buscador<Cliente>
              etiqueta="Buscar cliente"
              placeholder="Nombre, código o CUIT"
              autoFocus
              buscar={buscarClientes}
              clave={(c) => c.id}
              render={(c) => c.razonSocial}
              alElegir={(c) => setTercero({ id: c.id, razonSocial: c.razonSocial })}
            />
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Punto de venta</span>
          <select value={cab.puntoVenta} onChange={(e) => setCab({ ...cab, puntoVenta: e.target.value })} className={control}>
            {opciones.puntosVenta.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Fecha</span>
          <input type="date" value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Sale del depósito</span>
          <select value={cab.depositoId} onChange={(e) => setCab({ ...cab, depositoId: e.target.value })} className={control}>
            {opciones.depositos.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Transporte</span>
          <select value={cab.transporteId} onChange={(e) => setCab({ ...cab, transporteId: e.target.value })} className={control}>
            <option value="">Sin transporte</option>
            {opciones.transportes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-texto-2">Observaciones</span>
          <input
            value={cab.observaciones}
            onChange={(e) => setCab({ ...cab, observaciones: e.target.value })}
            className={control}
          />
        </label>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-3 py-2 font-medium">Artículo</th>
              {pedido && <th className="px-3 py-2 text-right font-medium">Pendiente</th>}
              <th className="px-3 py-2 text-right font-medium">Entrega</th>
              <th className="px-3 py-2 font-medium">Números de serie</th>
              {!pedido && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {lineas.map((l, n) => (
              <tr key={l.clave}>
                <td className="px-3 py-2">
                  {l.codigo && <span className="cifras mr-2 text-xs text-texto-3">{l.codigo}</span>}
                  {l.descripcion}
                </td>
                {pedido && (
                  <td className="cifras px-3 py-2 text-right text-texto-2">{Number(l.pendiente).toLocaleString('es-AR')}</td>
                )}
                <td className="px-3 py-2">
                  <input
                    value={l.cantidad}
                    onChange={(e) => actualizar(l.clave, { cantidad: e.target.value })}
                    inputMode="decimal"
                    aria-label={`Cantidad a entregar del renglón ${n + 1}`}
                    className="cifras ml-auto block h-8 w-24 rounded border border-borde bg-superficie px-1.5 text-right focus:border-acento"
                  />
                </td>
                <td className="px-3 py-2">
                  {l.llevaSerie ? (
                    <input
                      value={l.series}
                      onChange={(e) => actualizar(l.clave, { series: e.target.value })}
                      placeholder="Separadas por coma"
                      aria-label={`Números de serie del renglón ${n + 1}`}
                      className="cifras h-8 w-full rounded border border-borde bg-superficie px-1.5 focus:border-acento"
                    />
                  ) : (
                    <span className="text-xs text-texto-3">—</span>
                  )}
                </td>
                {!pedido && (
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                      aria-label={`Quitar el renglón ${n + 1}`}
                      className="grid size-8 place-items-center rounded text-texto-3 hover:bg-error-suave hover:text-error"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!pedido && (
          <div className="border-t border-borde p-3">
            <Buscador<Articulo>
              etiqueta="Agregar artículo"
              placeholder="Agregar artículo: nombre, código o código de barras"
              buscar={buscarArt}
              clave={(a) => a.id}
              render={(a) => (
                <span className="flex justify-between gap-3">
                  <span className="truncate">{a.nombre}</span>
                  <span className="cifras text-xs text-texto-3">
                    {a.codigo}
                    {a.stock !== null && ` · stock ${a.stock.toLocaleString('es-AR')}`}
                  </span>
                </span>
              )}
              alElegir={(a) =>
                setLineas((ls) => [
                  ...ls,
                  {
                    clave: Math.random().toString(36).slice(2),
                    articuloId: a.id,
                    codigo: a.codigo,
                    descripcion: a.nombre,
                    cantidad: '1',
                    pendiente: null,
                    pedidoItemId: null,
                    llevaSerie: false,
                    series: '',
                  },
                ])
              }
            />
          </div>
        )}
      </Panel>

      <div className="flex justify-end gap-2">
        <BotonEnlace href={pedido ? `/pedidos/${pedido.id}` : '/remitos'} variante="fantasma">
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando || !tercero || !aEntregar.length}>
          {enviando ? 'Emitiendo…' : 'Emitir remito'}
        </Boton>
      </div>
    </form>
  )
}
