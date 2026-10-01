'use client'

import { useActionState, useEffect, useRef, useState } from 'react'

import { Aviso, Boton, BotonEnlace, Campo, Panel, Selector, Tecla } from '@/components/ui'

import { guardar } from './acciones'

type Opcion = { valor: string | number; texto: string }

export type OpcionesFormulario = {
  ivas: Opcion[]
  documentos: Opcion[]
  provincias: Opcion[]
  listas: Opcion[]
  vendedores: Opcion[]
  condiciones: Opcion[]
  zonas: Opcion[]
  transportes: Opcion[]
}

export type ValoresTercero = Record<string, string | boolean | null | undefined>

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Panel>
      <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">{titulo}</h2>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </Panel>
  )
}

export function FormularioTercero({
  id,
  inicial,
  opciones,
  soloLectura = false,
}: {
  soloLectura?: boolean
  id: string | null
  inicial: ValoresTercero
  opciones: OpcionesFormulario
}) {
  const [estado, accion, enviando] = useActionState(guardar.bind(null, id), undefined)
  const [modificado, setModificado] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)
  const e = estado?.errores ?? {}
  // Tras un error, el formulario muestra lo que se había escrito.
  const v = (campo: string) => {
    const valor = estado?.valores?.[campo] ?? inicial[campo]
    return valor === null || valor === undefined || typeof valor === 'boolean' ? '' : String(valor)
  }
  const marcado = (campo: 'esCliente' | 'esProveedor') => (estado?.valores ? campo in estado.valores : Boolean(inicial[campo]))

  // Avisa antes de salir con cambios sin grabar.
  useEffect(() => {
    if (!modificado || enviando) return
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [modificado, enviando])

  return (
    <form
      ref={formulario}
      action={accion}
      onChange={() => setModificado(true)}
      onKeyDown={(ev) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault()
          formulario.current?.requestSubmit()
        }
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
      {soloLectura && <Aviso tono="info">Solo lectura: tu rol no permite modificar clientes ni proveedores.</Aviso>}
      <fieldset disabled={soloLectura} className="contents">
        <Seccion titulo="Identificación">
          <Campo
            id="razonSocial"
            name="razonSocial"
            etiqueta="Razón social o nombre"
            defaultValue={v('razonSocial')}
            error={e.razonSocial}
            className="sm:col-span-2"
            required
            autoFocus={!id}
          />
          <Campo
            id="codigo"
            name="codigo"
            etiqueta="Código"
            defaultValue={v('codigo')}
            error={e.codigo}
            ayuda={id ? undefined : 'Vacío: se asigna el siguiente.'}
          />
          <Campo
            id="nombreFantasia"
            name="nombreFantasia"
            etiqueta="Nombre de fantasía"
            defaultValue={v('nombreFantasia')}
            className="sm:col-span-2"
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-texto-2">Es</legend>
            <div className="flex h-9 items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="esCliente"
                  defaultChecked={marcado('esCliente')}
                  className="size-4 accent-[var(--acento)]"
                />
                Cliente
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="esProveedor"
                  defaultChecked={marcado('esProveedor')}
                  className="size-4 accent-[var(--acento)]"
                />
                Proveedor
              </label>
            </div>
            {e.esCliente && <p className="text-xs text-error">{e.esCliente}</p>}
          </fieldset>
          <Selector
            id="condicionIva"
            name="condicionIva"
            etiqueta="Condición frente al IVA"
            opciones={opciones.ivas}
            defaultValue={v('condicionIva') || '5'}
            error={e.condicionIva}
          />
          <Selector
            id="tipoDocumento"
            name="tipoDocumento"
            etiqueta="Tipo de documento"
            opciones={opciones.documentos}
            defaultValue={v('tipoDocumento') || '80'}
            error={e.tipoDocumento}
          />
          <Campo
            id="numeroDocumento"
            name="numeroDocumento"
            etiqueta="Número"
            defaultValue={v('numeroDocumento')}
            error={e.numeroDocumento}
            inputMode="numeric"
            className="cifras"
          />
          <Selector
            id="iibbRegimen"
            name="iibbRegimen"
            etiqueta="Ingresos Brutos"
            vacio="Sin datos"
            opciones={[
              { valor: 'local', texto: 'Contribuyente local' },
              { valor: 'convenio', texto: 'Convenio Multilateral' },
              { valor: 'exento', texto: 'Exento' },
              { valor: 'no_inscripto', texto: 'No inscripto' },
            ]}
            defaultValue={v('iibbRegimen')}
          />
          <Campo id="iibbNumero" name="iibbNumero" etiqueta="Número de IIBB" defaultValue={v('iibbNumero')} />
        </Seccion>

        <Seccion titulo="Contacto y domicilio">
          <Campo id="email" name="email" type="email" etiqueta="Email" defaultValue={v('email')} error={e.email} />
          <Campo id="telefono" name="telefono" etiqueta="Teléfono" defaultValue={v('telefono')} />
          <Campo id="domicilio" name="domicilio" etiqueta="Domicilio" defaultValue={v('domicilio')} />
          <Campo id="localidad" name="localidad" etiqueta="Localidad" defaultValue={v('localidad')} />
          <Campo id="codigoPostal" name="codigoPostal" etiqueta="Código postal" defaultValue={v('codigoPostal')} />
          <Selector
            id="provincia"
            name="provincia"
            etiqueta="Provincia"
            vacio="Elegí"
            opciones={opciones.provincias}
            defaultValue={v('provincia')}
          />
        </Seccion>

        <Seccion titulo="Condiciones comerciales">
          <Selector
            id="listaPreciosId"
            name="listaPreciosId"
            etiqueta="Lista de precios"
            vacio="La de la empresa"
            opciones={opciones.listas}
            defaultValue={v('listaPreciosId')}
          />
          <Selector
            id="condicionPagoId"
            name="condicionPagoId"
            etiqueta="Condición de pago"
            vacio="Contado"
            opciones={opciones.condiciones}
            defaultValue={v('condicionPagoId')}
          />
          <Selector
            id="vendedorId"
            name="vendedorId"
            etiqueta="Vendedor"
            vacio="Sin vendedor"
            opciones={opciones.vendedores}
            defaultValue={v('vendedorId')}
          />
          <Campo
            id="descuento"
            name="descuento"
            etiqueta="Descuento general (%)"
            defaultValue={v('descuento')}
            error={e.descuento}
            inputMode="decimal"
            className="cifras"
          />
          <Campo
            id="limiteCredito"
            name="limiteCredito"
            etiqueta="Límite de crédito ($)"
            defaultValue={v('limiteCredito')}
            error={e.limiteCredito}
            inputMode="decimal"
            className="cifras"
          />
          <Campo
            id="percepcionIibb"
            name="percepcionIibb"
            etiqueta="Percepción IIBB (%)"
            ayuda="Vacío: la general de la empresa. 0: no se le percibe."
            defaultValue={v('percepcionIibb')}
            error={e.percepcionIibb}
            inputMode="decimal"
            className="cifras"
          />
          <Selector
            id="zonaId"
            name="zonaId"
            etiqueta="Zona"
            vacio="Sin zona"
            opciones={opciones.zonas}
            defaultValue={v('zonaId')}
          />
          <Selector
            id="transporteId"
            name="transporteId"
            etiqueta="Transporte habitual"
            vacio="Sin transporte"
            opciones={opciones.transportes}
            defaultValue={v('transporteId')}
          />
        </Seccion>

        <Panel className="p-4">
          <label htmlFor="notas" className="text-xs font-medium text-texto-2">
            Notas internas
          </label>
          <textarea
            id="notas"
            name="notas"
            rows={3}
            defaultValue={v('notas')}
            className="mt-1 w-full rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
          />
        </Panel>
      </fieldset>

      {!soloLectura && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-borde bg-fondo/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <span className="mr-auto hidden items-center gap-1 text-xs text-texto-3 sm:flex">
            <Tecla>Ctrl</Tecla> <Tecla>Enter</Tecla> para grabar
          </span>
          <BotonEnlace href={id ? `/terceros/${id}` : '/terceros'} variante="fantasma">
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
