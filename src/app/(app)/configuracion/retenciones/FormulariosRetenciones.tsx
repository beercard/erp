'use client'

import { useActionState } from 'react'

import { activarGananciasAccion, guardarRegimenAccion } from '@/app/(app)/compras/acciones'
import { Aviso, Boton } from '@/components/ui'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

export function ActivarGanancias({ activa, hayRegimenes }: { activa: boolean; hayRegimenes: boolean }) {
  const [estado, accion, enviando] = useActionState(activarGananciasAccion, undefined)
  return (
    <form action={accion} className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activa" defaultChecked={activa} disabled={!hayRegimenes} />
        La empresa retiene Ganancias al pagar (agente de retención, RG 830)
      </label>
      <Boton type="submit" disabled={enviando || !hayRegimenes}>
        {enviando ? 'Grabando…' : 'Guardar'}
      </Boton>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
    </form>
  )
}

export type Regimen = {
  codigo: string
  concepto: string
  alicuotaInscripto: string
  alicuotaNoInscripto: string
  minimoNoSujeto: string
  minimoRetencion: string
  usaEscala: boolean
  activo: boolean
}

const numero = (v: string) => String(Number(v)).replace('.', ',')

/** Alta o modificación de un régimen (el código es la clave). */
export function FormularioRegimen({ regimen }: { regimen?: Regimen }) {
  const [estado, accion, enviando] = useActionState(guardarRegimenAccion, undefined)
  return (
    <form
      action={accion}
      className="grid items-end gap-2 px-4 py-3 md:grid-cols-[80px_minmax(0,1fr)_90px_90px_120px_100px_auto_auto]"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-2">Código</span>
        <input name="codigo" defaultValue={regimen?.codigo} readOnly={!!regimen} className={`${control} cifras`} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-2">Concepto</span>
        <input name="concepto" defaultValue={regimen?.concepto} className={control} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-2">% inscr.</span>
        <input
          name="alicuotaInscripto"
          defaultValue={regimen ? numero(regimen.alicuotaInscripto) : ''}
          inputMode="decimal"
          className={`${control} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-2">% no inscr.</span>
        <input
          name="alicuotaNoInscripto"
          defaultValue={regimen ? numero(regimen.alicuotaNoInscripto) : ''}
          inputMode="decimal"
          className={`${control} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-2">Mínimo no sujeto</span>
        <input
          name="minimoNoSujeto"
          defaultValue={regimen ? numero(regimen.minimoNoSujeto) : '0'}
          inputMode="decimal"
          className={`${control} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-2">Ret. mínima</span>
        <input
          name="minimoRetencion"
          defaultValue={regimen ? numero(regimen.minimoRetencion) : '240'}
          inputMode="decimal"
          className={`${control} cifras`}
        />
      </label>
      <div className="flex flex-col gap-1 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="usaEscala" defaultChecked={regimen?.usaEscala} /> Escala
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="activo" defaultChecked={regimen?.activo ?? true} /> Activo
        </label>
      </div>
      <Boton type="submit" disabled={enviando}>
        {enviando ? '…' : regimen ? 'Guardar' : 'Agregar'}
      </Boton>
      {(estado?.error || estado?.ok) && (
        <div className="md:col-span-8">
          {estado?.error ? <Aviso>{estado.error}</Aviso> : <Aviso tono="ok">{estado.ok}</Aviso>}
        </div>
      )}
    </form>
  )
}
