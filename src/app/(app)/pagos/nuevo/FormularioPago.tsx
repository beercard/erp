'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useEffect, useMemo, useState } from 'react'

import {
  buscarProveedores,
  chequesCartera,
  emitirPagoAccion,
  liquidarPagoAccion,
  pendientesProveedor,
} from '@/app/(app)/compras/acciones'
import { Buscador } from '@/components/comercial/Buscador'
import { SelectorCuenta, useCuentas } from '@/components/SelectorCuenta'
import { Aviso, Boton, BotonEnlace, Panel } from '@/components/ui'
import { D, formatearMonto, normalizarNumero } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { formatearNumero } from '@/modulos/comercial/formato'
import { MEDIOS_PAGO, type MedioPago } from '@/modulos/compras/medios'
import type { Liquidacion } from '@/modulos/compras/pagos'
import { abreviaturaCompra } from '@/modulos/compras/tipos'

type Proveedor = Awaited<ReturnType<typeof buscarProveedores>>[number]
type Pendiente = Awaited<ReturnType<typeof pendientesProveedor>>[number]
type Cheque = Awaited<ReturnType<typeof chequesCartera>>[number]

type Valor = {
  clave: string
  medio: MedioPago
  importe: string
  detalle: string
  banco: string
  numeroValor: string
  fechaPago: string
  reciboValorId: string
  cuentaId: string
}

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const nuevaClave = () => Math.random().toString(36).slice(2)
const valido = (v: string) => /^\d+(\.\d+)?$/.test(normalizarNumero(v || ''))
const num = (v: string) => (valido(v) ? new D(normalizarNumero(v)) : new D(0))
const valorVacio = (medio: MedioPago = 'transferencia', importe = ''): Valor => ({
  clave: nuevaClave(),
  medio,
  importe,
  detalle: '',
  banco: '',
  numeroValor: '',
  fechaPago: '',
  reciboValorId: '',
  cuentaId: '',
})

export function FormularioPago({
  proveedorInicial,
  hoy,
  dolarDelDia,
}: {
  proveedorInicial: { id: string; razonSocial: string } | null
  hoy: string
  dolarDelDia: string | null
}) {
  const [estado, accion, enviando] = useActionState(emitirPagoAccion, undefined)
  const [proveedor, setProveedor] = useState(proveedorInicial)
  const [deuda, setDeuda] = useState<Pendiente[] | null>(null)
  const [aplicar, setAplicar] = useState<Record<string, string>>({})
  const [aCuenta, setACuenta] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [moneda, setMoneda] = useState('PES')
  const [dolar, setDolar] = useState(dolarDelDia ?? '')
  const [valores, setValores] = useState<Valor[]>([valorVacio()])
  const [observaciones, setObservaciones] = useState('')
  const [cartera, setCartera] = useState<Cheque[]>([])
  const cuentas = useCuentas()
  const [liquidacion, setLiquidacion] = useState<Liquidacion | null>(null)
  const [errorLiquidacion, setErrorLiquidacion] = useState<string | null>(null)

  useEffect(() => {
    if (!proveedor) return
    let vigente = true
    pendientesProveedor(proveedor.id).then((p) => vigente && setDeuda(p))
    return () => {
      vigente = false
    }
  }, [proveedor])

  useEffect(() => {
    let vigente = true
    chequesCartera()
      .then((c) => vigente && setCartera(c))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [])

  const entrada = useMemo(
    () => ({
      terceroId: proveedor?.id ?? '',
      fecha,
      moneda,
      cotizacion: valido(dolar) ? normalizarNumero(dolar) : '1',
      imputaciones: Object.entries(aplicar)
        .filter(([, v]) => num(v).gt(0))
        .map(([compraId, v]) => ({ compraId, importe: normalizarNumero(v) })),
      aCuenta: num(aCuenta).toFixed(2),
    }),
    [proveedor, fecha, moneda, dolar, aplicar, aCuenta],
  )

  // Vista previa en el servidor: cuánto cancela, la retención y cuánto entregar.
  useEffect(() => {
    if (!entrada.terceroId || (!entrada.imputaciones.length && !num(aCuenta).gt(0))) return
    let vigente = true
    const espera = setTimeout(() => {
      liquidarPagoAccion(entrada).then((r) => {
        if (!vigente) return
        if (r.ok) {
          setLiquidacion(r.liquidacion)
          setErrorLiquidacion(null)
        } else {
          setLiquidacion(null)
          setErrorLiquidacion(r.error)
        }
      })
    }, 300)
    return () => {
      vigente = false
      clearTimeout(espera)
    }
  }, [entrada, aCuenta])

  const hayAlgo = entrada.imputaciones.length > 0 || num(aCuenta).gt(0)
  const liq = hayAlgo ? liquidacion : null
  const simbolo = SIMBOLO[moneda] ?? moneda
  const entregado = valores.reduce((s, v) => s.plus(num(v.importe)), new D(0))
  const aPagar = liq ? new D(liq.aPagar) : new D(0)
  const diferencia = aPagar.minus(entregado)
  const usados = new Set(valores.filter((v) => v.medio === 'cheque_tercero').map((v) => v.reciboValorId))

  const actualizar = (clave: string, cambio: Partial<Valor>) =>
    setValores((vs) => vs.map((v) => (v.clave === clave ? { ...v, ...cambio } : v)))

  function pagarTodo() {
    setAplicar(
      Object.fromEntries((deuda ?? []).filter((p) => p.moneda === moneda || moneda === 'PES').map((p) => [p.id, p.saldo])),
    )
  }

  function completar() {
    if (!diferencia.gt(0)) return
    setValores((vs) => {
      const vacio = vs.find((v) => !v.importe && v.medio !== 'cheque_tercero')
      if (vacio) return vs.map((v) => (v.clave === vacio.clave ? { ...v, importe: diferencia.toFixed(2) } : v))
      return [...vs, valorVacio('transferencia', diferencia.toFixed(2))]
    })
  }

  const pago = {
    ...entrada,
    observaciones,
    valores: valores
      .filter((v) => num(v.importe).gt(0))
      .map((v) => ({
        medio: v.medio,
        importe: normalizarNumero(v.importe),
        detalle: v.detalle,
        banco: v.banco,
        numeroValor: v.numeroValor,
        fechaPago: v.fechaPago,
        reciboValorId: v.medio === 'cheque_tercero' ? v.reciboValorId : null,
        cuentaId: v.cuentaId || null,
      })),
  }
  const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
  const listo = !!proveedor && !!liq && diferencia.abs().lt('0.01') && entregado.gt(0)

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="pago" value={JSON.stringify(pago)} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}

      <Panel className="grid gap-4 p-4 md:grid-cols-4">
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-texto-2">Proveedor</span>
          {proveedor ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
              <span className="truncate text-sm font-medium">{proveedor.razonSocial}</span>
              <button
                type="button"
                onClick={() => {
                  setProveedor(null)
                  setDeuda(null)
                  setAplicar({})
                  setLiquidacion(null)
                }}
                className="text-xs text-acento hover:underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <Buscador<Proveedor>
              etiqueta="Buscar proveedor"
              placeholder="Nombre, código o CUIT"
              autoFocus
              buscar={buscarProveedores}
              clave={(p) => p.id}
              render={(p) => p.razonSocial}
              alElegir={(p) => setProveedor({ id: p.id, razonSocial: p.razonSocial })}
            />
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={control} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Se paga en</span>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={control}>
              <option value="PES">Pesos</option>
              <option value="DOL">Dólares</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Dólar del día</span>
            <input value={dolar} onChange={(e) => setDolar(e.target.value)} inputMode="decimal" className={`${control} cifras`} />
          </label>
        </div>
      </Panel>

      {proveedor && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
            <h2 className="text-sm font-semibold">Qué se paga</h2>
            {deuda && deuda.length > 0 && (
              <button type="button" onClick={pagarTodo} className="text-xs text-acento hover:underline">
                Pagar todo lo pendiente
              </button>
            )}
          </div>
          {!deuda ? (
            <p className="px-4 py-4 text-sm text-texto-3">Buscando comprobantes pendientes…</p>
          ) : deuda.length === 0 ? (
            <p className="px-4 py-4 text-sm text-texto-2">No hay comprobantes pendientes: el pago queda a cuenta.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-texto-2">
                    <th className="px-4 py-2 font-medium">Comprobante</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 text-right font-medium">Saldo</th>
                    <th className="px-4 py-2 text-right font-medium">Cancelar (en su moneda)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {deuda.map((p) => (
                    <tr key={p.id}>
                      <td className="cifras px-4 py-2">
                        {abreviaturaCompra(p.tipo)} {formatearNumero(p.puntoVenta, p.numero)}
                      </td>
                      <td className="px-4 py-2 text-texto-2">
                        {fechaCorta(p.fecha)}
                        {p.vencimiento && ` · vence ${fechaCorta(p.vencimiento)}`}
                      </td>
                      <td className="cifras px-4 py-2 text-right">{formatearMonto(p.saldo, SIMBOLO[p.moneda] ?? p.moneda)}</td>
                      <td className="px-4 py-2">
                        <input
                          value={aplicar[p.id] ?? ''}
                          onChange={(e) => setAplicar((a) => ({ ...a, [p.id]: e.target.value }))}
                          inputMode="decimal"
                          aria-label={`Importe a cancelar de ${formatearNumero(p.puntoVenta, p.numero)}`}
                          className="cifras ml-auto block h-8 w-32 rounded border border-borde bg-superficie px-1.5 text-right focus:border-acento"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-borde px-4 py-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-texto-2">Además, a cuenta ({simbolo})</span>
              <input
                value={aCuenta}
                onChange={(e) => setACuenta(e.target.value)}
                inputMode="decimal"
                className="cifras h-8 w-32 rounded border border-borde bg-superficie px-1.5 text-right focus:border-acento"
              />
            </label>
          </div>
        </Panel>
      )}

      {errorLiquidacion && hayAlgo && <Aviso>{errorLiquidacion}</Aviso>}
      {liq && (
        <Panel className="p-4">
          <dl className="cifras flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="font-sans text-texto-2">Cancela</dt>
              <dd>{formatearMonto(liq.cancelado, simbolo)}</dd>
            </div>
            {liq.retencion && (
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between">
                  <dt className="font-sans text-texto-2">
                    Retención de Ganancias ({liq.retencion.concepto}, régimen {liq.regimen})
                  </dt>
                  <dd>− {formatearMonto(liq.retencionMonedaPago, simbolo)}</dd>
                </div>
                <p className="font-sans text-xs text-texto-3">{liq.retencion.explicacion}</p>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-borde pt-2 text-base font-medium">
              <dt className="font-sans">A entregar</dt>
              <dd>{formatearMonto(liq.aPagar, simbolo)}</dd>
            </div>
          </dl>
        </Panel>
      )}

      <Panel>
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Con qué se paga</h2>
        <div className="flex flex-col divide-y divide-borde">
          {valores.map((v, n) => (
            <div key={v.clave} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_140px_minmax(0,1fr)_auto]">
              <select
                value={v.medio}
                onChange={(e) => actualizar(v.clave, { medio: e.target.value as MedioPago, reciboValorId: '', importe: '' })}
                aria-label={`Medio del valor ${n + 1}`}
                className={control}
              >
                {Object.entries(MEDIOS_PAGO).map(([k, t]) => (
                  <option key={k} value={k} disabled={k === 'cheque_tercero' && moneda !== 'PES'}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={v.importe}
                onChange={(e) => actualizar(v.clave, { importe: e.target.value })}
                readOnly={v.medio === 'cheque_tercero'}
                inputMode="decimal"
                placeholder="Importe"
                aria-label={`Importe del valor ${n + 1}`}
                className={`${control} cifras text-right`}
              />
              {v.medio === 'cheque_tercero' ? (
                <select
                  value={v.reciboValorId}
                  onChange={(e) => {
                    const c = cartera.find((x) => x.id === e.target.value)
                    actualizar(v.clave, { reciboValorId: e.target.value, importe: c ? String(Number(c.importe)) : '' })
                  }}
                  aria-label={`Cheque de terceros del valor ${n + 1}`}
                  className={control}
                >
                  <option value="">{cartera.length ? 'Elegí el cheque de la cartera' : 'No hay cheques en cartera'}</option>
                  {cartera
                    .filter((c) => c.id === v.reciboValorId || !usados.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.banco} N° {c.numeroValor} · {formatearMonto(c.importe, '$')}
                        {c.fechaPago ? ` · ${fechaCorta(c.fechaPago)}` : ''} · {c.cliente}
                      </option>
                    ))}
                </select>
              ) : v.medio === 'cheque_propio' || v.medio === 'echeq_propio' ? (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <SelectorCuenta
                    cuentas={cuentas}
                    medio={v.medio}
                    moneda={moneda}
                    valor={v.cuentaId}
                    onChange={(cuentaId) => actualizar(v.clave, { cuentaId })}
                    etiqueta={`Cuenta de la que sale el valor ${n + 1}`}
                  />
                  <input
                    value={v.banco}
                    onChange={(e) => actualizar(v.clave, { banco: e.target.value })}
                    placeholder="Banco"
                    aria-label={`Banco del valor ${n + 1}`}
                    className={control}
                  />
                  <input
                    value={v.numeroValor}
                    onChange={(e) => actualizar(v.clave, { numeroValor: e.target.value })}
                    placeholder="Número"
                    aria-label={`Número del cheque del valor ${n + 1}`}
                    className={`${control} cifras`}
                  />
                  <input
                    type="date"
                    value={v.fechaPago}
                    onChange={(e) => actualizar(v.clave, { fechaPago: e.target.value })}
                    aria-label={`Fecha de pago del valor ${n + 1}`}
                    className={control}
                  />
                </div>
              ) : (
                <div className="flex gap-2">
                  <SelectorCuenta
                    cuentas={cuentas}
                    medio={v.medio}
                    moneda={moneda}
                    valor={v.cuentaId}
                    onChange={(cuentaId) => actualizar(v.clave, { cuentaId })}
                    etiqueta={`Cuenta de la que sale el valor ${n + 1}`}
                  />
                  <input
                    value={v.detalle}
                    onChange={(e) => actualizar(v.clave, { detalle: e.target.value })}
                    placeholder="Detalle (opcional: número de operación)"
                    aria-label={`Detalle del valor ${n + 1}`}
                    className={`${control} min-w-0 flex-1`}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setValores((vs) => (vs.length > 1 ? vs.filter((x) => x.clave !== v.clave) : vs))}
                aria-label={`Quitar el valor ${n + 1}`}
                className="grid size-9 place-items-center rounded text-texto-3 hover:bg-error-suave hover:text-error"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-4 py-3">
          <div className="flex gap-2">
            <Boton type="button" onClick={() => setValores((vs) => [...vs, valorVacio('efectivo')])}>
              <Plus aria-hidden className="size-4" /> Otro valor
            </Boton>
            {diferencia.gt(0) && (
              <Boton type="button" onClick={completar}>
                Completar {formatearMonto(diferencia.toFixed(2), simbolo)}
              </Boton>
            )}
          </div>
          <span className="text-sm">
            Entregado: <span className="cifras font-semibold">{formatearMonto(entregado.toFixed(2), simbolo)}</span>
            {liq && !diferencia.abs().lt('0.01') && (
              <span className="ml-2 text-error">
                {diferencia.gt(0) ? 'faltan' : 'sobran'} {formatearMonto(diferencia.abs().toFixed(2), simbolo)}
              </span>
            )}
          </span>
        </div>
      </Panel>

      <Panel className="p-4">
        <label htmlFor="observaciones" className="text-xs font-medium text-texto-2">
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

      <div className="flex justify-end gap-2">
        <BotonEnlace href="/pagos" variante="fantasma">
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando || !listo}>
          {enviando ? 'Emitiendo…' : 'Emitir orden de pago'}
        </Boton>
      </div>
    </form>
  )
}
