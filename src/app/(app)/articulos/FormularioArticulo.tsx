'use client'

import { useActionState, useRef, useState } from 'react'

import { Aviso, Boton, BotonEnlace, Campo, Panel, Selector, Tecla } from '@/components/ui'

import { guardarArticuloAccion } from './acciones'

type Opcion = { valor: string | number; texto: string }

export function FormularioArticulo({
  id,
  inicial,
  opciones,
  soloLectura = false,
}: {
  soloLectura?: boolean
  id: string | null
  inicial: Record<string, string | boolean | null>
  opciones: { rubros: Opcion[]; marcas: Opcion[]; alicuotas: Opcion[]; monedas: Opcion[]; proveedores: Opcion[] }
}) {
  const [estado, accion, enviando] = useActionState(guardarArticuloAccion.bind(null, id), undefined)
  const formulario = useRef<HTMLFormElement>(null)
  const v = (c: string) => {
    const x = estado?.valores?.[c] ?? inicial[c]
    return x === null || x === undefined || typeof x === 'boolean' ? '' : String(x)
  }
  const marcado = (c: string) => (estado?.valores ? c in estado.valores : inicial[c] === true)
  const [tipo, setTipo] = useState(v('tipo') || 'producto')
  const e = estado?.errores ?? {}

  return (
    <form
      ref={formulario}
      action={accion}
      noValidate
      onKeyDown={(ev) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault()
          formulario.current?.requestSubmit()
        }
      }}
      className="flex flex-col gap-4"
    >
      {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
      {soloLectura && <Aviso tono="info">Solo lectura: tu rol no permite modificar artículos ni precios.</Aviso>}
      <fieldset disabled={soloLectura} className="contents">
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Datos del artículo</h2>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo
              id="codigo"
              name="codigo"
              etiqueta="Código"
              defaultValue={v('codigo')}
              error={e.codigo}
              className="cifras"
              required
              autoFocus={!id}
            />
            <Campo
              id="nombre"
              name="nombre"
              etiqueta="Nombre"
              defaultValue={v('nombre')}
              error={e.nombre}
              className="sm:col-span-2"
              required
            />
            <Selector
              id="tipo"
              name="tipo"
              etiqueta="Tipo"
              opciones={[
                { valor: 'producto', texto: 'Producto' },
                { valor: 'servicio', texto: 'Servicio' },
              ]}
              value={tipo}
              onChange={(ev) => setTipo(ev.target.value)}
            />
            <Selector
              id="rubroId"
              name="rubroId"
              etiqueta="Rubro"
              vacio="Sin rubro"
              opciones={opciones.rubros}
              defaultValue={v('rubroId')}
            />
            <Selector
              id="marcaId"
              name="marcaId"
              etiqueta="Marca"
              vacio="Sin marca"
              opciones={opciones.marcas}
              defaultValue={v('marcaId')}
            />
            <Selector
              id="alicuotaIva"
              name="alicuotaIva"
              etiqueta="IVA"
              opciones={opciones.alicuotas}
              defaultValue={v('alicuotaIva') || '5'}
              error={e.alicuotaIva}
            />
            <Campo id="unidad" name="unidad" etiqueta="Unidad" defaultValue={v('unidad') || 'unidad'} />
            <Campo
              id="codigoBarras"
              name="codigoBarras"
              etiqueta="Código de barras"
              defaultValue={v('codigoBarras')}
              className="cifras"
            />
            <Campo
              id="costo"
              name="costo"
              etiqueta="Costo"
              defaultValue={v('costo')}
              error={e.costo}
              inputMode="decimal"
              className="cifras"
            />
            <Selector
              id="monedaCosto"
              name="monedaCosto"
              etiqueta="Moneda del costo"
              opciones={opciones.monedas}
              defaultValue={v('monedaCosto') || 'PES'}
            />
            {tipo === 'producto' && (
              <>
                <Campo
                  id="stockMinimo"
                  name="stockMinimo"
                  etiqueta="Stock mínimo"
                  defaultValue={v('stockMinimo')}
                  error={e.stockMinimo}
                  inputMode="decimal"
                  className="cifras"
                />
                <Campo
                  id="loteReposicion"
                  name="loteReposicion"
                  etiqueta="Cuánto pedir al reponer"
                  defaultValue={v('loteReposicion')}
                  error={e.loteReposicion}
                  inputMode="decimal"
                  className="cifras"
                  placeholder="Hasta el doble del mínimo"
                />
                <Selector
                  id="proveedorId"
                  name="proveedorId"
                  etiqueta="Proveedor habitual"
                  vacio="El de la última compra"
                  opciones={opciones.proveedores}
                  defaultValue={v('proveedorId')}
                />
                <div className="flex flex-col justify-end gap-2 pb-1 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="llevaStock"
                      defaultChecked={id ? marcado('llevaStock') : true}
                      className="size-4 accent-[var(--acento)]"
                    />
                    Lleva stock
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="llevaSerie"
                      defaultChecked={marcado('llevaSerie')}
                      className="size-4 accent-[var(--acento)]"
                    />
                    Se identifica por número de serie (equipos)
                  </label>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
              <label htmlFor="descripcion" className="text-xs font-medium text-texto-2">
                Descripción
              </label>
              <textarea
                id="descripcion"
                name="descripcion"
                rows={3}
                defaultValue={v('descripcion')}
                className="rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
              />
            </div>
          </div>
        </Panel>
      </fieldset>
      {!soloLectura && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="mr-auto hidden items-center gap-1 text-xs text-texto-3 sm:flex">
            <Tecla>Ctrl</Tecla> <Tecla>Enter</Tecla> para grabar
          </span>
          <BotonEnlace href={id ? `/articulos/${id}` : '/articulos'} variante="fantasma">
            Cancelar
          </BotonEnlace>
          <Boton type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Grabando…' : id ? 'Grabar cambios' : 'Dar de alta'}
          </Boton>
        </div>
      )}
    </form>
  )
}
