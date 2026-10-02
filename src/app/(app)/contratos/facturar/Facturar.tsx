'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { Aviso, Boton, Chip, Panel } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import type { Preparado } from '@/modulos/contratos/facturacion'

import { cotizacionAccion, facturarAccion, prepararMesAccion } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'
const n = (v: number) => v.toLocaleString('es-AR')
/** "1452.500000" → "1452,5" */
const aTexto = (v: string) => (v ? String(Number(v)).replace('.', ',') : '')
const listoParaFacturar = (f: Preparado) => !f.facturado && Number(f.calculo.totalPesos) > 0 && f.sinLectura.length === 0

export function Facturar(props: {
  periodo: string
  fecha: string
  cotizacion: string
  puntosVenta: { valor: number; texto: string }[]
}) {
  const [periodo, setPeriodo] = useState(props.periodo)
  const [fecha, setFecha] = useState(props.fecha)
  const [cotizacion, setCotizacion] = useState(aTexto(props.cotizacion))
  const [puntoVenta, setPuntoVenta] = useState(props.puntosVenta[0]?.valor ?? 0)
  const [filas, setFilas] = useState<Preparado[] | null>(null)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string; errores?: string[] }>({})
  const [trabajando, iniciar] = useTransition()

  function calcular() {
    setMensaje({})
    iniciar(async () => {
      const r = await prepararMesAccion(periodo, cotizacion)
      if (!r.ok) return setMensaje({ error: r.error })
      setFilas(r.filas)
      // Se proponen los que tienen lectura nueva de todos sus equipos: el resto se factura cuando llegue.
      setElegidos(new Set(r.filas.filter(listoParaFacturar).map((f) => f.contratoId)))
    })
  }

  function cambiarFecha(f: string) {
    setFecha(f)
    iniciar(async () => {
      const r = await cotizacionAccion(f)
      if (r.ok && r.cotizacion) setCotizacion(aTexto(r.cotizacion.valor))
    })
  }

  function generar() {
    if (!window.confirm(`¿Generar ${elegidos.size} facturas en borrador?`)) return
    iniciar(async () => {
      const r = await facturarAccion({ periodo, contratoIds: [...elegidos], puntoVenta, fecha, cotizacion })
      if (!r.ok) return setMensaje({ error: r.error })
      setMensaje({ ok: `Se generaron ${r.generadas.length} facturas en borrador.`, errores: r.errores })
      const p = await prepararMesAccion(periodo, cotizacion)
      if (p.ok) setFilas(p.filas)
      setElegidos(new Set())
    })
  }

  const visibles = filas ?? []
  const total = visibles.filter((f) => elegidos.has(f.contratoId)).reduce((s, f) => s + Number(f.calculo.totalPesos), 0)
  const todos = visibles.filter((f) => !f.facturado)

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Mes de las lecturas</span>
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha de las facturas</span>
          <input type="date" value={fecha} onChange={(e) => cambiarFecha(e.target.value)} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Dólar BNA</span>
          <input
            value={cotizacion}
            onChange={(e) => setCotizacion(e.target.value)}
            inputMode="decimal"
            className={`${control} cifras w-28`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Punto de venta</span>
          <select value={puntoVenta} onChange={(e) => setPuntoVenta(Number(e.target.value))} className={control}>
            {props.puntosVenta.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.texto}
              </option>
            ))}
          </select>
        </label>
        <Boton onClick={calcular} disabled={trabajando || !cotizacion}>
          {trabajando && !filas ? 'Calculando…' : 'Calcular'}
        </Boton>
      </Panel>

      {mensaje.error && <Aviso>{mensaje.error}</Aviso>}
      {mensaje.ok && (
        <Aviso tono="ok">
          {mensaje.ok}{' '}
          <Link href="/facturas" className="underline">
            Ir a facturas
          </Link>{' '}
          para revisarlas y pedir el CAE.
        </Aviso>
      )}
      {!!mensaje.errores?.length && (
        <Aviso tono="aviso">
          <ul className="list-disc pl-4">
            {mensaje.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {filas && (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Elegir todos"
                    checked={todos.length > 0 && todos.every((f) => elegidos.has(f.contratoId))}
                    onChange={(e) => setElegidos(new Set(e.target.checked ? todos.map((f) => f.contratoId) : []))}
                  />
                </th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 text-right font-medium">Equipos</th>
                <th className="px-3 py-2 text-right font-medium">Copias</th>
                <th className="px-3 py-2 text-right font-medium">Libres</th>
                <th className="px-3 py-2 text-right font-medium">Excedentes</th>
                <th className="px-3 py-2 text-right font-medium">Cargo fijo</th>
                <th className="px-3 py-2 text-right font-medium">Excedente</th>
                <th className="px-3 py-2 text-right font-medium">Neto $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f) => {
                const avisos = [
                  ...(f.sinLectura.length ? [`Sin lectura del mes: ${f.sinLectura.join(', ')}`] : []),
                  ...f.calculo.avisos,
                ]
                return (
                  <tr key={f.contratoId} className={f.facturado ? 'text-texto-3' : ''}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Facturar ${f.cliente}`}
                        disabled={f.facturado}
                        checked={elegidos.has(f.contratoId)}
                        onChange={(e) => {
                          const s = new Set(elegidos)
                          if (e.target.checked) s.add(f.contratoId)
                          else s.delete(f.contratoId)
                          setElegidos(s)
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Link href={`/contratos/${f.contratoId}`} className="font-medium hover:text-acento">
                        {f.cliente}
                      </Link>
                      <span className="ml-2 text-xs text-texto-3">N° {f.numero}</span>
                      {f.facturado && (
                        <span className="ml-2">
                          <Chip tono="ok">Ya facturado</Chip>
                        </span>
                      )}
                      {avisos.map((a) => (
                        <span key={a} className="block text-xs text-aviso">
                          {a}
                        </span>
                      ))}
                    </td>
                    <td className="cifras px-3 py-2 text-right align-top">{f.calculo.equipos}</td>
                    <td className="cifras px-3 py-2 text-right align-top">{n(f.calculo.copias)}</td>
                    <td className="cifras px-3 py-2 text-right align-top">
                      {f.calculo.copiasLibres ? n(f.calculo.copiasLibres) : ''}
                    </td>
                    <td className="cifras px-3 py-2 text-right align-top">
                      {f.calculo.copiasExcedentes ? n(f.calculo.copiasExcedentes) : ''}
                    </td>
                    <td className="cifras px-3 py-2 text-right align-top">
                      {Number(f.calculo.cargoPesos) ? formatearMonto(f.calculo.cargoPesos, '$') : ''}
                    </td>
                    <td className="cifras px-3 py-2 text-right align-top">
                      {Number(f.calculo.excedentePesos) ? formatearMonto(f.calculo.excedentePesos, '$') : ''}
                    </td>
                    <td className="cifras px-3 py-2 text-right align-top font-medium">
                      {formatearMonto(f.calculo.totalPesos, '$')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde p-4">
            <span className="text-sm text-texto-2">
              {elegidos.size} contratos elegidos · neto{' '}
              <span className="cifras font-medium text-texto">{formatearMonto(total.toFixed(2), '$')}</span> + IVA
            </span>
            <Boton variante="primario" onClick={generar} disabled={trabajando || elegidos.size === 0 || !puntoVenta}>
              {trabajando ? 'Generando…' : `Generar ${elegidos.size} facturas en borrador`}
            </Boton>
          </div>
        </Panel>
      )}
    </div>
  )
}
