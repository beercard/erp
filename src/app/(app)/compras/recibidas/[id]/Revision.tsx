'use client'

import { useActionState } from 'react'

import { LETRAS_COMPRA, NOMBRE_LETRA_COMPRA } from '@/modulos/compras/tipos'
import { Aviso, Boton } from '@/components/ui'

import { registrarAccion } from '../acciones'

const campo = 'h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave'

type Datos = {
  letra?: string | null
  clase?: string | null
  fce?: boolean
  puntoVenta?: number | null
  numero?: number | null
  fecha?: string | null
  cae?: string | null
  cuitEmisor?: string | null
  razonSocialEmisor?: string | null
  moneda?: string
  cotizacion?: number | null
  iva?: { alicuota: number; base: number; importe: number }[]
  noGravado?: number
  exento?: number
  tributos?: { tipo: string; provincia: string | null; importe: number }[]
  total?: number | null
}

const n = (v: number | null | undefined) => (v == null || v === 0 ? '' : String(v))

/** Lo leído, para corregir y registrar. Cada dato se puede cambiar antes de grabar. */
export function Revision({ id, d: leido, tributos }: { id: string; d: Datos; tributos: Record<string, string> }) {
  const [estado, accion, enviando] = useActionState(registrarAccion.bind(null, id), undefined)
  // Si hubo un error, se muestra lo que la persona escribió (el formulario se reinicia al mandarlo).
  const d = (estado?.datos as Datos | undefined) ?? leido
  const ivas = [...(d.iva ?? []), ...Array.from({ length: Math.max(0, 3 - (d.iva?.length ?? 0)) }, () => null)]
  const trib = [...(d.tributos ?? []), ...Array.from({ length: Math.max(0, 2 - (d.tributos?.length ?? 0)) }, () => null)]
  const etiqueta = 'flex flex-col gap-1 text-xs font-medium text-texto-2'
  return (
    <form key={JSON.stringify(d)} action={accion} className="flex flex-col gap-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Proveedor</legend>
        <label className={etiqueta}>
          CUIT
          <input name="cuitEmisor" required defaultValue={d.cuitEmisor ?? ''} inputMode="numeric" className={campo} />
        </label>
        <label className={etiqueta}>
          Razón social (si es nuevo)
          <input name="razonSocialEmisor" defaultValue={d.razonSocialEmisor ?? ''} className={campo} />
        </label>
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold">Comprobante</legend>
        <label className={etiqueta}>
          Tipo
          <select name="clase" defaultValue={d.clase ?? 'factura'} className={campo}>
            <option value="factura">Factura</option>
            <option value="nota_credito">Nota de crédito</option>
            <option value="nota_debito">Nota de débito</option>
          </select>
        </label>
        <label className={etiqueta}>
          Letra
          <select name="letra" defaultValue={d.letra ?? 'A'} className={campo}>
            {LETRAS_COMPRA.map((l) => (
              <option key={l} value={l}>
                {NOMBRE_LETRA_COMPRA[l]}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Punto de venta
          <input name="puntoVenta" required type="number" min={0} defaultValue={d.puntoVenta ?? ''} className={campo} />
        </label>
        <label className={etiqueta}>
          Número
          <input name="numero" required type="number" min={0} defaultValue={d.numero ?? ''} className={campo} />
        </label>
        <label className={etiqueta}>
          Fecha
          <input name="fecha" required type="date" defaultValue={d.fecha ?? ''} className={campo} />
        </label>
        <label className={`${etiqueta} col-span-2 sm:col-span-1`}>
          CAE
          <input name="cae" defaultValue={d.cae ?? ''} inputMode="numeric" className={campo} />
        </label>
        <label className={etiqueta}>
          Moneda
          <select name="moneda" defaultValue={d.moneda ?? 'PES'} className={campo}>
            <option value="PES">Pesos</option>
            <option value="DOL">Dólares</option>
          </select>
        </label>
        <label className={etiqueta}>
          Cotización
          <input name="cotizacion" inputMode="decimal" defaultValue={n(d.cotizacion)} className={campo} />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-4">
          <input type="checkbox" name="fce" defaultChecked={d.fce} /> Factura de crédito electrónica MiPyME
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">IVA (solo A y M)</legend>
        {ivas.map((a, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <select name="alicuota" defaultValue={a ? String(a.alicuota) : '21'} aria-label="Alícuota" className={campo}>
              {['21', '10.5', '27', '5', '2.5', '0'].map((x) => (
                <option key={x} value={x}>
                  {x.replace('.', ',')} %
                </option>
              ))}
            </select>
            <input
              name="base"
              inputMode="decimal"
              placeholder="Neto gravado"
              aria-label="Neto gravado"
              defaultValue={n(a?.base)}
              className={campo}
            />
            <input
              name="importeIva"
              inputMode="decimal"
              placeholder="IVA"
              aria-label="IVA"
              defaultValue={n(a?.importe)}
              className={campo}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Percepciones y otros tributos</legend>
        {trib.map((t, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <select name="tributoTipo" defaultValue={t?.tipo ?? 'percepcion_iibb'} aria-label="Tributo" className={campo}>
              {Object.entries(tributos).map(([v, x]) => (
                <option key={v} value={v}>
                  {x}
                </option>
              ))}
            </select>
            <input
              name="tributoProvincia"
              placeholder="Provincia (IIBB)"
              aria-label="Provincia"
              defaultValue={t?.provincia ?? ''}
              className={campo}
            />
            <input
              name="tributoImporte"
              inputMode="decimal"
              placeholder="Importe"
              aria-label="Importe"
              defaultValue={n(t?.importe)}
              className={campo}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="grid grid-cols-3 gap-3">
        <label className={etiqueta}>
          No gravado
          <input name="noGravado" inputMode="decimal" defaultValue={n(d.noGravado)} className={campo} />
        </label>
        <label className={etiqueta}>
          Exento
          <input name="exento" inputMode="decimal" defaultValue={n(d.exento)} className={campo} />
        </label>
        <label className={etiqueta}>
          Total
          <input name="total" required inputMode="decimal" defaultValue={n(d.total)} className={`${campo} font-semibold`} />
        </label>
      </fieldset>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando} className="self-start">
        Registrar la compra
      </Boton>
    </form>
  )
}
