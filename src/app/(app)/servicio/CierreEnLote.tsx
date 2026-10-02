'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { Aviso, Boton, Chip } from '@/components/ui'

import { cerrarEnLoteAccion } from './acciones'

type Orden = {
  id: string
  numero: number
  cliente: string
  tecnico: string | null
  tipoOrden: string | null
  falla: string
  cierreTecnico: string | null
  informada: Date | null
}

const PROPUESTA: Record<string, { texto: string; tono: 'ok' | 'aviso' | 'error' }> = {
  ok: { texto: 'Propone OK', tono: 'ok' },
  desvio: { texto: 'Propone desvío', tono: 'aviso' },
  no_cumplida: { texto: 'Propone no cumplida', tono: 'error' },
}

const fecha = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short' }) : '—'

/**
 * Revisión en lote de los informes: se marcan las órdenes y se cierran todas
 * juntas, cada una como la propuso el técnico (o todas OK). Para revisar una
 * en detalle, se abre desde su número.
 */
export function CierreEnLote({ ordenes, total }: { ordenes: Orden[]; total: number }) {
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [modo, setModo] = useState<'propuesto' | 'ok'>('propuesto')
  const [avisar, setAvisar] = useState(false)
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof cerrarEnLoteAccion>> | null>(null)
  const [cerrando, iniciar] = useTransition()
  const todas = elegidas.size === ordenes.length && ordenes.length > 0
  const alternar = (id: string) =>
    setElegidas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const cerrar = () =>
    iniciar(async () => {
      const r = await cerrarEnLoteAccion([...elegidas], modo, avisar)
      setResultado(r)
      if (r.ok) setElegidas(new Set())
    })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-borde bg-superficie p-3 text-sm">
        <span className="font-medium">{elegidas.size ? `${elegidas.size} elegidas` : 'Marcá las órdenes revisadas'}</span>
        <label className="flex items-center gap-1">
          <input type="radio" name="modo" checked={modo === 'propuesto'} onChange={() => setModo('propuesto')} />
          Cerrar como propuso el técnico
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="modo" checked={modo === 'ok'} onChange={() => setModo('ok')} />
          Todas OK
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
          Mandar el resumen a cada cliente
        </label>
        <Boton type="button" variante="primario" disabled={!elegidas.size || cerrando} onClick={cerrar} className="ml-auto">
          {cerrando ? 'Cerrando…' : `Cerrar ${elegidas.size || ''}`.trim()}
        </Boton>
      </div>
      {total > ordenes.length && (
        <p className="text-xs text-texto-2">
          Se ven las {ordenes.length} más antiguas de {total}: al cerrarlas aparecen las siguientes.
        </p>
      )}
      {resultado && !resultado.ok && <Aviso>{resultado.error}</Aviso>}
      {resultado?.ok && (
        <Aviso tono={resultado.omitidas.length ? 'aviso' : 'ok'}>
          {resultado.cerradas.length} órdenes cerradas
          {resultado.avisos ? `; ${resultado.avisos} resúmenes en camino a los clientes` : ''}.
          {resultado.omitidas.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {resultado.omitidas.map((o) => (
                <li key={o.id}>
                  {o.numero ? `N° ${o.numero}` : 'Una orden'}: {o.motivo}
                </li>
              ))}
            </ul>
          )}
        </Aviso>
      )}
      <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-borde text-left text-xs text-texto-2">
            <tr>
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Elegir todas"
                  checked={todas}
                  onChange={() => setElegidas(todas ? new Set() : new Set(ordenes.map((o) => o.id)))}
                />
              </th>
              <th className="px-4 py-2 font-medium">N°</th>
              <th className="px-4 py-2 font-medium">Cliente y pedido</th>
              <th className="px-4 py-2 font-medium">Técnico</th>
              <th className="px-4 py-2 font-medium">Informe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {ordenes.map((o) => {
              const p = PROPUESTA[o.cierreTecnico ?? 'ok'] ?? PROPUESTA.ok
              return (
                <tr key={o.id} className={elegidas.has(o.id) ? 'bg-acento-suave/40' : ''}>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Elegir la orden ${o.numero}`}
                      checked={elegidas.has(o.id)}
                      onChange={() => alternar(o.id)}
                    />
                  </td>
                  <td className="cifras px-4 py-2">
                    <Link href={`/servicio/${o.id}`} className="text-acento hover:underline">
                      {o.numero}
                    </Link>
                  </td>
                  <td className="max-w-96 px-4 py-2">
                    <span className="block font-medium">{o.cliente}</span>
                    <span className="line-clamp-1 text-xs text-texto-2">
                      {o.tipoOrden ? `${o.tipoOrden} · ` : ''}
                      {o.falla}
                    </span>
                  </td>
                  <td className="px-4 py-2">{o.tecnico ?? '—'}</td>
                  <td className="px-4 py-2">
                    <Chip tono={p.tono}>{o.cierreTecnico ? p.texto : 'Sin propuesta (OK)'}</Chip>
                    <span className="block text-xs text-texto-3">{fecha(o.informada)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
