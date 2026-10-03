'use client'

import { Copy, Lock, LockOpen, Save, ShieldAlert } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { normalizarNumero } from '@/lib/dinero'
import { DENOMINACIONES } from '@/modulos/tesoreria/denominaciones'

import { abrirCajaAccion, cerrarCajaAccion, configurarCajaAccion } from './acciones'

const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
const numero = (v: string) => Number(normalizarNumero(v)) || 0
const campo = 'h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave'
const redondo = (n: number) => Math.round(n * 100) / 100

function Diferencia({ valor }: { valor: number }) {
  return (
    <span className={`cifras font-semibold ${valor === 0 ? 'text-ok' : 'text-error'}`}>
      {valor === 0 ? 'Cuadra ✓' : `${valor > 0 ? 'Sobran' : 'Faltan'} ${pesos(Math.abs(valor))}`}
    </span>
  )
}

/** Conteo de billetes y monedas, o el total escrito a mano. Devuelve lo contado. */
function useConteo() {
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [manual, setManual] = useState('')
  const porBilletes = DENOMINACIONES.reduce((s, d) => s + d * (cantidades[d] ?? 0), 0)
  const contado = manual.trim() ? numero(manual) : porBilletes
  const billetes = (
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
  )
  const total = (titulo: string) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
      {titulo}
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
  )
  return { contado, billetes, total }
}

/** Apertura del turno: se cuenta el fondo con que arranca la caja. */
export function AbrirCaja({ cuentaId, esperado }: { cuentaId: string; esperado: number }) {
  const [estado, accion, enviando] = useActionState(abrirCajaAccion.bind(null, cuentaId), undefined)
  const { contado, billetes, total } = useConteo()
  const diferencia = redondo(contado - esperado)
  return (
    <form action={accion} className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">
        Según el sistema la caja tiene <b className="cifras">{pesos(esperado)}</b> (lo que quedó del último cierre). Contá el
        fondo con que arrancás.
      </p>
      {billetes}
      {total('Fondo inicial contado')}
      <p className="flex justify-between rounded-xl bg-superficie-2 p-3 text-sm">
        <span className="text-texto-2">Diferencia con el sistema</span> <Diferencia valor={diferencia} />
      </p>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Nota de apertura <span className="font-normal text-texto-3">(opcional: cambio que trajiste, quién te pasó la caja…)</span>
        <textarea name="nota" rows={2} maxLength={500} className={`${campo} h-auto py-2`} />
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando}>
        <LockOpen aria-hidden /> Abrir caja
      </Boton>
    </form>
  )
}

type Medio = { medio: string; nombre: string; total: string }

/**
 * Cierre: se cuentan los billetes (o se escribe el total), se rinden los
 * demás medios y se ve en el momento cada diferencia.
 */
export function CerrarCaja({
  cuentaId,
  esperado,
  medios,
  maxima,
}: {
  cuentaId: string
  esperado: number
  medios: Medio[]
  maxima: number | null
}) {
  const [estado, accion, enviando] = useActionState(cerrarCajaAccion.bind(null, cuentaId), undefined)
  const { contado, billetes, total } = useConteo()
  const [rendido, setRendido] = useState<Record<string, string>>({})
  const diferencia = redondo(contado - esperado)
  const difMedio = (m: Medio) => (rendido[m.medio] === undefined ? 0 : redondo(numero(rendido[m.medio]) - Number(m.total)))
  const pasada = maxima != null && (Math.abs(diferencia) > maxima || medios.some((m) => Math.abs(difMedio(m)) > maxima))
  return (
    <form action={accion} className="flex flex-col gap-4">
      {billetes}
      {total('Efectivo contado')}
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
          <dd>
            <Diferencia valor={diferencia} />
          </dd>
        </div>
      </dl>
      {medios.length > 0 && (
        <fieldset>
          <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-semibold">
            Otros medios
            <button
              type="button"
              onClick={() => setRendido(Object.fromEntries(medios.map((m) => [m.medio, m.total.replace('.', ',')])))}
              className="inline-flex items-center gap-1 text-xs font-medium text-acento hover:underline"
            >
              <Copy aria-hidden className="size-3.5" /> Copiar lo esperado
            </button>
          </legend>
          <p className="mb-2 text-xs text-texto-3">
            Lo que rendís de cada medio: cupones, comprobantes de transferencia, cheques.
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs text-texto-2">
              <tr>
                <th className="py-1 text-left font-medium">Medio</th>
                <th className="py-1 text-right font-medium">Esperado</th>
                <th className="w-28 py-1 text-right font-medium">Rendido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {medios.map((m) => (
                <tr key={m.medio}>
                  <td className="py-1.5">
                    {m.nombre}
                    {difMedio(m) !== 0 && (
                      <span className="block text-xs">
                        <Diferencia valor={difMedio(m)} />
                      </span>
                    )}
                  </td>
                  <td className="cifras py-1.5 text-right">{pesos(Number(m.total))}</td>
                  <td className="py-1.5 pl-2">
                    <input
                      name={`m_${m.medio}`}
                      inputMode="decimal"
                      aria-label={`Rendido de ${m.nombre}`}
                      placeholder={m.total.replace('.', ',')}
                      value={rendido[m.medio] ?? ''}
                      onChange={(e) => setRendido((r) => ({ ...r, [m.medio]: e.target.value }))}
                      className={`${campo} cifras w-full text-right`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Observaciones {diferencia !== 0 && <span className="font-normal text-texto-3">(contá qué pasó con la diferencia)</span>}
        <textarea name="observaciones" rows={2} maxLength={500} className={`${campo} h-auto py-2`} />
      </label>
      {pasada && !estado?.error && (
        <Aviso tono="aviso">
          La diferencia supera los {pesos(maxima!)} permitidos: si no aparece el error en el conteo, la caja la cierra un
          supervisor.
        </Aviso>
      )}
      {estado?.error && (
        <Aviso tono={estado.supervisor ? 'aviso' : 'error'}>
          {estado.supervisor && <ShieldAlert aria-hidden className="mr-1 inline size-4" />}
          {estado.error}
        </Aviso>
      )}
      <Boton type="submit" variante="primario" disabled={enviando || (!contado && esperado !== 0)}>
        <Lock aria-hidden /> Cerrar caja
      </Boton>
      <p className="text-xs text-texto-3">
        Si hay diferencia en el efectivo, queda un arqueo con su ajuste y la caja sigue con lo contado.
      </p>
    </form>
  )
}

/** Turnos obligatorios, diferencia máxima y a quién le llega el reporte del cierre. */
export function ConfigurarCaja({
  cuentaId,
  exigeTurno,
  diferenciaMaxima,
  correos,
  telefonos,
}: {
  cuentaId: string
  exigeTurno: boolean
  diferenciaMaxima: string | null
  correos: string[]
  telefonos: string[]
}) {
  const [estado, accion, enviando] = useActionState(configurarCajaAccion.bind(null, cuentaId), undefined)
  return (
    <form action={accion} className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="exigeTurno" defaultChecked={exigeTurno} className="mt-0.5 size-4 accent-acento" />
        <span>
          Trabajar por turnos
          <span className="block text-xs text-texto-3">
            Hay que abrir la caja (contando el fondo) para cobrar o pagar en efectivo.
          </span>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Diferencia máxima que puede cerrar el cajero
        <input
          name="diferenciaMaxima"
          inputMode="decimal"
          defaultValue={diferenciaMaxima?.replace('.', ',') ?? ''}
          placeholder="Sin límite"
          className={`${campo} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Mandar el reporte de cada cierre por correo a
        <input name="correos" defaultValue={correos.join(', ')} placeholder="dueno@empresa.com, ..." className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        y por WhatsApp a
        <input name="telefonos" defaultValue={telefonos.join(', ')} placeholder="11 5555 1234, ..." className={campo} />
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">Guardado.</Aviso>}
      <Boton type="submit" disabled={enviando}>
        <Save aria-hidden /> Guardar
      </Boton>
    </form>
  )
}
