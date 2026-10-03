'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { Aviso, Boton, Chip, Panel } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import type { Cheque } from '@/modulos/tesoreria/cheques'
import { ESTADOS_CHEQUE } from '@/modulos/tesoreria/medios'

import { anularDepositoAccion, canjearAccion, depositarAccion, rechazarAccion } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const TONO = {
  cartera: 'info',
  depositado: 'ok',
  canjeado: 'ok',
  entregado: 'neutro',
  rechazado: 'error',
  anulado: 'neutro',
} as const

export function Cheques({
  cheques,
  bancos,
  fondos,
  hoy,
  puede,
}: {
  cheques: Cheque[]
  bancos: { id: string; nombre: string }[]
  fondos: { id: string; nombre: string }[]
  hoy: string
  puede: boolean
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [modo, setModo] = useState<'depositar' | 'canjear'>('depositar')
  const [estadoDeposito, depositar, depositando] = useActionState(depositarAccion, undefined)
  const [estadoCanje, canjear, canjeando] = useActionState(canjearAccion, undefined)
  const estado = modo === 'depositar' ? estadoDeposito : estadoCanje
  const [rechazando, setRechazando] = useState<string | null>(null)
  const total = cheques.filter((c) => elegidos.has(c.id)).reduce((s, c) => s + Number(c.importe), 0)
  const enCartera = cheques.filter((c) => c.estado === 'cartera')

  return (
    <div className="flex flex-col gap-4">
      {puede && enCartera.length > 0 && (
        <Panel className="p-4">
          <div role="tablist" aria-label="Qué hacer con los cheques elegidos" className="mb-3 flex gap-1.5">
            {(['depositar', 'canjear'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className="inline-flex h-8 items-center rounded-full border border-borde px-3 text-[13px] font-medium text-texto-2 aria-selected:border-acento aria-selected:bg-acento-suave aria-selected:text-acento"
              >
                {m === 'depositar' ? 'Depositar en el banco' : 'Canjear por fondos'}
              </button>
            ))}
          </div>
          {modo === 'depositar' ? (
            <form action={depositar} className="flex flex-wrap items-end gap-3">
              {[...elegidos].map((id) => (
                <input key={id} type="hidden" name="cheque" value={id} />
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">Depositar en</span>
                <select name="cuentaId" className={control} required>
                  {bancos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">Fecha</span>
                <input type="date" name="fecha" defaultValue={hoy} className={control} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">Boleta</span>
                <input name="comprobante" className={`${control} cifras w-32`} />
              </label>
              <Boton type="submit" variante="primario" disabled={depositando || !elegidos.size || !bancos.length}>
                {depositando ? 'Depositando…' : `Depositar ${elegidos.size || ''} ${elegidos.size === 1 ? 'cheque' : 'cheques'}`}
                {elegidos.size > 0 && ` (${formatearMonto(total.toFixed(2), '$')})`}
              </Boton>
            </form>
          ) : (
            <form action={canjear} className="flex flex-wrap items-end gap-3">
              {[...elegidos].map((id) => (
                <input key={id} type="hidden" name="cheque" value={id} />
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">A quién</span>
                <input name="entidad" required placeholder="Financiera, mutual, comercio…" className={`${control} w-52`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">Entra en</span>
                <select name="cuentaId" className={control} required>
                  {fondos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">Recibido</span>
                <input
                  name="neto"
                  required
                  inputMode="decimal"
                  key={total}
                  defaultValue={total ? total.toFixed(2).replace('.', ',') : ''}
                  className={`${control} cifras w-32`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">Fecha</span>
                <input type="date" name="fecha" defaultValue={hoy} className={control} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-texto-2">Comprobante</span>
                <input name="comprobante" className={`${control} cifras w-32`} />
              </label>
              <Boton type="submit" variante="primario" disabled={canjeando || !elegidos.size || !fondos.length}>
                {canjeando ? 'Canjeando…' : `Canjear ${elegidos.size || ''} ${elegidos.size === 1 ? 'cheque' : 'cheques'}`}
                {elegidos.size > 0 && ` (${formatearMonto(total.toFixed(2), '$')})`}
              </Boton>
              <p className="w-full text-xs text-texto-3">
                La diferencia entre los cheques y lo recibido queda como costo del canje.
              </p>
            </form>
          )}
          {modo === 'depositar' && !bancos.length && (
            <p className="mt-2 text-xs text-texto-3">Primero creá una cuenta bancaria en pesos.</p>
          )}
          {estado?.error && (
            <div className="mt-3">
              <Aviso>{estado.error}</Aviso>
            </div>
          )}
          {estado?.ok && (
            <div className="mt-3">
              <Aviso tono="ok">{estado.ok}</Aviso>
            </div>
          )}
        </Panel>
      )}

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Cheque</th>
              <th className="px-3 py-2 font-medium">Cobro</th>
              <th className="px-3 py-2 font-medium">Fecha de pago</th>
              <th className="px-3 py-2 text-right font-medium">Importe</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {cheques.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-texto-2">
                  No hay cheques con este filtro.
                </td>
              </tr>
            )}
            {cheques.map((c) => {
              const vencido = c.fechaPago && c.fechaPago < hoy && c.estado === 'cartera'
              return (
                <tr key={c.id} className="align-top">
                  <td className="px-3 py-2">
                    {c.estado === 'cartera' && puede && (
                      <input
                        type="checkbox"
                        aria-label={`Elegir el cheque ${c.numeroValor}`}
                        checked={elegidos.has(c.id)}
                        onChange={(e) =>
                          setElegidos((s) => {
                            const n = new Set(s)
                            if (e.target.checked) n.add(c.id)
                            else n.delete(c.id)
                            return n
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{c.medio === 'echeq' ? 'ECHEQ' : 'Cheque'}</span> {c.banco}{' '}
                    <span className="cifras">N° {c.numeroValor}</span>
                    {c.cuitLibrador && <span className="cifras block text-xs text-texto-3">Librador {c.cuitLibrador}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/cobranzas/${c.reciboId}`} className="hover:text-acento">
                      {c.cliente}
                    </Link>
                    <span className="block text-xs text-texto-3">{fechaCorta(c.fechaRecibo)}</span>
                  </td>
                  <td className={`px-3 py-2 ${vencido ? 'text-aviso' : 'text-texto-2'}`}>
                    {c.fechaPago ? fechaCorta(c.fechaPago) : '—'}
                    {vencido && <span className="block text-xs">ya se puede depositar</span>}
                  </td>
                  <td className="cifras px-3 py-2 text-right">{formatearMonto(c.importe, '$')}</td>
                  <td className="px-3 py-2">
                    <Chip tono={TONO[c.estado]}>{ESTADOS_CHEQUE[c.estado]}</Chip>
                    {c.destino && <span className="block text-xs text-texto-3">{c.destino}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {puede && (c.estado === 'depositado' || c.estado === 'canjeado') && (
                      <form action={anularDepositoAccion.bind(null, c.id)} className="inline">
                        <button type="submit" className="mr-3 text-xs text-texto-2 hover:text-acento">
                          {c.estado === 'canjeado' ? 'Deshacer canje' : 'Deshacer depósito'}
                        </button>
                      </form>
                    )}
                    {puede && ['cartera', 'depositado', 'canjeado', 'entregado'].includes(c.estado) && (
                      <button
                        type="button"
                        onClick={() => setRechazando(rechazando === c.id ? null : c.id)}
                        className="text-xs text-error hover:underline"
                      >
                        Rechazado
                      </button>
                    )}
                    {rechazando === c.id && <Rechazo cheque={c} hoy={hoy} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

function Rechazo({ cheque, hoy }: { cheque: Cheque; hoy: string }) {
  const [estado, accion, enviando] = useActionState(rechazarAccion.bind(null, cheque.id), undefined)
  return (
    <form action={accion} className="mt-2 flex w-72 flex-col gap-2 rounded-md border border-borde bg-superficie-2 p-3 text-left">
      <p className="text-xs text-texto-2">
        {cheque.estado === 'depositado'
          ? 'El banco lo debita. La deuda vuelve al cliente con los gastos.'
          : cheque.estado === 'canjeado'
            ? 'Quien lo canjeó lo devuelve y se debita de la cuenta. La deuda vuelve al cliente con los gastos.'
            : cheque.estado === 'entregado'
              ? 'El proveedor lo devuelve: vuelve la deuda con él y la del cliente.'
              : 'Vuelve la deuda del cliente.'}
      </p>
      <input type="date" name="fecha" defaultValue={hoy} className={control} aria-label="Fecha del rechazo" />
      <input name="motivo" placeholder="Motivo (sin fondos, firma…)" className={control} />
      <input name="gastos" placeholder="Gastos del banco" inputMode="decimal" className={`${control} cifras`} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar el rechazo'}
      </Boton>
    </form>
  )
}
