'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useEffect, useState } from 'react'

import { buscarClientes } from '@/app/(app)/comercial/acciones'
import { emitirReciboAccion, pendientesDe } from '@/app/(app)/facturacion/acciones'
import { Buscador } from '@/components/comercial/Buscador'
import { SelectorCuenta, useCuentas } from '@/components/SelectorCuenta'
import { Aviso, Boton, BotonEnlace, Panel } from '@/components/ui'
import { D, formatearMonto, normalizarNumero } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { formatearNumero } from '@/modulos/comercial/formato'
import { MEDIOS } from '@/modulos/facturacion/medios'
import { abreviatura } from '@/modulos/facturacion/tipos'

type Cliente = Awaited<ReturnType<typeof buscarClientes>>[number]
type Pendiente = Awaited<ReturnType<typeof pendientesDe>>[number]
type Opcion = { valor: string; texto: string }

type Valor = {
  clave: string
  medio: keyof typeof MEDIOS
  importe: string
  detalle: string
  banco: string
  numeroValor: string
  fechaPago: string
  cuitLibrador: string
  cuentaId: string
}

const nuevaClave = () => Math.random().toString(36).slice(2)
const valorVacio = (medio: Valor['medio'] = 'transferencia'): Valor => ({
  clave: nuevaClave(),
  medio,
  importe: '',
  detalle: '',
  banco: '',
  numeroValor: '',
  fechaPago: '',
  cuitLibrador: '',
  cuentaId: '',
})
const num = (v: string) => {
  const n = normalizarNumero(v || '0')
  return /^\d+(\.\d+)?$/.test(n) ? new D(n) : new D(0)
}

export function FormularioRecibo({
  cliente,
  hoy,
  puntosVenta,
}: {
  cliente: { id: string; razonSocial: string } | null
  hoy: string
  puntosVenta: Opcion[]
}) {
  const [estado, accion, enviando] = useActionState(emitirReciboAccion, undefined)
  const [tercero, setTercero] = useState(cliente)
  const [deuda, setDeuda] = useState<Pendiente[] | null>(null)
  const [aplicar, setAplicar] = useState<Record<string, string>>({})
  const [valores, setValores] = useState<Valor[]>([valorVacio()])
  const [fecha, setFecha] = useState(hoy)
  const [puntoVenta, setPuntoVenta] = useState(puntosVenta[0]?.valor ?? '1')
  const [observaciones, setObservaciones] = useState('')
  const cuentas = useCuentas()

  useEffect(() => {
    if (!tercero) return
    let vigente = true
    pendientesDe(tercero.id).then((p) => vigente && setDeuda(p))
    return () => {
      vigente = false
    }
  }, [tercero])

  const total = valores.reduce((s, v) => s.plus(num(v.importe)), new D(0))
  const imputado = Object.values(aplicar).reduce((s, v) => s.plus(num(v)), new D(0))
  const aCuenta = total.minus(imputado)

  /** Reparte lo cobrado entre las deudas, de la más vieja a la más nueva. */
  function repartir() {
    let resto = total
    const nuevo: Record<string, string> = {}
    for (const p of deuda ?? []) {
      if (resto.lte(0)) break
      const parte = D.min(resto, new D(p.saldo))
      nuevo[p.id] = parte.toFixed(2)
      resto = resto.minus(parte)
    }
    setAplicar(nuevo)
  }

  const actualizar = (clave: string, cambio: Partial<Valor>) =>
    setValores((vs) => vs.map((v) => (v.clave === clave ? { ...v, ...cambio } : v)))

  const recibo = {
    terceroId: tercero?.id ?? '',
    fecha,
    puntoVenta,
    observaciones,
    valores: valores
      .filter((v) => v.importe)
      .map((v) => ({
        medio: v.medio,
        importe: normalizarNumero(v.importe),
        detalle: v.detalle,
        banco: v.banco,
        numeroValor: v.numeroValor,
        fechaPago: v.fechaPago,
        cuitLibrador: v.cuitLibrador,
        cuentaId: v.cuentaId || null,
      })),
    imputaciones: Object.entries(aplicar)
      .filter(([, v]) => num(v).gt(0))
      .map(([comprobanteId, v]) => ({ comprobanteId, importe: normalizarNumero(v) })),
  }
  const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
  const esCheque = (m: string) => m === 'cheque' || m === 'echeq'

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="recibo" value={JSON.stringify(recibo)} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}

      <Panel className="grid gap-4 p-4 md:grid-cols-4">
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-texto-2">Cliente</span>
          {tercero ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
              <span className="truncate text-sm font-medium">{tercero.razonSocial}</span>
              <button
                type="button"
                onClick={() => {
                  setTercero(null)
                  setDeuda(null)
                  setAplicar({})
                }}
                className="text-xs text-acento hover:underline"
              >
                Cambiar
              </button>
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
          <span className="text-xs font-medium text-texto-2">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Punto de venta</span>
          <select value={puntoVenta} onChange={(e) => setPuntoVenta(e.target.value)} className={control}>
            {puntosVenta.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
      </Panel>

      <Panel>
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Valores recibidos</h2>
        <div className="flex flex-col divide-y divide-borde">
          {valores.map((v, n) => (
            <div key={v.clave} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_140px_minmax(0,1fr)_auto]">
              <select
                value={v.medio}
                onChange={(e) => actualizar(v.clave, { medio: e.target.value as Valor['medio'] })}
                aria-label={`Medio del valor ${n + 1}`}
                className={control}
              >
                {Object.entries(MEDIOS).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={v.importe}
                onChange={(e) => actualizar(v.clave, { importe: e.target.value })}
                inputMode="decimal"
                placeholder="Importe"
                aria-label={`Importe del valor ${n + 1}`}
                className={`${control} cifras text-right`}
              />
              {esCheque(v.medio) ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
                    aria-label={`Número de cheque del valor ${n + 1}`}
                    className={`${control} cifras`}
                  />
                  <input
                    type="date"
                    value={v.fechaPago}
                    onChange={(e) => actualizar(v.clave, { fechaPago: e.target.value })}
                    aria-label={`Fecha de pago del valor ${n + 1}`}
                    className={control}
                  />
                  <input
                    value={v.cuitLibrador}
                    onChange={(e) => actualizar(v.clave, { cuitLibrador: e.target.value })}
                    placeholder="CUIT librador"
                    aria-label={`CUIT del librador del valor ${n + 1}`}
                    className={`${control} cifras`}
                  />
                </div>
              ) : (
                <div className="flex gap-2">
                  <SelectorCuenta
                    cuentas={cuentas}
                    medio={v.medio}
                    moneda="PES"
                    valor={v.cuentaId}
                    onChange={(cuentaId) => actualizar(v.clave, { cuentaId })}
                    etiqueta={`Cuenta donde entra el valor ${n + 1}`}
                  />
                  <input
                    value={v.detalle}
                    onChange={(e) => actualizar(v.clave, { detalle: e.target.value })}
                    placeholder={v.medio.startsWith('retencion') ? 'Número de certificado' : 'Detalle (opcional)'}
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
          <Boton type="button" onClick={() => setValores((vs) => [...vs, valorVacio('efectivo')])}>
            <Plus aria-hidden className="size-4" /> Otro valor
          </Boton>
          <span className="text-sm">
            Total cobrado: <span className="cifras font-semibold">{formatearMonto(total.toFixed(2), '$')}</span>
          </span>
        </div>
      </Panel>

      {tercero && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
            <h2 className="text-sm font-semibold">Qué cancela</h2>
            {deuda && deuda.length > 0 && (
              <button type="button" onClick={repartir} className="text-xs text-acento hover:underline">
                Repartir lo cobrado desde la más vieja
              </button>
            )}
          </div>
          {!deuda ? (
            <p className="px-4 py-4 text-sm text-texto-3">Buscando comprobantes con deuda…</p>
          ) : deuda.length === 0 ? (
            <p className="px-4 py-4 text-sm text-texto-2">El cliente no tiene comprobantes con deuda: el cobro queda a cuenta.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-texto-2">
                    <th className="px-4 py-2 font-medium">Comprobante</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 text-right font-medium">Saldo</th>
                    <th className="px-4 py-2 text-right font-medium">Aplicar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {deuda.map((p) => (
                    <tr key={p.id}>
                      <td className="cifras px-4 py-2">
                        {abreviatura(p.tipo)} {formatearNumero(p.puntoVenta, p.numero ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-texto-2">
                        {fechaCorta(p.fecha)}
                        {p.vencimiento && ` · vence ${fechaCorta(p.vencimiento)}`}
                      </td>
                      <td className="cifras px-4 py-2 text-right">{formatearMonto(p.saldo, '$')}</td>
                      <td className="px-4 py-2">
                        <input
                          value={aplicar[p.id] ?? ''}
                          onChange={(e) => setAplicar((a) => ({ ...a, [p.id]: e.target.value }))}
                          inputMode="decimal"
                          aria-label={`Importe a aplicar a ${formatearNumero(p.puntoVenta, p.numero ?? 0)}`}
                          className="cifras ml-auto block h-8 w-32 rounded border border-borde bg-superficie px-1.5 text-right focus:border-acento"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="cifras flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-borde px-4 py-3 text-sm">
            <div className="flex gap-2">
              <dt className="font-sans text-texto-2">Aplicado</dt>
              <dd>{formatearMonto(imputado.toFixed(2), '$')}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-sans text-texto-2">Queda a cuenta</dt>
              <dd className={aCuenta.lt(0) ? 'text-error' : ''}>{formatearMonto(aCuenta.toFixed(2), '$')}</dd>
            </div>
          </dl>
        </Panel>
      )}

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

      {aCuenta.lt(0) && <Aviso>Se aplica más de lo que se cobró. Bajá algún importe o agregá valores.</Aviso>}
      <div className="flex justify-end gap-2">
        <BotonEnlace href="/cobranzas" variante="fantasma">
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando || !tercero || total.lte(0) || aCuenta.lt(0)}>
          {enviando ? 'Emitiendo…' : 'Emitir recibo'}
        </Boton>
      </div>
    </form>
  )
}
