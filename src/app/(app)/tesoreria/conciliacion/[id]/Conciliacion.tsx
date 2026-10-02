'use client'

import { useActionState, useState } from 'react'

import { Aviso, Boton, Panel } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'

import { conciliarAccion, importarExtractoAccion } from '../../acciones'

type Linea = { id: string; fecha: string; descripcion: string; referencia: string | null; importe: string }
type Movimiento = { origen: string; id: string; fecha: string; importe: string; descripcion: string }

export function SubirExtracto({ cuentaId }: { cuentaId: string }) {
  const [estado, accion, enviando] = useActionState(importarExtractoAccion.bind(null, cuentaId), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-64 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Extracto del home banking (CSV o Excel)</span>
        <input
          type="file"
          name="archivo"
          accept=".csv,.txt,.xlsx"
          required
          className="text-sm file:mr-3 file:rounded-md file:border file:border-borde file:bg-superficie-2 file:px-3 file:py-1.5 file:text-sm"
        />
      </label>
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Leyendo…' : 'Importar extracto'}
      </Boton>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
    </form>
  )
}

/** Conciliación manual: una línea del banco con uno o varios movimientos que sumen lo mismo. */
export function ConciliarAMano({
  cuentaId,
  lineas,
  movimientos,
  simbolo,
}: {
  cuentaId: string
  lineas: Linea[]
  movimientos: Movimiento[]
  simbolo: string
}) {
  const [estado, accion, enviando] = useActionState(conciliarAccion.bind(null, cuentaId), undefined)
  const [linea, setLinea] = useState<string>('')
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const l = lineas.find((x) => x.id === linea)
  const suma = movimientos.filter((m) => elegidos.has(`${m.origen}|${m.id}`)).reduce((s, m) => s + Number(m.importe), 0)
  const cierra = l && Math.abs(suma - Number(l.importe)) < 0.005

  return (
    <form
      action={async (f) => {
        await accion(f)
        setLinea('')
        setElegidos(new Set())
      }}
      className="grid gap-4 xl:grid-cols-2"
    >
      <input type="hidden" name="lineaId" value={linea} />
      {[...elegidos].map((k) => (
        <input key={k} type="hidden" name="movimiento" value={k} />
      ))}
      <Panel className="overflow-x-auto">
        <h3 className="border-b border-borde px-4 py-3 text-sm font-semibold">
          En el banco y no en el sistema ({lineas.length})
        </h3>
        <ul className="max-h-[480px] divide-y divide-borde overflow-y-auto text-sm">
          {lineas.length === 0 && <li className="px-4 py-4 text-texto-2">Nada pendiente.</li>}
          {lineas.map((x) => (
            <li key={x.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 px-4 py-2 ${linea === x.id ? 'bg-acento-suave' : 'hover:bg-superficie-2'}`}
              >
                <input type="radio" name="linea" checked={linea === x.id} onChange={() => setLinea(x.id)} className="mt-1" />
                <span className="flex-1">
                  <span className="block">{x.descripcion}</span>
                  <span className="block text-xs text-texto-3">
                    {fechaCorta(x.fecha)}
                    {x.referencia && ` · ${x.referencia}`}
                  </span>
                </span>
                <span className={`cifras ${Number(x.importe) < 0 ? 'text-error' : ''}`}>
                  {formatearMonto(x.importe, simbolo)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="overflow-x-auto">
        <h3 className="border-b border-borde px-4 py-3 text-sm font-semibold">
          En el sistema y no en el banco ({movimientos.length})
        </h3>
        <ul className="max-h-[480px] divide-y divide-borde overflow-y-auto text-sm">
          {movimientos.length === 0 && <li className="px-4 py-4 text-texto-2">Nada pendiente.</li>}
          {movimientos.map((m) => {
            const k = `${m.origen}|${m.id}`
            return (
              <li key={k}>
                <label
                  className={`flex cursor-pointer items-start gap-3 px-4 py-2 ${elegidos.has(k) ? 'bg-acento-suave' : 'hover:bg-superficie-2'}`}
                >
                  <input
                    type="checkbox"
                    checked={elegidos.has(k)}
                    onChange={(e) =>
                      setElegidos((s) => {
                        const n = new Set(s)
                        if (e.target.checked) n.add(k)
                        else n.delete(k)
                        return n
                      })
                    }
                    className="mt-1"
                  />
                  <span className="flex-1">
                    <span className="block">{m.descripcion}</span>
                    <span className="block text-xs text-texto-3">{fechaCorta(m.fecha)}</span>
                  </span>
                  <span className={`cifras ${Number(m.importe) < 0 ? 'text-error' : ''}`}>
                    {formatearMonto(m.importe, simbolo)}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </Panel>
      <div className="flex flex-wrap items-center gap-3 xl:col-span-2">
        <Boton type="submit" variante="primario" disabled={enviando || !cierra}>
          {enviando ? 'Conciliando…' : 'Conciliar lo elegido'}
        </Boton>
        {l && (
          <span className={`cifras text-sm ${cierra ? 'text-ok' : 'text-texto-2'}`}>
            Banco {formatearMonto(l.importe, simbolo)} · elegido {formatearMonto(suma.toFixed(2), simbolo)}
          </span>
        )}
        <span className="text-xs text-texto-3">
          Si un gasto o un débito del banco no está en el sistema, cargalo como movimiento y después concilialo.
        </span>
        {estado?.error && <Aviso>{estado.error}</Aviso>}
      </div>
    </form>
  )
}
