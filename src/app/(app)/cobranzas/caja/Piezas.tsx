'use client'

import { Lock } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { DENOMINACIONES } from '@/modulos/tesoreria/denominaciones'

import { cerrarCajaAccion } from './acciones'

const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
const campo = 'h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave'

/**
 * Cierre: se cuentan los billetes (o se escribe el total) y se ve en el
 * momento la diferencia con el efectivo que debería haber.
 */
export function CerrarCaja({ cuentaId, esperado }: { cuentaId: string; esperado: number }) {
  const [estado, accion, enviando] = useActionState(cerrarCajaAccion.bind(null, cuentaId), undefined)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [manual, setManual] = useState<string>('')
  const porBilletes = DENOMINACIONES.reduce((s, d) => s + d * (cantidades[d] ?? 0), 0)
  const contado = manual.trim() ? Number(manual.replace(/\./g, '').replace(',', '.')) || 0 : porBilletes
  const diferencia = Math.round((contado - esperado) * 100) / 100
  return (
    <form action={accion} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Conteo de billetes y monedas</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {DENOMINACIONES.map((d) => (
            <label key={d} className="flex flex-col gap-1 text-xs font-medium text-texto-2">
              <span className="cifras">$ {d.toLocaleString('es-AR')}</span>
              <input
                name={`b_${d}`}
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                value={cantidades[d] ?? ''}
                onChange={(e) => setCantidades((c) => ({ ...c, [d]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
                className={`${campo} cifras`}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Efectivo contado
        <input
          name="contado"
          required
          inputMode="decimal"
          value={manual || (porBilletes ? String(porBilletes) : '')}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Total contado (o usá el conteo de arriba)"
          className={`${campo} cifras text-base font-semibold`}
        />
      </label>
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-superficie-2 p-3 text-sm">
        <div>
          <dt className="text-xs text-texto-2">Esperado</dt>
          <dd className="cifras font-semibold">{pesos(esperado)}</dd>
        </div>
        <div>
          <dt className="text-xs text-texto-2">Contado</dt>
          <dd className="cifras font-semibold">{pesos(contado)}</dd>
        </div>
        <div>
          <dt className="text-xs text-texto-2">Diferencia</dt>
          <dd className={`cifras font-semibold ${diferencia === 0 ? 'text-ok' : 'text-error'}`}>
            {diferencia === 0 ? 'Cuadra ✓' : `${diferencia > 0 ? 'Sobran' : 'Faltan'} ${pesos(Math.abs(diferencia))}`}
          </dd>
        </div>
      </dl>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Observaciones {diferencia !== 0 && <span className="font-normal text-texto-3">(contá qué pasó con la diferencia)</span>}
        <textarea name="observaciones" rows={2} maxLength={500} className={`${campo} h-auto py-2`} />
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando || (!contado && esperado !== 0)}>
        <Lock aria-hidden /> Cerrar caja
      </Boton>
      <p className="text-xs text-texto-3">Si hay diferencia, queda un arqueo con su ajuste y la caja sigue con lo contado.</p>
    </form>
  )
}
