'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'

import {
  buscarArticulosCompra,
  buscarProveedores,
  guardarOrdenAccion,
  pendientesProveedor,
  registrarCompraAccion,
} from '@/app/(app)/compras/acciones'
import { LETRAS_COMPRA, NOMBRE_LETRA_COMPRA } from '@/modulos/compras/tipos'
import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton, BotonEnlace, Chip, Panel, Tecla } from '@/components/ui'
import { D, formatearMonto, normalizarNumero } from '@/lib/dinero'
import { calcularLinea, calcularTotales, convertir, TASAS_IVA } from '@/modulos/comercial/calculo'
import { formatearNumero } from '@/modulos/comercial/formato'
import { abreviaturaCompra, discriminaIva } from '@/modulos/compras/tipos'

type Proveedor = Awaited<ReturnType<typeof buscarProveedores>>[number]
type Articulo = Awaited<ReturnType<typeof buscarArticulosCompra>>[number]
type Pendiente = Awaited<ReturnType<typeof pendientesProveedor>>[number]
type Opcion = { valor: string; texto: string }

export type LineaCompra = {
  clave: string
  articuloId: string | null
  codigo: string | null
  descripcion: string
  cantidad: string
  precioUnitario: string
  descuento: string
  alicuotaIva: number
  ordenItemId: string | null
}

type Tributo = { clave: string; tipo: string; provincia: string; importe: string }

const TRIBUTOS: Opcion[] = [
  { valor: 'percepcion_iibb', texto: 'Percepción de IIBB' },
  { valor: 'percepcion_iva', texto: 'Percepción de IVA' },
  { valor: 'percepcion_ganancias', texto: 'Percepción de Ganancias' },
  { valor: 'impuestos_internos', texto: 'Impuestos internos' },
  { valor: 'impuesto_municipal', texto: 'Impuesto municipal' },
  { valor: 'otro', texto: 'Otro tributo' },
]
const ALICUOTAS = [
  { valor: 5, texto: '21 %' },
  { valor: 4, texto: '10,5 %' },
  { valor: 6, texto: '27 %' },
  { valor: 8, texto: '5 %' },
  { valor: 9, texto: '2,5 %' },
  { valor: 3, texto: '0 %' },
]
const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const nuevaClave = () => Math.random().toString(36).slice(2)
const valido = (v: string) => /^\d+(\.\d+)?$/.test(normalizarNumero(v || ''))
const num = (v: string) => (valido(v) ? new D(normalizarNumero(v)) : new D(0))

export function FormularioCompra({
  modo,
  ordenId = null,
  inicial,
  depositos,
  provincias,
  dolarDelDia,
}: {
  modo: 'compra' | 'orden'
  /** Orden de compra que se edita (modo orden) o que se recibe (modo compra). */
  ordenId?: string | null
  inicial: {
    proveedor: { id: string; razonSocial: string; condicionIva: number } | null
    fecha: string
    fechaEntrega?: string
    moneda: string
    depositoId: string
    observaciones?: string
    lineas: LineaCompra[]
  }
  depositos: Opcion[]
  provincias: Opcion[]
  dolarDelDia: string | null
}) {
  const [estado, accion, enviando] = useActionState(
    modo === 'orden' ? guardarOrdenAccion.bind(null, ordenId) : registrarCompraAccion,
    undefined,
  )
  const formulario = useRef<HTMLFormElement>(null)
  const [proveedor, setProveedor] = useState(inicial.proveedor)
  const [clase, setClase] = useState<'factura' | 'nota_debito' | 'nota_credito'>('factura')
  const [letra, setLetra] = useState(inicial.proveedor ? (inicial.proveedor.condicionIva === 1 ? 'A' : 'C') : 'A')
  const [fce, setFce] = useState(false)
  const [puntoVenta, setPuntoVenta] = useState('')
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState(inicial.fecha)
  const [periodo, setPeriodo] = useState(inicial.fecha.slice(0, 7))
  const [periodoTocado, setPeriodoTocado] = useState(false)
  const [vencimiento, setVencimiento] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState(inicial.fechaEntrega ?? '')
  const [cae, setCae] = useState('')
  const [moneda, setMoneda] = useState(inicial.moneda)
  const [dolar, setDolar] = useState(dolarDelDia ?? '')
  const [depositoId, setDepositoId] = useState(inicial.depositoId)
  // Por defecto con artículos: casi todo lo que se compra es mercadería que entra al stock.
  const [conArticulos, setConArticulos] = useState(true)
  const [lineas, setLineas] = useState<LineaCompra[]>(inicial.lineas)
  const [bases, setBases] = useState<Record<number, string>>({})
  const [ivaImpreso, setIvaImpreso] = useState<Record<number, string>>({})
  const [noGravado, setNoGravado] = useState('')
  const [exento, setExento] = useState('')
  const [tributos, setTributos] = useState<Tributo[]>([])
  const [actualizarCosto, setActualizarCosto] = useState(false)
  const [observaciones, setObservaciones] = useState(inicial.observaciones ?? '')
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [aplicarA, setAplicarA] = useState('')

  useEffect(() => {
    if (!proveedor || clase !== 'nota_credito') return
    let vigente = true
    pendientesProveedor(proveedor.id).then((p) => vigente && setPendientes(p))
    return () => {
      vigente = false
    }
  }, [proveedor, clase])

  const conIva = discriminaIva(letra)
  const simbolo = SIMBOLO[moneda] ?? moneda
  const dolarValido = valido(dolar) && num(dolar).gt(0)

  // Bases por alícuota: de los renglones o de lo cargado a mano.
  const porAlicuota = useMemo(() => {
    if (conArticulos) {
      const validas = lineas.filter(
        (l) => valido(l.cantidad) && valido(l.precioUnitario) && (!l.descuento || valido(l.descuento)),
      )
      return calcularTotales(
        validas.map((l) => ({
          cantidad: normalizarNumero(l.cantidad),
          precioUnitario: normalizarNumero(l.precioUnitario),
          descuento: l.descuento ? normalizarNumero(l.descuento) : '0',
          alicuotaIva: conIva ? l.alicuotaIva : 3,
        })),
      ).totales.porAlicuota.map((a) => ({ alicuotaIva: a.alicuotaIva, base: a.base, calculado: a.iva }))
    }
    return Object.entries(bases)
      .filter(([, b]) => num(b).gt(0))
      .map(([a, b]) => {
        const alicuotaIva = conIva ? Number(a) : 3
        return { alicuotaIva, base: num(b).toFixed(2), calculado: num(b).times(TASAS_IVA[alicuotaIva]).dividedBy(100).toFixed(2) }
      })
  }, [conArticulos, lineas, bases, conIva])

  const iva = porAlicuota.reduce(
    (s, a) => s.plus(conIva && ivaImpreso[a.alicuotaIva] ? num(ivaImpreso[a.alicuotaIva]) : a.calculado),
    new D(0),
  )
  const neto = porAlicuota.reduce((s, a) => s.plus(a.base), new D(0))
  const totalTributos = tributos.reduce((s, t) => s.plus(num(t.importe)), new D(0))
  const total = neto.plus(iva).plus(num(noGravado)).plus(num(exento)).plus(totalTributos)

  function agregarArticulo(a: Articulo) {
    const costo = a.costo ? convertir(a.costo, a.monedaCosto ?? 'PES', moneda, dolarValido ? normalizarNumero(dolar) : '1') : '0'
    setLineas((ls) => [
      ...ls,
      {
        clave: nuevaClave(),
        articuloId: a.id,
        codigo: a.codigo,
        descripcion: a.nombre,
        cantidad: '1',
        precioUnitario: String(Number(costo)),
        descuento: '',
        alicuotaIva: a.alicuotaIva,
        ordenItemId: null,
      },
    ])
  }
  const actualizar = (clave: string, cambio: Partial<LineaCompra>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)))

  const items = conArticulos
    ? lineas.map((l) => ({
        articuloId: l.articuloId,
        descripcion: l.descripcion,
        cantidad: normalizarNumero(l.cantidad),
        precioUnitario: normalizarNumero(l.precioUnitario),
        descuento: l.descuento ? normalizarNumero(l.descuento) : '0',
        alicuotaIva: l.alicuotaIva,
        ordenItemId: l.ordenItemId,
      }))
    : []
  const datos =
    modo === 'orden'
      ? {
          terceroId: proveedor?.id ?? '',
          fecha,
          fechaEntrega: fechaEntrega || null,
          depositoId: depositoId || null,
          moneda,
          cotizacion: moneda === 'PES' ? '1' : normalizarNumero(dolar || '0'),
          observaciones,
          items,
        }
      : {
          terceroId: proveedor?.id ?? '',
          clase,
          letra,
          fce,
          puntoVenta,
          numero,
          fecha,
          periodoIva: periodo,
          vencimiento: vencimiento || null,
          cae,
          moneda,
          cotizacion: moneda === 'PES' ? '1' : normalizarNumero(dolar || '0'),
          depositoId: depositoId || null,
          ordenCompraId: ordenId,
          aplicarA: clase === 'nota_credito' && aplicarA ? aplicarA : null,
          actualizarCosto,
          items,
          iva: porAlicuota.map((a) => ({
            alicuotaIva: a.alicuotaIva,
            base: a.base,
            importe: conIva && ivaImpreso[a.alicuotaIva] ? normalizarNumero(ivaImpreso[a.alicuotaIva]) : null,
          })),
          noGravado: normalizarNumero(noGravado || '0'),
          exento: normalizarNumero(exento || '0'),
          tributos: tributos
            .filter((t) => num(t.importe).gt(0))
            .map((t) => ({ tipo: t.tipo, provincia: t.provincia || null, importe: normalizarNumero(t.importe) })),
          observaciones,
        }

  const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
  const etiqueta = 'text-xs font-medium text-texto-2'
  const listo = modo === 'orden' ? !!proveedor && lineas.length > 0 : !!proveedor && !!numero && total.gt(0)

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
      <input type="hidden" name={modo === 'orden' ? 'orden' : 'compra'} value={JSON.stringify(datos)} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}

      <Panel className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className={etiqueta}>Proveedor</span>
          {proveedor ? (
            <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
              <span className="truncate text-sm font-medium">{proveedor.razonSocial}</span>
              {!ordenId && (
                <button type="button" onClick={() => setProveedor(null)} className="text-xs text-acento hover:underline">
                  Cambiar
                </button>
              )}
            </div>
          ) : (
            <Buscador<Proveedor>
              etiqueta="Buscar proveedor"
              placeholder="Nombre, código o CUIT"
              autoFocus
              buscar={buscarProveedores}
              clave={(p) => p.id}
              render={(p) => (
                <span className="flex justify-between gap-3">
                  <span className="truncate">{p.razonSocial}</span>
                  <span className="cifras text-xs text-texto-3">{p.esProveedor ? p.codigo : 'cliente'}</span>
                </span>
              )}
              alElegir={(p) => {
                setProveedor({ id: p.id, razonSocial: p.razonSocial, condicionIva: p.condicionIva })
                setLetra(p.condicionIva === 1 ? 'A' : 'C')
              }}
            />
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha {modo === 'compra' ? 'del comprobante' : ''}</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value)
              if (!periodoTocado && e.target.value) setPeriodo(e.target.value.slice(0, 7))
            }}
            className={control}
            required
          />
        </label>
        {modo === 'compra' ? (
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Período del libro de IVA</span>
            <input
              type="month"
              value={periodo}
              onChange={(e) => {
                setPeriodo(e.target.value)
                setPeriodoTocado(true)
              }}
              className={control}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Entrega prevista</span>
            <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className={control} />
          </label>
        )}

        {modo === 'compra' && (
          <>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <label className="flex flex-col gap-1">
                <span className={etiqueta}>Comprobante</span>
                <select value={clase} onChange={(e) => setClase(e.target.value as typeof clase)} className={control}>
                  <option value="factura">Factura</option>
                  <option value="nota_debito">Nota de débito</option>
                  <option value="nota_credito">Nota de crédito</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={etiqueta}>Letra</span>
                <select value={letra} onChange={(e) => setLetra(e.target.value)} className={control}>
                  {LETRAS_COMPRA.map((l) => (
                    <option key={l} value={l}>
                      {NOMBRE_LETRA_COMPRA[l]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <label className="flex flex-col gap-1">
                <span className={etiqueta}>Punto de venta</span>
                <input
                  value={puntoVenta}
                  onChange={(e) => setPuntoVenta(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  className={`${control} cifras`}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={etiqueta}>Número</span>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  className={`${control} cifras`}
                  required
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className={etiqueta}>CAE / CAI</span>
              <input value={cae} onChange={(e) => setCae(e.target.value)} inputMode="numeric" className={`${control} cifras`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={etiqueta}>Vencimiento del pago</span>
              <input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className={control} />
            </label>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Moneda</span>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={control}>
              <option value="PES">Pesos</option>
              <option value="DOL">Dólares</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Dólar ($)</span>
            <input
              value={dolar}
              onChange={(e) => setDolar(e.target.value)}
              inputMode="decimal"
              aria-invalid={moneda !== 'PES' && !dolarValido}
              className={`${control} cifras ${moneda !== 'PES' && !dolarValido ? 'border-error' : ''}`}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Depósito donde entra</span>
          <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)} className={control}>
            <option value="">—</option>
            {depositos.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        {modo === 'compra' && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={fce} onChange={(e) => setFce(e.target.checked)} /> Factura de crédito MiPyME
          </label>
        )}
      </Panel>

      {modo === 'compra' && clase === 'nota_credito' && proveedor && (
        <Panel className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span className="text-texto-2">Aplicar a la factura</span>
          <select value={aplicarA} onChange={(e) => setAplicarA(e.target.value)} className={`${control} min-w-72`}>
            <option value="">Ninguna (queda a favor)</option>
            {pendientes.map((p) => (
              <option key={p.id} value={p.id}>
                {abreviaturaCompra(p.tipo)} {formatearNumero(p.puntoVenta, p.numero)} · saldo{' '}
                {formatearMonto(p.saldo, SIMBOLO[p.moneda] ?? p.moneda)}
              </option>
            ))}
          </select>
        </Panel>
      )}

      {modo === 'compra' && (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="Cómo se carga">
          {[
            { v: true, t: 'Con artículos (entra al stock)' },
            { v: false, t: 'Sin artículos (gastos y servicios)' },
          ].map((o) => (
            <button
              key={o.t}
              type="button"
              role="radio"
              aria-checked={conArticulos === o.v}
              onClick={() => setConArticulos(o.v)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
                conArticulos === o.v
                  ? 'border-acento bg-acento-suave text-acento'
                  : 'border-borde text-texto-2 hover:bg-superficie-2'
              }`}
            >
              {o.t}
            </button>
          ))}
          {!conIva && <Chip>{letra}: precio final, sin IVA discriminado</Chip>}
        </div>
      )}

      {conArticulos ? (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                <th className="w-[42%] px-3 py-2 font-medium">Artículo o descripción</th>
                <th className="px-2 py-2 text-right font-medium">Cantidad</th>
                <th className="px-2 py-2 text-right font-medium">Precio neto ({simbolo})</th>
                <th className="px-2 py-2 text-right font-medium">Desc. %</th>
                {conIva && <th className="px-2 py-2 font-medium">IVA</th>}
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lineas.map((l, n) => {
                const ok = valido(l.cantidad) && valido(l.precioUnitario) && (!l.descuento || valido(l.descuento))
                const sub = ok
                  ? calcularLinea({
                      cantidad: normalizarNumero(l.cantidad),
                      precioUnitario: normalizarNumero(l.precioUnitario),
                      descuento: l.descuento ? normalizarNumero(l.descuento) : '0',
                      alicuotaIva: l.alicuotaIva,
                    }).neto
                  : null
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
                          className={`cifras h-8 w-full min-w-16 rounded border bg-superficie px-1.5 text-right focus:border-acento ${
                            l[k] && !valido(l[k]) ? 'border-error' : 'border-borde'
                          }`}
                        />
                      </td>
                    ))}
                    {conIva && (
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
                    )}
                    <td className="cifras px-3 py-1.5 text-right whitespace-nowrap">
                      {sub ? formatearMonto(sub, simbolo) : '—'}
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
                placeholder="Agregar artículo: nombre, código o código de barras (trae el último costo)"
                buscar={buscarArticulosCompra}
                clave={(a) => a.id}
                alElegir={agregarArticulo}
                render={(a) => (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate">{a.nombre}</span>
                      <span className="cifras block text-xs text-texto-3">{a.codigo}</span>
                    </span>
                    <span className="cifras shrink-0 text-xs">
                      {a.costo ? formatearMonto(a.costo, SIMBOLO[a.monedaCosto ?? 'PES'] ?? '$') : 'Sin costo'}
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
                    ordenItemId: null,
                  },
                ])
              }
            >
              <Plus aria-hidden className="size-4" /> Renglón libre
            </Boton>
            {modo === 'compra' && clase === 'factura' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={actualizarCosto} onChange={(e) => setActualizarCosto(e.target.checked)} />
                Actualizar el costo de los artículos
              </label>
            )}
          </div>
        </Panel>
      ) : (
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{conIva ? 'Neto gravado por alícuota' : 'Importe (precio final)'}</h2>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {(conIva ? ALICUOTAS : [{ valor: 3, texto: 'Importe' }]).map((a) => (
              <label key={a.valor} className="flex flex-col gap-1">
                <span className={etiqueta}>{conIva ? `Neto al ${a.texto}` : a.texto}</span>
                <input
                  value={bases[a.valor] ?? ''}
                  onChange={(e) => setBases((b) => ({ ...b, [a.valor]: e.target.value }))}
                  inputMode="decimal"
                  className={`${control} cifras text-right`}
                />
              </label>
            ))}
          </div>
        </Panel>
      )}

      {modo === 'compra' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Percepciones y otros tributos</h2>
              <Boton
                type="button"
                onClick={() =>
                  setTributos((ts) => [...ts, { clave: nuevaClave(), tipo: 'percepcion_iibb', provincia: 'H', importe: '' }])
                }
              >
                <Plus aria-hidden className="size-4" /> Agregar
              </Boton>
            </div>
            {tributos.length === 0 && <p className="text-sm text-texto-3">Sin percepciones.</p>}
            <div className="flex flex-col gap-2">
              {tributos.map((t, n) => (
                <div key={t.clave} className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_140px_auto]">
                  <select
                    value={t.tipo}
                    onChange={(e) =>
                      setTributos((ts) => ts.map((x) => (x.clave === t.clave ? { ...x, tipo: e.target.value } : x)))
                    }
                    aria-label={`Tipo del tributo ${n + 1}`}
                    className={control}
                  >
                    {TRIBUTOS.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.texto}
                      </option>
                    ))}
                  </select>
                  {t.tipo === 'percepcion_iibb' ? (
                    <select
                      value={t.provincia}
                      onChange={(e) =>
                        setTributos((ts) => ts.map((x) => (x.clave === t.clave ? { ...x, provincia: e.target.value } : x)))
                      }
                      aria-label={`Jurisdicción del tributo ${n + 1}`}
                      className={control}
                    >
                      {provincias.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.texto}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span />
                  )}
                  <input
                    value={t.importe}
                    onChange={(e) =>
                      setTributos((ts) => ts.map((x) => (x.clave === t.clave ? { ...x, importe: e.target.value } : x)))
                    }
                    inputMode="decimal"
                    placeholder="Importe"
                    aria-label={`Importe del tributo ${n + 1}`}
                    className={`${control} cifras text-right`}
                  />
                  <button
                    type="button"
                    onClick={() => setTributos((ts) => ts.filter((x) => x.clave !== t.clave))}
                    aria-label={`Quitar el tributo ${n + 1}`}
                    className="grid size-9 place-items-center rounded text-texto-3 hover:bg-error-suave hover:text-error"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            {conIva && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-borde pt-3">
                <label className="flex flex-col gap-1">
                  <span className={etiqueta}>No gravado</span>
                  <input
                    value={noGravado}
                    onChange={(e) => setNoGravado(e.target.value)}
                    inputMode="decimal"
                    className={`${control} cifras text-right`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={etiqueta}>Exento</span>
                  <input
                    value={exento}
                    onChange={(e) => setExento(e.target.value)}
                    inputMode="decimal"
                    className={`${control} cifras text-right`}
                  />
                </label>
              </div>
            )}
          </Panel>
          <Panel className="p-4">
            <dl className="cifras flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="font-sans text-texto-2">{conIva ? 'Neto gravado' : 'Importe'}</dt>
                <dd>{formatearMonto(neto.toFixed(2), simbolo)}</dd>
              </div>
              {conIva &&
                porAlicuota
                  .filter((a) => a.alicuotaIva !== 3)
                  .map((a) => (
                    <div key={a.alicuotaIva} className="flex items-center justify-between gap-2 text-texto-2">
                      <dt className="font-sans">IVA {TASAS_IVA[a.alicuotaIva].replace('.', ',')} %</dt>
                      <dd>
                        <input
                          value={ivaImpreso[a.alicuotaIva] ?? ''}
                          placeholder={a.calculado.replace('.', ',')}
                          onChange={(e) => setIvaImpreso((x) => ({ ...x, [a.alicuotaIva]: e.target.value }))}
                          inputMode="decimal"
                          aria-label={`IVA al ${TASAS_IVA[a.alicuotaIva]} % impreso en el comprobante`}
                          title="Si el comprobante dice otro IVA (por redondeo), escribilo"
                          className="cifras h-7 w-28 rounded border border-borde bg-superficie px-1.5 text-right focus:border-acento"
                        />
                      </dd>
                    </div>
                  ))}
              {num(noGravado).gt(0) && (
                <div className="flex justify-between text-texto-2">
                  <dt className="font-sans">No gravado</dt>
                  <dd>{formatearMonto(num(noGravado).toFixed(2), simbolo)}</dd>
                </div>
              )}
              {num(exento).gt(0) && (
                <div className="flex justify-between text-texto-2">
                  <dt className="font-sans">Exento</dt>
                  <dd>{formatearMonto(num(exento).toFixed(2), simbolo)}</dd>
                </div>
              )}
              {totalTributos.gt(0) && (
                <div className="flex justify-between text-texto-2">
                  <dt className="font-sans">Percepciones y tributos</dt>
                  <dd>{formatearMonto(totalTributos.toFixed(2), simbolo)}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-borde pt-2 text-base font-medium">
                <dt className="font-sans">Total</dt>
                <dd>{formatearMonto(total.toFixed(2), simbolo)}</dd>
              </div>
              <p className="font-sans text-xs text-texto-3">Comparalo con el total impreso en el comprobante.</p>
            </dl>
          </Panel>
        </div>
      )}

      <Panel className="p-4">
        <label htmlFor="observaciones" className={etiqueta}>
          Observaciones
        </label>
        <textarea
          id="observaciones"
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="mt-1 w-full rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
        />
      </Panel>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-borde bg-fondo/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="mr-auto hidden items-center gap-1 text-xs text-texto-3 sm:flex">
          <Tecla>Ctrl</Tecla> <Tecla>Enter</Tecla> para grabar
        </span>
        <BotonEnlace
          href={modo === 'orden' ? (ordenId ? `/ordenes-compra/${ordenId}` : '/ordenes-compra') : '/compras'}
          variante="fantasma"
        >
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando || !listo}>
          {enviando ? 'Grabando…' : modo === 'orden' ? (ordenId ? 'Grabar cambios' : 'Grabar orden') : 'Registrar comprobante'}
        </Boton>
      </div>
    </form>
  )
}
