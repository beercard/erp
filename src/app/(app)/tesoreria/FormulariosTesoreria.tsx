'use client'

import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { normalizarNumero } from '@/lib/dinero'
import { MEDIOS_PREDETERMINABLES, TIPOS_CUENTA } from '@/modulos/tesoreria/medios'

import { arqueoAccion, guardarCuentaAccion, movimientoAccion, saldoInicialAccion, type Estado } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

function Resultado({ estado }: { estado: Estado }) {
  if (estado?.error) return <Aviso>{estado.error}</Aviso>
  if (estado?.ok) return <Aviso tono="ok">{estado.ok}</Aviso>
  return null
}

export type DatosCuenta = {
  codigo: string
  nombre: string
  tipo: string
  moneda: string
  banco: string | null
  numeroCuenta: string | null
  cbu: string | null
  mediosPredeterminados: string[]
  activa: boolean
}

export function FormularioCuenta({ id, inicial }: { id: string | null; inicial?: DatosCuenta }) {
  const [estado, accion, enviando] = useActionState(guardarCuentaAccion.bind(null, id), undefined)
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'banco')
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Código</span>
        <input
          name="codigo"
          defaultValue={inicial?.codigo}
          placeholder="ICBC"
          className={`${control} cifras uppercase`}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Nombre</span>
        <input
          name="nombre"
          defaultValue={inicial?.nombre}
          placeholder="Banco ICBC cuenta corriente"
          className={control}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Tipo</span>
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={control}>
          {Object.entries(TIPOS_CUENTA).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Moneda</span>
        <select name="moneda" defaultValue={inicial?.moneda ?? 'PES'} className={control}>
          <option value="PES">Pesos</option>
          <option value="DOL">Dólares</option>
        </select>
      </label>
      {(tipo === 'banco' || tipo === 'inversion') && (
        <>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Banco</span>
            <input name="banco" defaultValue={inicial?.banco ?? ''} className={control} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Número de cuenta</span>
            <input name="numeroCuenta" defaultValue={inicial?.numeroCuenta ?? ''} className={`${control} cifras`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>CBU</span>
            <input name="cbu" defaultValue={inicial?.cbu ?? ''} inputMode="numeric" className={`${control} cifras`} />
          </label>
        </>
      )}
      <fieldset className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
        <legend className={`${etiqueta} mb-1`}>Medios que entran o salen por esta cuenta si no se elige otra</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {Object.entries(MEDIOS_PREDETERMINABLES).map(([k, t]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="medios" value={k} defaultChecked={inicial?.mediosPredeterminados.includes(k)} /> {t}
            </label>
          ))}
        </div>
        <p className="text-xs text-texto-3">Cada medio va a una sola cuenta: si lo marcás acá, se le saca a la que lo tenía.</p>
      </fieldset>
      {id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activa" defaultChecked={inicial?.activa ?? true} /> Activa
        </label>
      )}
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Grabando…' : id ? 'Guardar cambios' : 'Crear cuenta'}
          </Boton>
        </div>
      </div>
    </form>
  )
}

export function FormularioSaldoInicial({ cuentaId, hoy }: { cuentaId: string; hoy: string }) {
  const [estado, accion, enviando] = useActionState(saldoInicialAccion.bind(null, cuentaId), undefined)
  return (
    <form action={accion} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha</span>
          <input type="date" name="fecha" defaultValue={hoy} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Saldo (extracto o arqueo)</span>
          <input name="importe" inputMode="decimal" className={`${control} cifras text-right`} required />
        </label>
      </div>
      <Resultado estado={estado} />
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Grabando…' : 'Cargar saldo inicial'}
      </Boton>
    </form>
  )
}

export function FormularioArqueo({ cuentaId, hoy }: { cuentaId: string; hoy: string }) {
  const [estado, accion, enviando] = useActionState(arqueoAccion.bind(null, cuentaId), undefined)
  return (
    <form action={accion} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha</span>
          <input type="date" name="fecha" defaultValue={hoy} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Lo que se contó</span>
          <input name="contado" inputMode="decimal" className={`${control} cifras text-right`} required />
        </label>
      </div>
      <input name="observaciones" placeholder="Observaciones (opcional)" className={control} />
      <Resultado estado={estado} />
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Grabando…' : 'Registrar arqueo'}
      </Boton>
    </form>
  )
}

type Opcion = { id: string; nombre: string; tipo: string; moneda: string }

/** Gasto o ingreso, transferencia entre cuentas o acreditación de cupones. */
export function FormularioMovimiento({
  cuentas,
  hoy,
  cuentaInicial,
}: {
  cuentas: Opcion[]
  hoy: string
  cuentaInicial?: string
}) {
  const [estado, accion, enviando] = useActionState(movimientoAccion, undefined)
  const [operacion, setOperacion] = useState<'egreso' | 'ingreso' | 'transferencia' | 'acreditacion'>('egreso')
  const [d, setD] = useState({
    cuentaId: cuentaInicial ?? cuentas[0]?.id ?? '',
    destinoId: '',
    fecha: hoy,
    importe: '',
    importeDestino: '',
    concepto: '',
    detalle: '',
    comprobante: '',
  })
  const campo = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((x) => ({ ...x, [k]: e.target.value }))
  const origen = cuentas.find((c) => c.id === d.cuentaId)
  const destino = cuentas.find((c) => c.id === d.destinoId)
  const num = (v: string) => normalizarNumero(v || '0')
  const datos =
    operacion === 'transferencia'
      ? {
          origenId: d.cuentaId,
          destinoId: d.destinoId,
          fecha: d.fecha,
          importe: num(d.importe),
          importeDestino: d.importeDestino ? num(d.importeDestino) : null,
          detalle: d.detalle,
          comprobante: d.comprobante,
        }
      : operacion === 'acreditacion'
        ? {
            cuponesId: d.cuentaId,
            bancoId: d.destinoId,
            fecha: d.fecha,
            bruto: num(d.importe),
            neto: num(d.importeDestino),
            detalle: d.detalle,
          }
        : {
            cuentaId: d.cuentaId,
            fecha: d.fecha,
            sentido: operacion,
            importe: num(d.importe),
            concepto: d.concepto,
            detalle: d.detalle,
            comprobante: d.comprobante,
          }
  const opciones = (filtro: (c: Opcion) => boolean) =>
    cuentas.filter(filtro).map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre}
        {c.moneda === 'DOL' ? ' (US$)' : ''}
      </option>
    ))
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="operacion" value={operacion} />
      <input type="hidden" name="datos" value={JSON.stringify(datos)} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de movimiento">
        {(
          [
            ['egreso', 'Gasto o retiro'],
            ['ingreso', 'Ingreso'],
            ['transferencia', 'Transferencia entre cuentas'],
            ['acreditacion', 'Acreditación de cupones'],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={operacion === k}
            onClick={() => setOperacion(k)}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
              operacion === k ? 'border-acento bg-acento-suave text-acento' : 'border-borde text-texto-2 hover:bg-superficie-2'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>
            {operacion === 'transferencia' ? 'Sale de' : operacion === 'acreditacion' ? 'Cupones de' : 'Cuenta'}
          </span>
          <select value={d.cuentaId} onChange={campo('cuentaId')} className={control}>
            {opciones((c) => (operacion === 'acreditacion' ? c.tipo === 'cupones' || c.tipo === 'billetera' : true))}
          </select>
        </label>
        {(operacion === 'transferencia' || operacion === 'acreditacion') && (
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>{operacion === 'transferencia' ? 'Entra en' : 'Se acreditó en'}</span>
            <select value={d.destinoId} onChange={campo('destinoId')} className={control} required>
              <option value="">Elegí</option>
              {opciones((c) => c.id !== d.cuentaId && (operacion === 'acreditacion' ? c.tipo === 'banco' : true))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha</span>
          <input type="date" value={d.fecha} onChange={campo('fecha')} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>{operacion === 'acreditacion' ? 'Cupones (bruto)' : 'Importe'}</span>
          <input
            value={d.importe}
            onChange={campo('importe')}
            inputMode="decimal"
            className={`${control} cifras text-right`}
            required
          />
        </label>
        {(operacion === 'acreditacion' ||
          (operacion === 'transferencia' && origen && destino && origen.moneda !== destino.moneda)) && (
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>
              {operacion === 'acreditacion' ? 'Llegó al banco (neto)' : `Entra (${destino?.moneda === 'DOL' ? 'US$' : '$'})`}
            </span>
            <input
              value={d.importeDestino}
              onChange={campo('importeDestino')}
              inputMode="decimal"
              className={`${control} cifras text-right`}
              required
            />
          </label>
        )}
        {(operacion === 'egreso' || operacion === 'ingreso') && (
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Concepto</span>
            <input
              value={d.concepto}
              onChange={campo('concepto')}
              list="conceptos-tesoreria"
              placeholder={operacion === 'egreso' ? 'Gastos varios, retiro, sueldos…' : 'Aporte, reintegro…'}
              className={control}
              required
            />
            <datalist id="conceptos-tesoreria">
              {[
                'Gastos varios',
                'Gastos bancarios',
                'Impuestos',
                'Sueldos',
                'Retiro de socios',
                'Combustible',
                'Movilidad',
                'Honorarios',
                'Aporte de socios',
              ].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        )}
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={etiqueta}>Detalle</span>
          <input value={d.detalle} onChange={campo('detalle')} className={control} />
        </label>
        {operacion !== 'acreditacion' && (
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Comprobante u operación</span>
            <input value={d.comprobante} onChange={campo('comprobante')} className={`${control} cifras`} />
          </label>
        )}
      </div>
      {operacion === 'acreditacion' && (
        <p className="text-xs text-texto-3">
          La diferencia entre los cupones y lo acreditado queda como comisiones y retenciones de la tarjeta.
        </p>
      )}
      <Resultado estado={estado} />
      <div>
        <Boton type="submit" variante="primario" disabled={enviando || !cuentas.length}>
          {enviando ? 'Grabando…' : 'Registrar'}
        </Boton>
      </div>
    </form>
  )
}
