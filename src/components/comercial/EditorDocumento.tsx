'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useCallback, useMemo, useRef, useState } from 'react'

import { buscarArticulos, buscarClientes, guardarDocumentoAccion } from '@/app/(app)/comercial/acciones'
import { guardarComprobanteAccion } from '@/app/(app)/facturacion/acciones'
import { Aviso, Boton, BotonEnlace, Chip, Panel, Tecla } from '@/components/ui'
import { formatearMonto, normalizarNumero } from '@/lib/dinero'
import { calcularLinea, calcularTotales, convertir, TASAS_IVA } from '@/modulos/comercial/calculo'
import type { Clase } from '@/modulos/facturacion/tipos'

import { Buscador } from './Buscador'

type Opcion = { valor: string; texto: string }
type Cliente = Awaited<ReturnType<typeof buscarClientes>>[number]
type Articulo = Awaited<ReturnType<typeof buscarArticulos>>[number]

export type LineaEditor = {
  clave: string
  articuloId: string | null
  codigo: string | null
  descripcion: string
  cantidad: string
  precioUnitario: string
  descuento: string
  alicuotaIva: number
}

export type CabeceraEditor = {
  terceroId: string
  cliente: string
  fecha: string
  moneda: string
  listaPreciosId: string
  vendedorId: string
  condicionPagoId: string
  observaciones: string
  validezDias: string
  depositoId: string
  fechaEntrega: string
  /** Solo comprobantes fiscales. */
  puntoVenta?: string
  concepto?: string
  servicioDesde?: string
  servicioHasta?: string
  vencimiento?: string
  /** Condición de IVA del cliente, para mostrar qué letra va a salir. */
  condicionIva?: number | null
}

/** Datos extra del editor cuando arma una factura o una nota. */
export type ContextoFactura = {
  clase: Clase
  asociado: { id: string; texto: string } | null
  pedidoId: string | null
  puntosVenta: Opcion[]
  /** Condición de IVA del cliente → letra que corresponde. */
  letraDe: Record<number, string>
}

const NOMBRE_CLASE: Record<Clase, string> = { factura: 'Factura', nota_debito: 'Nota de débito', nota_credito: 'Nota de crédito' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$', '060': '€' }
const ALICUOTAS = [
  { valor: 5, texto: '21 %' },
  { valor: 4, texto: '10,5 %' },
  { valor: 6, texto: '27 %' },
  { valor: 8, texto: '5 %' },
  { valor: 9, texto: '2,5 %' },
  { valor: 3, texto: '0 %' },
]

const nuevaClave = () => Math.random().toString(36).slice(2)
const numeroValido = (v: string) => /^\d+(\.\d+)?$/.test(normalizarNumero(v))

export function EditorDocumento({
  tipo,
  id,
  inicial,
  lineasIniciales,
  cotizacionDolar,
  opciones,
  factura,
}: {
  tipo: 'presupuesto' | 'pedido' | 'factura'
  id: string | null
  inicial: CabeceraEditor
  lineasIniciales: LineaEditor[]
  /** Dólar del día (pesos por dólar), para convertir precios. */
  cotizacionDolar: string | null
  opciones: { listas: Opcion[]; vendedores: Opcion[]; condiciones: Opcion[]; depositos: Opcion[] }
  factura?: ContextoFactura
}) {
  const [estado, accion, enviando] = useActionState(
    tipo === 'factura' ? guardarComprobanteAccion.bind(null, id) : guardarDocumentoAccion.bind(null, tipo, id),
    undefined,
  )
  const [cab, setCab] = useState(inicial)
  const [lineas, setLineas] = useState<LineaEditor[]>(lineasIniciales)
  const [dolar, setDolar] = useState(cotizacionDolar ?? '')
  const formulario = useRef<HTMLFormElement>(null)
  const campo = (k: keyof CabeceraEditor) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setCab((c) => ({ ...c, [k]: e.target.value }))

  const cotizacionDoc = cab.moneda === 'PES' ? '1' : dolar
  const dolarValido = numeroValido(dolar) && Number(normalizarNumero(dolar)) > 0

  const totales = useMemo(() => {
    const validas = lineas.filter(
      (l) => numeroValido(l.cantidad) && numeroValido(l.precioUnitario) && (!l.descuento || numeroValido(l.descuento)),
    )
    try {
      return calcularTotales(
        validas.map((l) => ({
          cantidad: normalizarNumero(l.cantidad),
          precioUnitario: normalizarNumero(l.precioUnitario),
          descuento: l.descuento ? normalizarNumero(l.descuento) : '0',
          alicuotaIva: l.alicuotaIva,
        })),
      )
    } catch {
      return null
    }
  }, [lineas])

  /** Subtotal de un renglón, o null si tiene algún número mal escrito. */
  function subtotal(l: LineaEditor) {
    if (!numeroValido(l.cantidad) || !numeroValido(l.precioUnitario) || (l.descuento && !numeroValido(l.descuento))) return null
    return calcularLinea({
      cantidad: normalizarNumero(l.cantidad),
      precioUnitario: normalizarNumero(l.precioUnitario),
      descuento: l.descuento ? normalizarNumero(l.descuento) : '0',
      alicuotaIva: l.alicuotaIva,
    })
  }

  const buscarArt = useCallback(
    (q: string) =>
      buscarArticulos(q, {
        listaId: cab.listaPreciosId || null,
        moneda: cab.moneda,
        cotizacion: dolarValido ? normalizarNumero(dolar) : '1',
      }),
    [cab.listaPreciosId, cab.moneda, dolar, dolarValido],
  )

  function agregarArticulo(a: Articulo) {
    setLineas((ls) => [
      ...ls,
      {
        clave: nuevaClave(),
        articuloId: a.id,
        codigo: a.codigo,
        descripcion: a.nombre,
        cantidad: '1',
        precioUnitario: a.precio ? String(Number(a.precio)) : '0',
        descuento: '',
        alicuotaIva: a.alicuotaIva,
      },
    ])
  }

  function cambiarMoneda(nueva: string) {
    const anterior = cab.moneda
    if (nueva === anterior) return
    // Pasa los precios cargados a la nueva moneda con el dólar del día.
    if (dolarValido) {
      setLineas((ls) =>
        ls.map((l) =>
          numeroValido(l.precioUnitario)
            ? {
                ...l,
                precioUnitario: String(
                  Number(convertir(normalizarNumero(l.precioUnitario), anterior, nueva, normalizarNumero(dolar))),
                ),
              }
            : l,
        ),
      )
    }
    setCab((c) => ({ ...c, moneda: nueva }))
  }

  const actualizar = (clave: string, cambio: Partial<LineaEditor>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)))

  const documento = {
    terceroId: cab.terceroId,
    fecha: cab.fecha,
    moneda: cab.moneda,
    cotizacion: cab.moneda === 'PES' ? '1' : normalizarNumero(cotizacionDoc || '0'),
    listaPreciosId: cab.listaPreciosId || null,
    vendedorId: cab.vendedorId || null,
    condicionPagoId: cab.condicionPagoId || null,
    observaciones: cab.observaciones,
    validezDias: cab.validezDias,
    depositoId: cab.depositoId || null,
    fechaEntrega: cab.fechaEntrega || null,
    ...(factura && {
      clase: factura.clase,
      asociadoId: factura.asociado?.id ?? null,
      pedidoId: factura.pedidoId,
      puntoVenta: cab.puntoVenta,
      concepto: cab.concepto,
      servicioDesde: cab.servicioDesde || null,
      servicioHasta: cab.servicioHasta || null,
      vencimiento: cab.vencimiento || null,
    }),
    items: lineas.map((l) => ({
      articuloId: l.articuloId,
      descripcion: l.descripcion,
      cantidad: normalizarNumero(l.cantidad),
      precioUnitario: normalizarNumero(l.precioUnitario),
      descuento: l.descuento ? normalizarNumero(l.descuento) : '0',
      alicuotaIva: l.alicuotaIva,
    })),
  }
  const simbolo = SIMBOLO[cab.moneda] ?? cab.moneda
  const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

  return (
    <form
      ref={formulario}
      action={accion}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault()
          formulario.current?.requestSubmit()
        }
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="documento" value={JSON.stringify(documento)} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}

      {factura && (
        <Panel className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <Chip tono="acento">
            {NOMBRE_CLASE[factura.clase]} {cab.terceroId ? (factura.letraDe[cab.condicionIva ?? 5] ?? 'B') : '—'}
          </Chip>
          {factura.asociado ? (
            <span className="text-texto-2">
              Corrige: <span className="font-medium text-texto">{factura.asociado.texto}</span>
            </span>
          ) : (
            <span className="text-texto-2">
              La letra sale de la condición de IVA del cliente. Se graba como borrador y se autoriza en ARCA desde su ficha.
            </span>
          )}
        </Panel>
      )}

      <Panel className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-texto-2">Cliente</span>
          {cab.terceroId ? (
            <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-borde bg-superficie-2 px-2.5">
              <span className="truncate text-sm font-medium">{cab.cliente}</span>
              {!factura?.asociado && (
                <button
                  type="button"
                  onClick={() => setCab((c) => ({ ...c, terceroId: '', cliente: '' }))}
                  className="text-xs text-acento hover:underline"
                >
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
              render={(c) => (
                <span className="flex justify-between gap-3">
                  <span className="truncate">{c.razonSocial}</span>
                  <span className="cifras text-xs text-texto-3">{c.codigo}</span>
                </span>
              )}
              alElegir={(c) =>
                setCab((x) => ({
                  ...x,
                  terceroId: c.id,
                  cliente: c.razonSocial,
                  listaPreciosId: c.listaPreciosId ?? x.listaPreciosId,
                  vendedorId: c.vendedorId ?? x.vendedorId,
                  condicionPagoId: c.condicionPagoId ?? x.condicionPagoId,
                  condicionIva: c.condicionIva,
                }))
              }
            />
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Fecha</span>
          <input type="date" value={cab.fecha} onChange={campo('fecha')} className={control} required />
        </label>
        {factura ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Punto de venta</span>
            <select value={cab.puntoVenta} onChange={campo('puntoVenta')} className={control}>
              {factura.puntosVenta.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          </label>
        ) : tipo === 'presupuesto' ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Validez (días)</span>
            <input value={cab.validezDias} onChange={campo('validezDias')} inputMode="numeric" className={`${control} cifras`} />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Entrega prevista</span>
            <input type="date" value={cab.fechaEntrega} onChange={campo('fechaEntrega')} className={control} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Lista de precios</span>
          <select value={cab.listaPreciosId} onChange={campo('listaPreciosId')} className={control}>
            <option value="">Sin lista</option>
            {opciones.listas.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Moneda</span>
            <select value={cab.moneda} onChange={(e) => cambiarMoneda(e.target.value)} className={control}>
              <option value="PES">Pesos</option>
              <option value="DOL">Dólares</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Dólar ($)</span>
            <input
              value={dolar}
              onChange={(e) => setDolar(e.target.value)}
              inputMode="decimal"
              aria-invalid={!dolarValido}
              className={`${control} cifras ${dolarValido ? '' : 'border-error'}`}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Vendedor</span>
          <select value={cab.vendedorId} onChange={campo('vendedorId')} className={control}>
            <option value="">Sin vendedor</option>
            {opciones.vendedores.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Condición de pago</span>
          <select value={cab.condicionPagoId} onChange={campo('condicionPagoId')} className={control}>
            <option value="">Contado</option>
            {opciones.condiciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        {tipo === 'pedido' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Depósito</span>
            <select value={cab.depositoId} onChange={campo('depositoId')} className={control}>
              <option value="">Elegí al entregar</option>
              {opciones.depositos.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          </label>
        )}
        {factura && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-texto-2">Concepto</span>
              <select value={cab.concepto} onChange={campo('concepto')} className={control}>
                <option value="1">Productos</option>
                <option value="2">Servicios</option>
                <option value="3">Productos y servicios</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-texto-2">Vencimiento del pago</span>
              <input type="date" value={cab.vencimiento} onChange={campo('vencimiento')} className={control} />
            </label>
            {cab.concepto !== '1' && (
              <div className="grid grid-cols-2 gap-2 md:col-span-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-texto-2">Servicio desde</span>
                  <input type="date" value={cab.servicioDesde} onChange={campo('servicioDesde')} className={control} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-texto-2">Servicio hasta</span>
                  <input type="date" value={cab.servicioHasta} onChange={campo('servicioHasta')} className={control} />
                </label>
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="w-[42%] px-3 py-2 font-medium">Artículo o descripción</th>
              <th className="px-2 py-2 text-right font-medium">Cantidad</th>
              <th className="px-2 py-2 text-right font-medium">Precio unit. ({simbolo})</th>
              <th className="px-2 py-2 text-right font-medium">Desc. %</th>
              <th className="px-2 py-2 font-medium">IVA</th>
              <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {lineas.map((l, n) => {
              const calculada = subtotal(l)
              return (
                <tr key={l.clave}>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      {l.codigo && <span className="cifras shrink-0 text-xs text-texto-3">{l.codigo}</span>}
                      <input
                        value={l.descripcion}
                        onChange={(e) => actualizar(l.clave, { descripcion: e.target.value })}
                        aria-label={`Descripción del renglón ${n + 1}`}
                        className="h-8 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 hover:border-borde focus:border-acento"
                      />
                    </div>
                  </td>
                  {(['cantidad', 'precioUnitario', 'descuento'] as const).map((k) => (
                    <td key={k} className="px-2 py-1.5">
                      <input
                        value={l[k]}
                        onChange={(e) => actualizar(l.clave, { [k]: e.target.value })}
                        inputMode="decimal"
                        aria-label={`${k === 'precioUnitario' ? 'Precio' : k === 'cantidad' ? 'Cantidad' : 'Descuento'} del renglón ${n + 1}`}
                        aria-invalid={Boolean(l[k]) && !numeroValido(l[k])}
                        className={`cifras h-8 w-full min-w-16 rounded border bg-superficie px-1.5 text-right focus:border-acento ${
                          l[k] && !numeroValido(l[k]) ? 'border-error' : 'border-borde'
                        }`}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <select
                      value={l.alicuotaIva}
                      onChange={(e) => actualizar(l.clave, { alicuotaIva: Number(e.target.value) })}
                      aria-label={`IVA del renglón ${n + 1}`}
                      className="h-8 rounded border border-borde bg-superficie px-1 text-sm"
                    >
                      {ALICUOTAS.map((a) => (
                        <option key={a.valor} value={a.valor}>
                          {a.texto}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="cifras px-3 py-1.5 text-right whitespace-nowrap">
                    {calculada ? formatearMonto(calculada.neto, simbolo) : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                      className="grid size-8 place-items-center rounded text-texto-3 hover:bg-error-suave hover:text-error"
                      aria-label={`Quitar el renglón ${n + 1}`}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3 border-t border-borde p-3">
          <div className="min-w-72 flex-1">
            <Buscador<Articulo>
              etiqueta="Agregar artículo"
              placeholder={
                cab.listaPreciosId
                  ? 'Agregar artículo: nombre, código o código de barras'
                  : 'Agregar artículo (elegí una lista para traer el precio)'
              }
              buscar={buscarArt}
              clave={(a) => a.id}
              alElegir={agregarArticulo}
              render={(a) => (
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{a.nombre}</span>
                    <span className="cifras block text-xs text-texto-3">
                      {a.codigo}
                      {a.stock !== null && ` · stock ${a.stock.toLocaleString('es-AR')}`}
                    </span>
                  </span>
                  <span className="cifras shrink-0 text-xs">
                    {a.precio ? (
                      formatearMonto(a.precio, simbolo)
                    ) : a.aviso ? (
                      <span className="text-aviso">{a.aviso}</span>
                    ) : (
                      'Sin precio'
                    )}
                  </span>
                </span>
              )}
            />
          </div>
          <Boton
            type="button"
            onClick={() =>
              setLineas((ls) => [
                ...ls,
                {
                  clave: nuevaClave(),
                  articuloId: null,
                  codigo: null,
                  descripcion: '',
                  cantidad: '1',
                  precioUnitario: '0',
                  descuento: '',
                  alicuotaIva: 5,
                },
              ])
            }
          >
            <Plus aria-hidden className="size-4" /> Renglón libre
          </Boton>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="p-4">
          <label htmlFor="observaciones" className="text-xs font-medium text-texto-2">
            Observaciones (salen impresas)
          </label>
          <textarea
            id="observaciones"
            rows={4}
            value={cab.observaciones}
            onChange={campo('observaciones')}
            className="mt-1 w-full rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
          />
        </Panel>
        <Panel className="p-4">
          <dl className="cifras flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="font-sans text-texto-2">Neto</dt>
              <dd>{formatearMonto(totales?.totales.neto ?? '0', simbolo)}</dd>
            </div>
            {totales?.totales.porAlicuota
              .filter((a) => Number(a.iva) !== 0)
              .map((a) => (
                <div key={a.alicuotaIva} className="flex justify-between text-texto-2">
                  <dt className="font-sans">IVA {TASAS_IVA[a.alicuotaIva].replace('.', ',')} %</dt>
                  <dd>{formatearMonto(a.iva, simbolo)}</dd>
                </div>
              ))}
            <div className="mt-1 flex justify-between border-t border-borde pt-2 text-base font-medium">
              <dt className="font-sans">Total</dt>
              <dd>{formatearMonto(totales?.totales.total ?? '0', simbolo)}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-borde bg-fondo/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="mr-auto hidden items-center gap-1 text-xs text-texto-3 sm:flex">
          <Tecla>Ctrl</Tecla> <Tecla>Enter</Tecla> para grabar
        </span>
        <BotonEnlace
          href={tipo === 'factura' ? (id ? `/facturas/${id}` : '/facturas') : id ? `/${tipo}s/${id}` : `/${tipo}s`}
          variante="fantasma"
        >
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando || !cab.terceroId || !lineas.length}>
          {enviando
            ? 'Grabando…'
            : id
              ? 'Grabar cambios'
              : tipo === 'presupuesto'
                ? 'Grabar presupuesto'
                : tipo === 'pedido'
                  ? 'Grabar pedido'
                  : 'Grabar borrador'}
        </Boton>
      </div>
    </form>
  )
}
