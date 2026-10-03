'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Aviso, Boton, Campo, Panel, Selector } from '@/components/ui'

import { guardarRecurrenteAccion } from '../automatica'

type Renglon = { descripcion: string; cantidad: string; precioUnitario: string; alicuotaIva: number }
export type DatosRecurrente = {
  terceroId: string
  nombre: string
  cadaMeses: number
  proxima: string
  hasta: string | null
  puntoVenta: number
  concepto: number
  diasVencimiento: number
  renglones: Renglon[]
  observaciones: string | null
  autorizar: boolean
  enviar: boolean
}

const FRECUENCIAS = [
  { valor: 1, texto: 'Todos los meses' },
  { valor: 2, texto: 'Cada 2 meses' },
  { valor: 3, texto: 'Cada 3 meses' },
  { valor: 6, texto: 'Cada 6 meses' },
  { valor: 12, texto: 'Una vez por año' },
]
const IVAS = [
  { valor: 5, texto: '21 %' },
  { valor: 4, texto: '10,5 %' },
  { valor: 6, texto: '27 %' },
  { valor: 8, texto: '5 %' },
  { valor: 9, texto: '2,5 %' },
  { valor: 3, texto: '0 %' },
]
const TASA: Record<number, number> = { 5: 21, 4: 10.5, 6: 27, 8: 5, 9: 2.5, 3: 0 }
const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export function FormularioRecurrente({
  id,
  inicial,
  clientes,
  puntosVenta,
}: {
  id: string | null
  inicial: DatosRecurrente
  clientes: { valor: string; texto: string }[]
  puntosVenta: { valor: number; texto: string }[]
}) {
  const [d, setD] = useState(inicial)
  const [estado, accion, enviando] = useActionState(guardarRecurrenteAccion.bind(null, id), undefined)
  const poner = <K extends keyof DatosRecurrente>(k: K, v: DatosRecurrente[K]) => setD((x) => ({ ...x, [k]: v }))
  const renglon = (i: number, cambio: Partial<Renglon>) =>
    poner(
      'renglones',
      d.renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)),
    )
  const total = d.renglones.reduce(
    (s, r) => s + Number(r.cantidad || 0) * Number(r.precioUnitario || 0) * (1 + TASA[r.alicuotaIva] / 100),
    0,
  )

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="datos" value={JSON.stringify(d)} />
      <Panel className="grid gap-4 p-5 sm:grid-cols-2">
        <Selector
          id="cliente"
          etiqueta="Cliente"
          vacio="Elegí el cliente"
          opciones={clientes}
          value={d.terceroId}
          onChange={(e) => poner('terceroId', e.target.value)}
          required
        />
        <Campo
          id="nombre"
          etiqueta="Nombre (para vos)"
          placeholder="Abono de mantenimiento"
          value={d.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          required
        />
        <Selector
          id="cada"
          etiqueta="Frecuencia"
          opciones={FRECUENCIAS}
          value={d.cadaMeses}
          onChange={(e) => poner('cadaMeses', Number(e.target.value))}
        />
        <Campo
          id="proxima"
          type="date"
          etiqueta="Próxima factura"
          ayuda="Del día 1 al 28. Las siguientes salen el mismo día."
          value={d.proxima}
          onChange={(e) => poner('proxima', e.target.value)}
          required
        />
        <Campo
          id="hasta"
          type="date"
          etiqueta="Hasta (opcional)"
          ayuda="Vacío: sigue hasta que la pauses."
          value={d.hasta ?? ''}
          onChange={(e) => poner('hasta', e.target.value || null)}
        />
        <Selector
          id="pv"
          etiqueta="Punto de venta"
          opciones={puntosVenta}
          value={d.puntoVenta}
          onChange={(e) => poner('puntoVenta', Number(e.target.value))}
        />
        <Selector
          id="concepto"
          etiqueta="Concepto"
          opciones={[
            { valor: 2, texto: 'Servicios' },
            { valor: 1, texto: 'Productos' },
            { valor: 3, texto: 'Productos y servicios' },
          ]}
          value={d.concepto}
          onChange={(e) => poner('concepto', Number(e.target.value))}
        />
        <Campo
          id="vto"
          type="number"
          min={0}
          max={120}
          etiqueta="Días para pagar"
          value={d.diasVencimiento}
          onChange={(e) => poner('diasVencimiento', Number(e.target.value))}
        />
      </Panel>

      <Panel className="p-5">
        <h2 className="mb-1 font-semibold">Renglones</h2>
        <p className="mb-3 text-xs text-texto-3">
          Precios sin IVA. Escribí <code className="rounded bg-superficie-2 px-1">{'{periodo}'}</code> en la descripción y sale el
          mes facturado (por ejemplo, &quot;Abono {'{periodo}'}&quot; → &quot;Abono octubre 2026&quot;).
        </p>
        <div className="flex flex-col gap-2">
          {d.renglones.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_80px_120px_90px_auto] items-end gap-2">
              <Campo
                id={`desc-${i}`}
                etiqueta={i === 0 ? 'Descripción' : ' '}
                value={r.descripcion}
                onChange={(e) => renglon(i, { descripcion: e.target.value })}
                required
              />
              <Campo
                id={`cant-${i}`}
                etiqueta={i === 0 ? 'Cantidad' : ' '}
                inputMode="decimal"
                value={r.cantidad}
                onChange={(e) => renglon(i, { cantidad: e.target.value.replace(',', '.') })}
              />
              <Campo
                id={`precio-${i}`}
                etiqueta={i === 0 ? 'Precio' : ' '}
                inputMode="decimal"
                value={r.precioUnitario}
                onChange={(e) => renglon(i, { precioUnitario: e.target.value.replace(',', '.') })}
              />
              <Selector
                id={`iva-${i}`}
                etiqueta={i === 0 ? 'IVA' : ' '}
                opciones={IVAS}
                value={r.alicuotaIva}
                onChange={(e) => renglon(i, { alicuotaIva: Number(e.target.value) })}
              />
              <Boton
                type="button"
                variante="fantasma"
                aria-label="Quitar el renglón"
                disabled={d.renglones.length === 1}
                onClick={() =>
                  poner(
                    'renglones',
                    d.renglones.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 />
              </Boton>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Boton
            type="button"
            onClick={() =>
              poner('renglones', [...d.renglones, { descripcion: '', cantidad: '1', precioUnitario: '0', alicuotaIva: 5 }])
            }
          >
            <Plus /> Agregar renglón
          </Boton>
          <p className="text-sm">
            Total con IVA: <strong className="tabular-nums">{pesos(total)}</strong>
          </p>
        </div>
      </Panel>

      <Panel className="flex flex-col gap-3 p-5 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 accent-acento"
            checked={d.autorizar}
            onChange={(e) => poner('autorizar', e.target.checked)}
          />
          <span>
            <strong>Autorizarla sola en ARCA.</strong> Si no, queda en borrador para revisarla y autorizarla a mano.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 accent-acento"
            checked={d.enviar}
            disabled={!d.autorizar}
            onChange={(e) => poner('enviar', e.target.checked)}
          />
          <span>
            <strong>Mandársela al cliente por email</strong> con el enlace para verla e imprimirla (al email de su ficha).
          </span>
        </label>
        <Campo
          id="obs"
          etiqueta="Observaciones (opcional, también aceptan {periodo})"
          value={d.observaciones ?? ''}
          onChange={(e) => poner('observaciones', e.target.value || null)}
        />
      </Panel>

      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </form>
  )
}
