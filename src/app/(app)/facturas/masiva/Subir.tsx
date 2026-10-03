'use client'

import { FileSpreadsheet, Upload } from 'lucide-react'
import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton, Panel, Selector } from '@/components/ui'

import { crearLoteAccion, leerPlanillaAccion } from '../automatica'

const TASA: Record<number, number> = { 5: 21, 4: 10.5, 6: 27, 8: 5, 9: 2.5, 3: 0 }
const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export function SubirPlanilla({ puntosVenta }: { puntosVenta: { valor: number; texto: string }[] }) {
  const [vista, leer, leyendo] = useActionState(leerPlanillaAccion, undefined)
  const [autorizar, setAutorizar] = useState(true)
  const [enviar, setEnviar] = useState(true)
  const [pv, setPv] = useState(puntosVenta[0]?.valor ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [armando, empezar] = useTransition()
  const facturas = vista?.facturas ?? []
  const total = facturas.reduce(
    (s, f) => s + f.factura.renglones.reduce((t, r) => t + r.cantidad * r.precioUnitario * (1 + TASA[r.iva] / 100), 0),
    0,
  )

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-5">
        <form action={leer} className="flex flex-wrap items-center gap-3 text-sm">
          <FileSpreadsheet aria-hidden className="size-5 text-texto-3" />
          <input type="file" name="planilla" accept=".xlsx,.csv,text/csv" className="min-w-0 flex-1" required />
          <Boton type="submit" disabled={leyendo}>
            <Upload /> {leyendo ? 'Leyendo…' : 'Leer la planilla'}
          </Boton>
        </form>
        {vista?.error && (
          <div className="mt-3">
            <Aviso>{vista.error}</Aviso>
          </div>
        )}
      </Panel>

      {vista && !vista.error && (
        <Panel className="p-5">
          <h2 className="font-semibold">
            {vista.nombre}: {facturas.length} {facturas.length === 1 ? 'factura' : 'facturas'} por {pesos(total)}
          </h2>
          {!!vista.errores?.length && (
            <div className="mt-3">
              <Aviso tono="aviso">
                {vista.errores.length} con problemas (no se van a armar):
                <ul className="mt-1 list-disc pl-5">
                  {vista.errores.slice(0, 20).map((e) => (
                    <li key={e.fila}>
                      Fila {e.fila}: {e.error}
                    </li>
                  ))}
                </ul>
              </Aviso>
            </div>
          )}
          {!!facturas.length && (
            <>
              <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-borde">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-superficie-2 text-left text-xs text-texto-2">
                    <tr>
                      <th className="px-3 py-2 font-medium">Filas</th>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Detalle</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturas.map((f) => (
                      <tr key={f.filas.join()} className="border-t border-borde">
                        <td className="px-3 py-1.5 text-texto-3 tabular-nums">{f.filas.join(', ')}</td>
                        <td className="px-3 py-1.5">
                          {f.factura.cliente.razonSocial ?? '(del padrón)'}{' '}
                          <span className="text-texto-3">{f.factura.cliente.documento}</span>
                        </td>
                        <td className="px-3 py-1.5 text-texto-2">{f.factura.renglones.map((r) => r.descripcion).join(' · ')}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {pesos(
                            f.factura.renglones.reduce((t, r) => t + r.cantidad * r.precioUnitario * (1 + TASA[r.iva] / 100), 0),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-[220px_1fr]">
                <Selector
                  id="pv"
                  etiqueta="Punto de venta"
                  opciones={puntosVenta}
                  value={pv}
                  onChange={(e) => setPv(Number(e.target.value))}
                />
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-acento"
                      checked={autorizar}
                      onChange={(e) => setAutorizar(e.target.checked)}
                    />
                    Autorizarlas en ARCA (si no, quedan en borrador)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-acento"
                      checked={enviar}
                      disabled={!autorizar}
                      onChange={(e) => setEnviar(e.target.checked)}
                    />
                    Mandárselas a los clientes por email
                  </label>
                </div>
              </div>
              {error && (
                <div className="mt-3">
                  <Aviso>{error}</Aviso>
                </div>
              )}
              <div className="mt-4">
                <Boton
                  variante="primario"
                  disabled={armando || !pv}
                  onClick={() =>
                    empezar(async () => {
                      setError(null)
                      const r = await crearLoteAccion({
                        nombre: vista.nombre ?? 'Planilla',
                        autorizar,
                        enviar: autorizar && enviar,
                        puntoVenta: pv,
                        facturas: facturas.map((f) => f.factura),
                      })
                      if (r?.error) setError(r.error)
                    })
                  }
                >
                  {armando ? 'Armando…' : `Armar ${facturas.length} ${facturas.length === 1 ? 'factura' : 'facturas'}`}
                </Boton>
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  )
}
