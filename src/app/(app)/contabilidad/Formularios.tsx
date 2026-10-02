'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, Boton } from '@/components/ui'

import {
  anularAsientoAccion,
  asientoAccion,
  cerrarEjercicioAccion,
  cerrarHastaAccion,
  claveAccion,
  contabilizarAccion,
  cuentaAccion,
  iniciarAccion,
  reclasificarAccion,
} from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

export type CuentaOpcion = { id: string; codigo: string; nombre: string; imputable: boolean; nivel: number }

function Resultado({ estado }: { estado: { error?: string; ok?: string } | undefined }) {
  return (
    <>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
    </>
  )
}

/** Solo las imputables, con el código delante y sangría por nivel. */
function OpcionesCuentas({ cuentas }: { cuentas: CuentaOpcion[] }) {
  return (
    <>
      {cuentas.map((c) =>
        c.imputable ? (
          <option key={c.id} value={c.id}>
            {`${'  '.repeat(Math.max(0, c.nivel - 2))}${c.codigo} ${c.nombre}`}
          </option>
        ) : (
          <option key={c.id} disabled>
            {`${'  '.repeat(Math.max(0, c.nivel - 2))}${c.codigo} ${c.nombre.toUpperCase()}`}
          </option>
        ),
      )}
    </>
  )
}

export function PuestaEnMarcha({ inicioSugerido }: { inicioSugerido: string }) {
  const [estado, accion, enviando] = useActionState(iniciarAccion, undefined)
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Contabilizar desde</span>
        <input type="date" name="inicio" required defaultValue={inicioSugerido} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Cierre del primer ejercicio</span>
        <input type="date" name="cierreEjercicio" defaultValue={`${inicioSugerido.slice(0, 4)}-12-31`} className={control} />
      </label>
      <div className="flex items-end">
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Poniendo en marcha…' : 'Poner en marcha'}
        </Boton>
      </div>
      <div className="sm:col-span-3">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

export function Contabilizar() {
  const [estado, accion, enviando] = useActionState(contabilizarAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-2">
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Contabilizando…' : 'Contabilizar ahora'}
        </Boton>
      </div>
      <Resultado estado={estado} />
      {!!estado?.pendientesCerrado && (
        <Aviso tono="aviso">
          {estado.pendientesCerrado} operaciones de fechas ya cerradas no tienen asiento: reabrí el período o asentalas a mano.
        </Aviso>
      )}
      {!!estado?.errores?.length && (
        <ul className="divide-y divide-borde rounded-md border border-borde text-sm">
          {estado.errores.map((e, i) => (
            <li key={i} className="px-3 py-2">
              <span className="font-medium">{e.descripcion}</span>
              <span className="block text-xs text-error">{e.error}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

export function Reclasificar({ terceroId, cuentas }: { terceroId: string; cuentas: CuentaOpcion[] }) {
  const [estado, accion, enviando] = useActionState(reclasificarAccion.bind(null, terceroId), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <select name="cuentaId" required defaultValue="" aria-label="Cuenta de gasto" className={`${control} max-w-72`}>
        <option value="" disabled>
          Elegí la cuenta de gasto…
        </option>
        <OpcionesCuentas cuentas={cuentas} />
      </select>
      <Boton type="submit" disabled={enviando} className="h-9 px-2 text-xs">
        Reclasificar y recordar
      </Boton>
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
      {estado?.ok && <span className="text-xs text-ok">{estado.ok}</span>}
    </form>
  )
}

export function NuevaCuenta() {
  const [estado, accion, enviando] = useActionState(cuentaAccion.bind(null, null), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Código</span>
        <input name="codigo" required placeholder="5.17" className={`${control} cifras w-28`} />
      </label>
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className={etiqueta}>Nombre</span>
        <input name="nombre" required placeholder="Publicidad" className={control} />
      </label>
      <label className="flex items-center gap-1 pb-2 text-sm">
        <input type="checkbox" name="imputable" defaultChecked /> Imputable
      </label>
      <Boton type="submit" disabled={enviando}>
        Agregar
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

export function EditarCuenta({ c }: { c: { id: string; codigo: string; nombre: string; imputable: boolean; activa: boolean } }) {
  const [estado, accion, enviando] = useActionState(cuentaAccion.bind(null, c.id), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input name="codigo" defaultValue={c.codigo} aria-label="Código" className={`${control} cifras w-28`} />
      <input name="nombre" defaultValue={c.nombre} aria-label="Nombre" className={`${control} min-w-48 flex-1`} />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="imputable" defaultChecked={c.imputable} /> Imputable
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="activa" defaultChecked={c.activa} /> Activa
      </label>
      <Boton type="submit" disabled={enviando} className="h-9 px-2 text-xs">
        Guardar
      </Boton>
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
      {estado?.ok && <span className="text-xs text-ok">{estado.ok}</span>}
    </form>
  )
}

export function AsignarClave({ clave, actual, cuentas }: { clave: string; actual: string | null; cuentas: CuentaOpcion[] }) {
  const [estado, accion, enviando] = useActionState(claveAccion.bind(null, clave), undefined)
  return (
    <form action={accion} className="flex items-center gap-2">
      <select name="cuentaId" defaultValue={actual ?? ''} aria-label={`Cuenta para ${clave}`} className={`${control} max-w-80`}>
        <option value="" disabled>
          Sin asignar
        </option>
        <OpcionesCuentas cuentas={cuentas} />
      </select>
      <Boton type="submit" disabled={enviando} className="h-9 px-2 text-xs">
        Asignar
      </Boton>
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
      {estado?.ok && <span className="text-xs text-ok">{estado.ok}</span>}
    </form>
  )
}

type Linea = { k: number; debe: string; haber: string }
const numero = (v: string) => {
  const n = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v)
  return Number.isFinite(n) ? n : 0
}

export function AsientoManual({ cuentas, hoy }: { cuentas: CuentaOpcion[]; hoy: string }) {
  const [estado, accion, enviando] = useActionState(asientoAccion, undefined)
  const [lineas, setLineas] = useState<Linea[]>([
    { k: 1, debe: '', haber: '' },
    { k: 2, debe: '', haber: '' },
  ])
  const debe = lineas.reduce((s, l) => s + numero(l.debe), 0)
  const haber = lineas.reduce((s, l) => s + numero(l.haber), 0)
  const dif = Math.round((debe - haber) * 100) / 100
  const cambiar = (k: number, campo: 'debe' | 'haber', v: string) =>
    setLineas((ls) => ls.map((l) => (l.k === k ? { ...l, [campo]: v } : l)))
  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <form action={accion} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha</span>
          <input type="date" name="fecha" required defaultValue={hoy} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Concepto</span>
          <input name="concepto" required placeholder="Amortización de bienes de uso" className={control} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-texto-2">
            <tr>
              <th className="py-1 font-medium">Cuenta</th>
              <th className="w-32 py-1 text-right font-medium">Debe</th>
              <th className="w-32 py-1 text-right font-medium">Haber</th>
              <th className="py-1 font-medium">Detalle</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.k}>
                <td className="py-1 pr-2">
                  <select name="cuentaId" defaultValue="" aria-label="Cuenta" className={`${control} w-full`}>
                    <option value="">Elegí la cuenta…</option>
                    <OpcionesCuentas cuentas={cuentas} />
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    name="debe"
                    inputMode="decimal"
                    value={l.debe}
                    onChange={(e) => cambiar(l.k, 'debe', e.target.value)}
                    aria-label="Debe"
                    className={`${control} cifras w-full text-right`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    name="haber"
                    inputMode="decimal"
                    value={l.haber}
                    onChange={(e) => cambiar(l.k, 'haber', e.target.value)}
                    aria-label="Haber"
                    className={`${control} cifras w-full text-right`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input name="detalle" aria-label="Detalle" className={`${control} w-full`} />
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    aria-label="Quitar la línea"
                    disabled={lineas.length <= 2}
                    onClick={() => setLineas((ls) => ls.filter((x) => x.k !== l.k))}
                    className="flex size-8 items-center justify-center rounded-md text-texto-3 hover:bg-superficie-2 disabled:opacity-30"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm">
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, { k: Math.max(...ls.map((x) => x.k)) + 1, debe: '', haber: '' }])}
                  className="flex items-center gap-1 text-acento hover:underline"
                >
                  <Plus aria-hidden className="size-4" /> Agregar línea
                </button>
              </td>
              <td className="cifras py-2 pr-4 text-right font-semibold">{fmt(debe)}</td>
              <td className="cifras py-2 pr-4 text-right font-semibold">{fmt(haber)}</td>
              <td colSpan={2} className={`py-2 text-xs ${dif ? 'text-error' : 'text-ok'}`}>
                {dif ? `Diferencia ${fmt(Math.abs(dif))} al ${dif > 0 ? 'haber' : 'debe'}` : debe ? 'Balancea' : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Resultado estado={estado} />
      <div>
        <Boton type="submit" variante="primario" disabled={enviando || !!dif || !debe}>
          Registrar el asiento
        </Boton>
      </div>
    </form>
  )
}

export function AnularAsiento({ id, hoy }: { id: string; hoy: string }) {
  const [estado, accion, enviando] = useActionState(anularAsientoAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha del contraasiento</span>
        <input type="date" name="fecha" defaultValue={hoy} className={control} />
      </label>
      <BotonConfirmar pregunta="¿Anular este asiento con un contraasiento?" disabled={enviando}>
        Anular
      </BotonConfirmar>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

export function CerrarEjercicio({ id, texto }: { id: string; texto: string }) {
  const [estado, accion, enviando] = useActionState(cerrarEjercicioAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="flex flex-col items-end gap-1">
      <BotonConfirmar
        pregunta={`¿Cerrar el ejercicio ${texto}? Se refunden los resultados y no se aceptan más asientos en esas fechas.`}
        disabled={enviando}
        className="h-8 px-2 text-xs"
      >
        {enviando ? 'Cerrando…' : 'Cerrar ejercicio'}
      </BotonConfirmar>
      {estado?.error && <span className="max-w-80 text-right text-xs text-error">{estado.error}</span>}
      {estado?.ok && <span className="text-xs text-ok">{estado.ok}</span>}
    </form>
  )
}

export function CerrarHasta({ actual }: { actual: string | null }) {
  const [estado, accion, enviando] = useActionState(cerrarHastaAccion, undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>No aceptar asientos hasta el</span>
        <input type="date" name="fecha" defaultValue={actual ?? ''} className={control} />
      </label>
      <Boton type="submit" disabled={enviando}>
        Guardar
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}
