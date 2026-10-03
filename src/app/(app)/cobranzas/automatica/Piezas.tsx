'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'

import { configurarAccion, generarInteresesAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'

type Config = {
  recordatorios: boolean
  diasAntes: number
  etapas: number[]
  porCorreo: boolean
  porWhatsapp: boolean
  tasaMensual: string | null
  diasGracia: number
  minimoInteres: string
}

export function Configuracion({ c }: { c: Config }) {
  const [estado, accion, enviando] = useActionState(configurarAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="recordatorios" defaultChecked={c.recordatorios} className="mt-0.5 accent-acento" />
        <span>
          <b>Mandar recordatorios solos</b>
          <span className="block text-xs text-texto-2">Una vuelta por día, desde las 9, con el estado de cuenta adjunto.</span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Avisar antes (días)
          <input name="diasAntes" type="number" min={0} max={30} defaultValue={c.diasAntes} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Después del vencimiento (días)
          <input name="etapas" defaultValue={c.etapas.join(', ')} className={control} placeholder="1, 7, 15, 30" />
        </label>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="porCorreo" defaultChecked={c.porCorreo} className="accent-acento" /> Por correo
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="porWhatsapp" defaultChecked={c.porWhatsapp} className="accent-acento" /> Por WhatsApp
        </label>
      </div>
      <p className="text-xs text-texto-3">Los últimos recordatorios (15 días o más) van con tono de reclamo.</p>
      <h3 className="mt-2 font-semibold">Intereses por mora</h3>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          % mensual
          <input
            name="tasaMensual"
            inputMode="decimal"
            defaultValue={c.tasaMensual?.replace('.', ',') ?? ''}
            placeholder="Sin intereses"
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Días de gracia
          <input name="diasGracia" type="number" min={0} defaultValue={c.diasGracia} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Mínimo $
          <input name="minimoInteres" inputMode="decimal" defaultValue={c.minimoInteres.replace('.', ',')} className={control} />
        </label>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <Boton type="submit" disabled={enviando}>
        Guardar
      </Boton>
    </form>
  )
}

type Cliente = {
  terceroId: string
  cliente: string
  total: string
  renglones: { comprobante: string; dias: number; importe: string }[]
}

export function Intereses({ clientes, puntosVenta }: { clientes: Cliente[]; puntosVenta: { numero: number; nombre: string }[] }) {
  const [estado, accion, enviando] = useActionState(generarInteresesAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3">
      <ul className="divide-y divide-borde text-sm">
        {clientes.map((c) => (
          <li key={c.terceroId} className="py-2">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="cliente" value={c.terceroId} defaultChecked className="mt-1 accent-acento" />
              <span className="flex-1">
                <span className="flex justify-between gap-2 font-medium">
                  {c.cliente} <span className="cifras">{formatearMonto(c.total, '$')}</span>
                </span>
                <span className="block text-xs text-texto-3">
                  {c.renglones.map((r) => `${r.comprobante}: ${r.dias} días`).join(' · ')}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Punto de venta
          <select name="puntoVenta" className={control}>
            {puntosVenta.map((p) => (
              <option key={p.numero} value={p.numero}>
                {String(p.numero).padStart(4, '0')} · {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <Boton type="submit" variante="primario" disabled={enviando || !puntosVenta.length}>
          Armar notas de débito (borrador)
        </Boton>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <p className="text-xs text-texto-3">Quedan en borrador: revisalas y autorizalas en ARCA desde Facturas.</p>
    </form>
  )
}
