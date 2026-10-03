'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Aviso, Boton, Chip, Panel } from '@/components/ui'
import { formatearMonto, normalizarNumero } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'

import { anularValeAccion, entregarValeAccion, rendirValeAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const $ = (n: number | string) => formatearMonto(Number(n).toFixed(2), '$')
const TONO = { abierto: 'aviso', rendido: 'ok', anulado: 'neutro' } as const
const ESTADO = { abierto: 'Sin rendir', rendido: 'Rendido', anulado: 'Anulado' } as const

type Vale = {
  id: string
  numero: number
  persona: string
  fecha: string
  importe: string
  motivo: string | null
  estado: string
  gastado: string | null
  devuelto: string | null
  fechaRendicion: string | null
  gastos: { concepto: string; importe: string; comprobante: string | null }[] | null
  caja: string
  entrego: string | null
}

export function NuevoVale({ cajas, hoy }: { cajas: { id: string; nombre: string }[]; hoy: string }) {
  const [estado, accion, enviando] = useActionState(entregarValeAccion, undefined)
  if (!cajas.length) return <p className="text-sm text-texto-3">Primero creá una caja en Tesorería.</p>
  return (
    <form action={accion} key={estado?.ok} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        A quién
        <input name="persona" required minLength={2} className={control} placeholder="Nombre" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Importe
          <input name="importe" required inputMode="decimal" className={`${control} cifras`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Fecha
          <input type="date" name="fecha" defaultValue={hoy} className={control} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Sale de
        <select name="cuentaId" className={control}>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Para qué
        <input name="motivo" className={control} placeholder="Compras de librería, viáticos…" />
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando}>
        Entregar el vale
      </Boton>
    </form>
  )
}

export function ListaVales({ vales, hoy, puede }: { vales: Vale[]; hoy: string; puede: boolean }) {
  const [rindiendo, setRindiendo] = useState<string | null>(null)
  if (!vales.length) return <Panel className="px-5 py-10 text-center text-sm text-texto-2">No hay vales con este filtro.</Panel>
  return (
    <Panel className="divide-y divide-borde">
      {vales.map((v) => (
        <div key={v.id} className="px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                <span className="cifras text-texto-3">N° {v.numero}</span> · {v.persona}
              </p>
              <p className="text-xs text-texto-3">
                {fechaCorta(v.fecha)} · {v.caja}
                {v.entrego ? ` · entregó ${v.entrego}` : ''}
                {v.motivo ? ` · ${v.motivo}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="cifras font-semibold">{$(v.importe)}</p>
              <Chip tono={TONO[v.estado as keyof typeof TONO]}>{ESTADO[v.estado as keyof typeof ESTADO]}</Chip>
            </div>
          </div>
          {v.estado === 'rendido' && (
            <div className="mt-2 rounded-lg bg-superficie-2 p-3 text-sm">
              <ul className="mb-1">
                {v.gastos?.map((g, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {g.concepto}
                      {g.comprobante && <span className="text-xs text-texto-3"> · {g.comprobante}</span>}
                    </span>
                    <span className="cifras">{$(g.importe)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between border-t border-borde pt-1 text-xs text-texto-2">
                <span>Rendido el {fechaCorta(v.fechaRendicion!)}</span>
                <span className="cifras">
                  {Number(v.devuelto) > 0
                    ? `devolvió ${$(v.devuelto!)}`
                    : Number(v.devuelto) < 0
                      ? `se le reintegró ${$(-Number(v.devuelto))}`
                      : 'justo'}
                </span>
              </p>
            </div>
          )}
          {puede && v.estado === 'abierto' && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setRindiendo(rindiendo === v.id ? null : v.id)}
                className="font-medium text-acento hover:underline"
              >
                Rendir
              </button>
              <form action={anularValeAccion.bind(null, v.id)}>
                <button
                  type="submit"
                  onClick={(e) => {
                    if (!window.confirm(`¿Anular el vale N° ${v.numero}? La plata vuelve a la caja.`)) e.preventDefault()
                  }}
                  className="text-texto-2 hover:text-error"
                >
                  Anular
                </button>
              </form>
            </div>
          )}
          {rindiendo === v.id && <Rendicion vale={v} hoy={hoy} />}
        </div>
      ))}
    </Panel>
  )
}

function Rendicion({ vale, hoy }: { vale: Vale; hoy: string }) {
  const [estado, accion, enviando] = useActionState(rendirValeAccion.bind(null, vale.id), undefined)
  const [filas, setFilas] = useState([{ k: 0, importe: '' }])
  const gastado = filas.reduce((s, f) => s + (Number(normalizarNumero(f.importe)) || 0), 0)
  const resto = Math.round((Number(vale.importe) - gastado) * 100) / 100
  return (
    <form action={accion} className="mt-3 flex flex-col gap-2 rounded-lg border border-borde p-3">
      {filas.map((f, i) => (
        <div key={f.k} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_auto] gap-2">
          <input
            name="concepto"
            required
            placeholder="Concepto (combustible, librería…)"
            aria-label="Concepto"
            className={control}
          />
          <input
            name="importe"
            required
            inputMode="decimal"
            placeholder="Importe"
            aria-label="Importe"
            value={f.importe}
            onChange={(e) => setFilas((l) => l.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)))}
            className={`${control} cifras`}
          />
          <input name="comprobante" placeholder="Comprobante" aria-label="Comprobante" className={control} />
          <button
            type="button"
            aria-label="Quitar el gasto"
            disabled={filas.length === 1}
            onClick={() => setFilas((l) => l.filter((_, j) => j !== i))}
            className="text-texto-3 hover:text-error disabled:opacity-30"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setFilas((l) => [...l, { k: Math.max(...l.map((x) => x.k)) + 1, importe: '' }])}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-acento hover:underline"
      >
        <Plus className="size-3.5" /> Otro gasto
      </button>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Fecha
          <input type="date" name="fecha" defaultValue={hoy} className={control} />
        </label>
        <p className="text-sm">
          Gastó <b className="cifras">{$(gastado)}</b> ·{' '}
          {resto > 0 ? (
            <>
              devuelve <b className="cifras">{$(resto)}</b>
            </>
          ) : resto < 0 ? (
            <>
              se le reintegran <b className="cifras text-error">{$(-resto)}</b>
            </>
          ) : (
            'justo'
          )}
        </p>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando}>
        Rendir el vale
      </Boton>
    </form>
  )
}
