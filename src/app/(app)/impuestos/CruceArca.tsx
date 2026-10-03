'use client'

import { FileUp } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton, Chip } from '@/components/ui'

import { cruzarArcaAccion, registrarFaltantesIvaAccion, type EstadoCruce } from './acciones'
import { pesos } from './periodo'

const nro = (pv: number, n: number) => `${String(pv).padStart(5, '0')}-${String(n).padStart(8, '0')}`
const fecha = (iso: string) => iso.split('-').reverse().join('/')

/** Cruce del libro de compras del mes con "Mis Comprobantes Recibidos" de ARCA. */
export function CruceArca({ periodo, puedeRegistrar, cerrado }: { periodo: string; puedeRegistrar: boolean; cerrado: boolean }) {
  const [leido, accion, leyendo] = useActionState(cruzarArcaAccion.bind(null, periodo), undefined)
  const [despues, setDespues] = useState<EstadoCruce>(undefined)
  const [registrando, iniciar] = useTransition()
  const e = despues ?? leido
  const r = e && 'cruce' in e ? e : null
  const c = r?.cruce

  return (
    <div className="flex flex-col gap-3 p-4">
      <form action={(fd) => (setDespues(undefined), accion(fd))} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="file"
          name="archivo"
          accept=".csv,.xlsx,.zip"
          required
          className="max-w-full text-sm file:mr-2 file:h-9 file:rounded-md file:border file:border-borde file:bg-superficie file:px-3 file:text-sm"
        />
        <Boton type="submit" disabled={leyendo}>
          <FileUp aria-hidden className="size-4" /> {leyendo ? 'Cruzando…' : 'Cruzar'}
        </Boton>
      </form>
      <p className="text-xs text-texto-2">
        En ARCA: Mis Comprobantes › Recibidos, con las fechas del mes, y bajalo en Excel o CSV. El Portal IVA viene precargado con
        eso: acá ves antes lo que no coincide.
      </p>
      {e && 'error' in e && <Aviso>{e.error}</Aviso>}
      {c && (
        <>
          {r.registrados !== undefined && <Aviso tono="ok">Se registraron {r.registrados} comprobantes.</Aviso>}
          {r.avisos.length > 0 && <Aviso tono="aviso">{r.avisos.slice(0, 5).join(' ')}</Aviso>}
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
            {[
              { t: 'Coinciden', v: String(c.coinciden), tono: 'ok' },
              {
                t: 'Faltan cargar',
                v: `${c.faltan.length}${c.creditoSinComputar ? ` · IVA ${pesos(c.creditoSinComputar)}` : ''}`,
                tono: c.faltan.length ? 'error' : 'ok',
              },
              { t: 'Con diferencias', v: String(c.diferencias.length), tono: c.diferencias.length ? 'error' : 'ok' },
              { t: 'Solo en el sistema', v: String(c.soloEnSistema.length), tono: c.soloEnSistema.length ? 'aviso' : 'ok' },
              { t: 'En otro período', v: String(c.otroPeriodo.length), tono: 'neutro' },
            ].map((x) => (
              <div key={x.t} className="rounded-md border border-borde p-2">
                <p className="text-xs text-texto-2">{x.t}</p>
                <p className="cifras font-semibold">
                  <Chip tono={x.tono as 'ok' | 'error' | 'aviso' | 'neutro'}>{x.v}</Chip>
                </p>
              </div>
            ))}
          </div>
          {c.fueraDelMes > 0 && (
            <p className="text-xs text-texto-3">{c.fueraDelMes} comprobantes del archivo son de otro mes y no se cruzaron.</p>
          )}

          {c.faltan.length > 0 && (
            <section>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Faltan cargar (ARCA los tiene)</h3>
                {puedeRegistrar && !cerrado && (
                  <Boton
                    type="button"
                    variante="primario"
                    disabled={registrando}
                    onClick={() => iniciar(async () => setDespues(await registrarFaltantesIvaAccion(periodo, r.filas)))}
                    className="h-8 px-2 text-xs"
                  >
                    {registrando ? 'Registrando…' : `Registrar los ${c.faltan.length} que faltan`}
                  </Boton>
                )}
              </div>
              <ul className="divide-y divide-borde rounded-md border border-borde text-sm">
                {c.faltan.slice(0, 50).map((f) => (
                  <li
                    key={`${f.cuit}${f.tipo}${f.puntoVenta}${f.numero}`}
                    className="flex flex-wrap justify-between gap-2 px-3 py-1.5"
                  >
                    <span>
                      {fecha(f.fecha)} · {f.nombre || f.cuit} · <span className="cifras">{nro(f.puntoVenta, f.numero)}</span>
                      {f.avisos.length > 0 && <span className="block text-xs text-aviso">{f.avisos[0]} (cargalo a mano)</span>}
                    </span>
                    <span className="cifras">
                      {pesos(Number(f.total))}
                      {f.creditoFiscal ? <span className="ml-2 text-xs text-texto-3">IVA {pesos(f.creditoFiscal)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {c.diferencias.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Con diferencias contra ARCA</h3>
              <ul className="divide-y divide-borde rounded-md border border-borde text-sm">
                {c.diferencias.map((d) => (
                  <li key={d.compraId} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
                    <Link href={`/compras/${d.compraId}`} className="hover:underline">
                      {fecha(d.fila.fecha)} · {d.fila.nombre} ·{' '}
                      <span className="cifras">{nro(d.fila.puntoVenta, d.fila.numero)}</span>
                    </Link>
                    <span className="cifras text-xs">
                      Total {pesos(d.totalSistema)} (ARCA {pesos(d.totalArca)}) · IVA {pesos(d.ivaSistema)} (ARCA{' '}
                      {pesos(d.ivaArca)})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {c.soloEnSistema.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Cargados en el período que ARCA no informa</h3>
              <p className="mb-1 text-xs text-texto-2">
                Revisá el número, el tipo o el CUIT del proveedor: si no está en ARCA, el crédito fiscal no vale.
              </p>
              <ul className="divide-y divide-borde rounded-md border border-borde text-sm">
                {c.soloEnSistema.map((x) => (
                  <li key={x.id} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
                    <Link href={`/compras/${x.id}`} className="hover:underline">
                      {fecha(x.fecha)} · {x.proveedor} · {x.letra} <span className="cifras">{nro(x.puntoVenta, x.numero)}</span>
                    </Link>
                    <span className="cifras">{pesos(Number(x.total))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {c.otroPeriodo.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-texto-2">{c.otroPeriodo.length} cargados para otro período de IVA</summary>
              <ul className="mt-1 divide-y divide-borde rounded-md border border-borde">
                {c.otroPeriodo.map((x) => (
                  <li key={x.compraId} className="px-3 py-1.5">
                    <Link href={`/compras/${x.compraId}`} className="hover:underline">
                      {x.fila.nombre} · <span className="cifras">{nro(x.fila.puntoVenta, x.fila.numero)}</span>
                    </Link>{' '}
                    <span className="text-xs text-texto-3">se computa en {x.periodoIva.split('-').reverse().join('/')}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
