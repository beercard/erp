'use client'

import { Building2, UserRound, X } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton, BotonEnlace, Campo, Panel, Selector } from '@/components/ui'

import { buscarClientesCrm, guardarOportunidadAccion } from './acciones'
import { Estrellas } from './componentes'

export type DatosOportunidad = {
  titulo: string
  terceroId: string | null
  cliente: string | null
  empresaProspecto: string | null
  contacto: string | null
  email: string | null
  telefono: string | null
  etapaId: string
  ingresoEsperado: string
  probabilidad: number
  cierreEstimado: string | null
  prioridad: number
  responsableId: string | null
  origen: string | null
  etiquetas: string[]
  proximoPaso: string | null
  descripcion: string | null
}

const ORIGENES = ['Web', 'WhatsApp', 'Llamada', 'Referido', 'Mercado Libre', 'Redes sociales', 'Feria o evento', 'Cliente actual']

/** Alta y edición de una oportunidad: cliente existente o prospecto, montos y seguimiento. */
export function FormularioOportunidad({
  id,
  inicial,
  etapas,
  personas,
  etiquetas,
}: {
  id: string | null
  inicial: DatosOportunidad
  etapas: { id: string; nombre: string; probabilidad: number }[]
  personas: { id: string; nombre: string }[]
  etiquetas: string[]
}) {
  const [estado, accion, enviando] = useActionState(guardarOportunidadAccion.bind(null, id), undefined)
  const v = (campo: keyof DatosOportunidad) => estado?.valores?.[campo] ?? String(inicial[campo] ?? '')
  const [cliente, setCliente] = useState<{ id: string; nombre: string } | null>(
    inicial.terceroId ? { id: inicial.terceroId, nombre: inicial.cliente ?? '' } : null,
  )
  const [prospecto, setProspecto] = useState(!inicial.terceroId && !!(inicial.empresaProspecto || inicial.contacto || !id))
  const [prioridad, setPrioridad] = useState(inicial.prioridad)
  const [etapa, setEtapa] = useState(v('etapaId'))
  const [probabilidad, setProbabilidad] = useState(v('probabilidad'))

  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Panel className="flex flex-col gap-5 p-5">
        <Campo
          id="titulo"
          name="titulo"
          etiqueta="Oportunidad"
          required
          autoFocus={!id}
          defaultValue={v('titulo')}
          placeholder="Ej.: Alquiler de 3 fotocopiadoras para la sede central"
          className="[&_input]:h-11 [&_input]:text-base [&_input]:font-semibold"
        />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[13px] font-medium text-texto-2">¿Para quién?</legend>
          <div role="radiogroup" className="flex w-fit rounded-lg bg-superficie-2 p-1">
            {[
              [false, 'Cliente cargado', Building2],
              [true, 'Prospecto nuevo', UserRound],
            ].map(([valor, texto, Icono]) => {
              const I = Icono as typeof Building2
              return (
                <button
                  key={String(valor)}
                  type="button"
                  role="radio"
                  aria-checked={prospecto === valor}
                  onClick={() => setProspecto(valor as boolean)}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-texto-2 aria-checked:bg-superficie aria-checked:font-medium aria-checked:text-texto aria-checked:shadow-suave"
                >
                  <I aria-hidden className="size-4" /> {texto as string}
                </button>
              )
            })}
          </div>
          {!prospecto ? (
            <div className="max-w-xl">
              <input type="hidden" name="terceroId" value={cliente?.id ?? ''} />
              {cliente ? (
                <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-3">
                  <span className="truncate text-sm font-medium">{cliente.nombre}</span>
                  <button
                    type="button"
                    onClick={() => setCliente(null)}
                    aria-label="Cambiar de cliente"
                    className="text-texto-3 hover:text-texto"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              ) : (
                <Buscador
                  etiqueta="Buscar cliente"
                  placeholder="Nombre, código o CUIT del cliente"
                  buscar={buscarClientesCrm}
                  clave={(c) => c.id}
                  render={(c) => (
                    <span className="flex justify-between gap-3">
                      <span className="truncate">{c.razonSocial}</span>
                      <span className="cifras text-xs text-texto-3">{c.codigo}</span>
                    </span>
                  )}
                  alElegir={(c) => setCliente({ id: c.id, nombre: c.razonSocial })}
                />
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="terceroId" value="" />
              <Campo id="empresaProspecto" name="empresaProspecto" etiqueta="Empresa" defaultValue={v('empresaProspecto')} />
              <Campo id="contacto" name="contacto" etiqueta="Contacto" defaultValue={v('contacto')} />
              <Campo id="email" name="email" type="email" etiqueta="Email" defaultValue={v('email')} />
              <Campo id="telefono" name="telefono" type="tel" etiqueta="Teléfono o WhatsApp" defaultValue={v('telefono')} />
            </div>
          )}
          {!prospecto && (
            <details className="text-sm">
              <summary className="cursor-pointer text-texto-2">Datos de contacto para esta oportunidad (opcional)</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Campo id="contacto" name="contacto" etiqueta="Contacto" defaultValue={v('contacto')} />
                <Campo id="email" name="email" type="email" etiqueta="Email" defaultValue={v('email')} />
                <Campo id="telefono" name="telefono" type="tel" etiqueta="Teléfono o WhatsApp" defaultValue={v('telefono')} />
              </div>
            </details>
          )}
        </fieldset>
      </Panel>

      <Panel className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Selector
          id="etapaId"
          name="etapaId"
          etiqueta="Etapa"
          value={etapa}
          onChange={(e) => {
            setEtapa(e.target.value)
            const p = etapas.find((x) => x.id === e.target.value)?.probabilidad
            if (p !== undefined) setProbabilidad(String(p))
          }}
          opciones={etapas.map((e) => ({ valor: e.id, texto: e.nombre }))}
        />
        <Campo
          id="ingresoEsperado"
          name="ingresoEsperado"
          etiqueta="Ingreso esperado sin IVA ($)"
          inputMode="decimal"
          defaultValue={v('ingresoEsperado') === '0.00' ? '' : v('ingresoEsperado')}
          placeholder="0"
        />
        <Campo
          id="probabilidad"
          name="probabilidad"
          etiqueta="Probabilidad (%)"
          type="number"
          min={0}
          max={100}
          value={probabilidad}
          onChange={(e) => setProbabilidad(e.target.value)}
          ayuda="Se completa con la de la etapa"
        />
        <Campo
          id="cierreEstimado"
          name="cierreEstimado"
          etiqueta="Cierre estimado"
          type="date"
          defaultValue={v('cierreEstimado')}
        />
        <Selector
          id="responsableId"
          name="responsableId"
          etiqueta="Responsable"
          defaultValue={v('responsableId')}
          vacio={id ? 'Sin asignar' : 'Yo'}
          opciones={personas.map((p) => ({ valor: p.id, texto: p.nombre }))}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="origen" className="text-[13px] font-medium text-texto-2">
            Origen
          </label>
          <input
            id="origen"
            name="origen"
            list="origenes"
            defaultValue={v('origen')}
            placeholder="Web, referido…"
            className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm shadow-suave"
          />
          <datalist id="origenes">
            {ORIGENES.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="etiquetas" className="text-[13px] font-medium text-texto-2">
            Etiquetas
          </label>
          <input
            id="etiquetas"
            name="etiquetas"
            list="etiquetas-usadas"
            defaultValue={estado?.valores?.etiquetas ?? inicial.etiquetas.join(', ')}
            placeholder="Separadas por coma: alquiler, urgente"
            className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm shadow-suave"
          />
          <datalist id="etiquetas-usadas">
            {etiquetas.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-texto-2">Prioridad</span>
          <input type="hidden" name="prioridad" value={prioridad} />
          <span className="flex h-9 items-center">
            <Estrellas valor={prioridad} alCambiar={setPrioridad} tamano="size-5" />
          </span>
        </div>
        <Campo
          id="proximoPaso"
          name="proximoPaso"
          etiqueta="Próximo paso"
          defaultValue={v('proximoPaso')}
          placeholder="Ej.: Mandar la propuesta con 2 opciones"
          className="sm:col-span-2 lg:col-span-3"
        />
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
          <label htmlFor="descripcion" className="text-[13px] font-medium text-texto-2">
            Notas internas
          </label>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={4}
            defaultValue={v('descripcion')}
            placeholder="Qué necesita, quién decide, plazos…"
            className="rounded-lg border border-borde-fuerte/80 bg-superficie px-3 py-2 text-sm shadow-suave"
          />
        </div>
      </Panel>

      <div className="flex justify-end gap-2">
        <BotonEnlace href={id ? `/crm/${id}` : '/crm'} variante="fantasma">
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {id ? 'Guardar cambios' : 'Crear oportunidad'}
        </Boton>
      </div>
    </form>
  )
}
