'use client'

import { useActionState } from 'react'

import { Boton, Chip, Panel } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import type { PrecioDeLista } from '@/modulos/maestros/articulo'

import { fijarPrecioAccion, quitarPrecioEspecialAccion } from './acciones'

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$', '060': '€' }

function FilaBase({
  articuloId,
  p,
  hoy,
  soloLectura,
}: {
  articuloId: string
  p: PrecioDeLista
  hoy: string
  soloLectura: boolean
}) {
  const [estado, accion, enviando] = useActionState(fijarPrecioAccion.bind(null, articuloId, p.listaId), undefined)
  const simbolo = SIMBOLO[p.moneda] ?? p.moneda
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{p.lista}</span>
        <span className="cifras text-base font-medium">
          {p.vigente ? formatearMonto(p.vigente, simbolo) : <span className="text-sm text-texto-3">Sin precio</span>}
        </span>
      </div>
      {p.desde && <p className="text-xs text-texto-3">Desde el {fechaCorta(p.desde)}</p>}
      {p.programado && (
        <p className="mt-1">
          <Chip tono="info">
            Pasa a {formatearMonto(p.programado.precio, SIMBOLO[p.programado.moneda] ?? p.programado.moneda)} el{' '}
            {fechaCorta(p.programado.desde)}
          </Chip>
        </p>
      )}
      {!soloLectura && (
        <form action={accion} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-texto-2">Nuevo precio</span>
            <input
              name="precio"
              inputMode="decimal"
              required
              className="cifras h-8 w-full min-w-24 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm focus:border-acento"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-texto-2">Moneda</span>
            <select
              name="moneda"
              defaultValue={p.moneda}
              className="h-8 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-1 text-sm"
            >
              <option value="PES">$</option>
              <option value="DOL">US$</option>
              <option value="060">€</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-texto-2">Rige desde</span>
            <input
              name="desde"
              type="date"
              defaultValue={hoy}
              required
              className="h-8 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm focus:border-acento"
            />
          </label>
          <Boton type="submit" disabled={enviando} className="h-8">
            {enviando ? 'Grabando…' : 'Actualizar'}
          </Boton>
        </form>
      )}
      {estado?.error && <p className="mt-1 text-xs text-error">{estado.error}</p>}
      {estado?.ok && <p className="mt-1 text-xs text-ok">Precio actualizado.</p>}
      {p.historial.length > 1 && (
        <details className="mt-2 text-xs text-texto-2">
          <summary className="cursor-pointer text-texto-3">Precios anteriores</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {p.historial.slice(1).map((h) => (
              <li key={h.desde} className="cifras flex justify-between">
                <span>{fechaCorta(h.desde)}</span>
                <span>{formatearMonto(h.precio, SIMBOLO[h.moneda] ?? h.moneda)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

/**
 * Lista calculada: muestra el precio que resulta de su base, o el precio
 * especial del artículo si tiene uno (reemplaza al calculado).
 */
function FilaDerivada({
  articuloId,
  p,
  hoy,
  soloLectura,
}: {
  articuloId: string
  p: PrecioDeLista
  hoy: string
  soloLectura: boolean
}) {
  const [estado, accion, enviando] = useActionState(fijarPrecioAccion.bind(null, articuloId, p.listaId), undefined)
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm">{p.lista}</span>
          <span className="block text-xs text-texto-3">
            {p.especial ? (
              <Chip tono="aviso">Precio especial</Chip>
            ) : (
              <>
                {p.base} {Number(p.porcentaje) >= 0 ? '+' : '−'} {Math.abs(Number(p.porcentaje)).toLocaleString('es-AR')} %
              </>
            )}
          </span>
        </span>
        <span className="cifras text-sm whitespace-nowrap">
          {p.vigente ? formatearMonto(p.vigente, SIMBOLO[p.moneda] ?? p.moneda) : <span className="text-texto-3">—</span>}
        </span>
      </div>
      {!soloLectura &&
        (p.especial ? (
          <form action={quitarPrecioEspecialAccion.bind(null, articuloId, p.listaId)} className="mt-1">
            <button type="submit" className="text-xs font-medium text-acento hover:underline">
              Quitar el precio especial y volver al calculado
            </button>
          </form>
        ) : (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-texto-3">Poner un precio especial</summary>
            <form action={accion} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="desde" value={hoy} />
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-medium text-texto-2">Precio</span>
                <input
                  name="precio"
                  inputMode="decimal"
                  required
                  className="cifras h-8 w-full rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm focus:border-acento"
                />
              </label>
              <select
                name="moneda"
                defaultValue={p.moneda}
                aria-label="Moneda"
                className="h-8 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-1 text-sm"
              >
                <option value="PES">$</option>
                <option value="DOL">US$</option>
                <option value="060">€</option>
              </select>
              <Boton type="submit" disabled={enviando} className="h-8">
                Grabar
              </Boton>
            </form>
            {estado?.error && <p className="mt-1 text-error">{estado.error}</p>}
          </details>
        ))}
    </li>
  )
}

export function PreciosArticulo({
  articuloId,
  precios,
  hoy,
  soloLectura = false,
}: {
  articuloId: string
  precios: PrecioDeLista[]
  hoy: string
  soloLectura?: boolean
}) {
  const bases = precios.filter((p) => !p.derivada)
  const derivadas = precios.filter((p) => p.derivada)
  return (
    <Panel>
      <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Precios</h2>
      <ul className="divide-y divide-borde">
        {bases.map((p) => (
          <FilaBase key={p.listaId} articuloId={articuloId} p={p} hoy={hoy} soloLectura={soloLectura} />
        ))}
      </ul>
      {derivadas.length > 0 && (
        <>
          <h3 className="border-y border-borde bg-superficie-2 px-4 py-2 text-xs font-semibold text-texto-2">
            Listas calculadas
          </h3>
          <ul className="divide-y divide-borde">
            {derivadas.map((p) => (
              <FilaDerivada key={p.listaId} articuloId={articuloId} p={p} hoy={hoy} soloLectura={soloLectura} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
