'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { APLICACIONES, FUNCIONES, PLANES } from '@/lib/planes'

import { cambiarCodigoAccion, guardarSuscripcionAccion, registrarPagoAccion, type EstadoAdmin } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

function Resultado({ estado }: { estado: EstadoAdmin }) {
  if (estado?.error) return <Aviso>{estado.error}</Aviso>
  if (estado?.ok) return <Aviso tono="ok">{estado.ok}</Aviso>
  return null
}

export type DatosAdmin = {
  plan: string
  estado: string
  ciclo: string
  aplicaciones: string[]
  usuariosAdicionales: number
  pruebaHasta: string | null
  pagadoHasta: string | null
  precioAcordado: string | null
  observaciones: string | null
}

export function FormularioSuscripcionAdmin({ empresaId, inicial }: { empresaId: string; inicial: DatosAdmin }) {
  const [estado, accion, enviando] = useActionState(guardarSuscripcionAccion.bind(null, empresaId), undefined)
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Plan</span>
        <select name="plan" defaultValue={inicial.plan} className={control}>
          {PLANES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Estado</span>
        <select name="estado" defaultValue={inicial.estado} className={control}>
          {['prueba', 'activa', 'impaga', 'suspendida', 'cancelada'].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Ciclo</span>
        <select name="ciclo" defaultValue={inicial.ciclo} className={control}>
          <option value="mensual">Mensual</option>
          <option value="anual">Anual</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Usuarios adicionales</span>
        <input
          name="usuariosAdicionales"
          type="number"
          min={0}
          defaultValue={inicial.usuariosAdicionales}
          className={`${control} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Prueba hasta</span>
        <input name="pruebaHasta" type="date" defaultValue={inicial.pruebaHasta ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Pagado hasta</span>
        <input name="pagadoHasta" type="date" defaultValue={inicial.pagadoHasta ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Precio acordado por mes (vacío: lista)</span>
        <input
          name="precioAcordado"
          inputMode="decimal"
          defaultValue={inicial.precioAcordado ?? ''}
          className={`${control} cifras`}
        />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className={etiqueta}>Aplicaciones</legend>
        {APLICACIONES.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="aplicaciones" value={a.id} defaultChecked={inicial.aplicaciones.includes(a.id)} />
            {FUNCIONES[a.id].nombre}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
        <span className={etiqueta}>Observaciones</span>
        <input name="observaciones" defaultValue={inicial.observaciones ?? ''} className={control} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            Guardar
          </Boton>
        </div>
      </div>
    </form>
  )
}

export function FormularioPago({ empresaId, sugerido }: { empresaId: string; sugerido: string }) {
  const [estado, accion, enviando] = useActionState(registrarPagoAccion.bind(null, empresaId), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Importe cobrado (con IVA)</span>
        <input name="importe" inputMode="decimal" defaultValue={sugerido} className={`${control} cifras w-40`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Medio</span>
        <select name="medio" className={control}>
          <option value="transferencia">Transferencia</option>
          <option value="mercado_pago">Mercado Pago</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="debito">Débito automático</option>
        </select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className={etiqueta}>Referencia (factura, operación)</span>
        <input name="referencia" className={control} />
      </label>
      <Boton type="submit" disabled={enviando}>
        Registrar pago
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

/** Código de ingreso (subdominio) de la empresa. */
export function FormularioCodigo({
  empresaId,
  codigo,
  dominio,
}: {
  empresaId: string
  codigo: string | null
  dominio: string | null
}) {
  const [estado, accion, enviando] = useActionState(cambiarCodigoAccion.bind(null, empresaId), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Código</span>
        <span className="flex items-center gap-1">
          <input name="codigo" defaultValue={codigo ?? ''} required className={`${control} cifras w-48`} />
          {dominio && <span className="text-sm text-texto-3">.{dominio}</span>}
        </span>
      </label>
      <Boton type="submit" disabled={enviando}>
        Cambiar
      </Boton>
      <p className="w-full text-xs text-texto-3">
        Cambiarlo cambia la dirección por la que entran todos los usuarios de la empresa: avisales antes.
      </p>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}
