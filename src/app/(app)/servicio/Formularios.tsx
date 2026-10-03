'use client'

import { Star } from 'lucide-react'
import { useActionState, useEffect, useState, useTransition } from 'react'

import { Buscador } from '@/components/comercial/Buscador'
import { FormularioDinamico } from '@/components/servicio/FormularioDinamico'
import { Aviso, Boton } from '@/components/ui'
import type { Campo, Valores } from '@/modulos/servicio/formularios'
import { CIERRES, COBERTURAS, TIPOS_ORDEN } from '@/modulos/servicio/tipos'

import {
  buscarArticulosOrden,
  buscarClientesServicio,
  buscarHuecosAccion,
  cancelarAccion,
  cerrarAccion,
  recerrarAccion,
  equiposDelClienteAccion,
  facturarAccion,
  guardarOrdenAccion,
  itemAccion,
  programarAccion,
  visitaAccion,
  type Estado,
} from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'
type Opcion = { valor: string; texto: string }
type Cliente = Awaited<ReturnType<typeof buscarClientesServicio>>[number]
type EquipoCliente = Awaited<ReturnType<typeof equiposDelClienteAccion>>[number]
type Articulo = Awaited<ReturnType<typeof buscarArticulosOrden>>[number]

function Resultado({ estado }: { estado: Estado }) {
  if (estado?.error) return <Aviso>{estado.error}</Aviso>
  if (estado?.aviso) return <Aviso tono="aviso">{estado.aviso}</Aviso>
  if (estado?.ok) return <Aviso tono="ok">{estado.ok}</Aviso>
  return null
}

function SelectorTecnico({
  tecnicos,
  inicial,
  nombre = 'tecnicoId',
}: {
  tecnicos: Opcion[]
  inicial?: string | null
  nombre?: string
}) {
  return (
    <select name={nombre} defaultValue={inicial ?? ''} className={control}>
      <option value="">Sin asignar</option>
      {tecnicos.map((t) => (
        <option key={t.valor} value={t.valor}>
          {t.texto}
        </option>
      ))}
    </select>
  )
}

// ------------------------------------------------------------------ Orden

export type DatosOrden = {
  fecha: string
  terceroId: string
  cliente: string
  equipoId: string | null
  tipo: string
  prioridad: string
  falla: string
  contacto: string | null
  telefono: string | null
  email: string | null
  domicilio: string | null
  tecnicoId: string | null
  programada: string | null
  hora: string | null
  duracion: number
  cobertura: string
  observaciones: string | null
  tipoOrdenId: string | null
  instrucciones: Valores
}

export type TipoParaOrden = { id: string; nombre: string; clase: string; duracion: number; instrucciones: Campo[] }

export function FormularioOrden({
  id,
  inicial,
  tecnicos,
  tipos,
}: {
  id: string | null
  inicial: Partial<DatosOrden> & { fecha: string }
  tecnicos: Opcion[]
  tipos: TipoParaOrden[]
}) {
  const [estado, accion, enviando] = useActionState(guardarOrdenAccion.bind(null, id), undefined)
  const [tipoId, setTipoId] = useState(inicial.tipoOrdenId ?? (id ? '' : (tipos[0]?.id ?? '')))
  const tipo = tipos.find((t) => t.id === tipoId)
  const [cliente, setCliente] = useState(inicial.terceroId ? { id: inicial.terceroId, razonSocial: inicial.cliente ?? '' } : null)
  const [equipos, setEquipos] = useState<EquipoCliente[] | null>(null)
  const [equipoId, setEquipoId] = useState(inicial.equipoId ?? '')

  useEffect(() => {
    let vigente = true
    if (cliente) equiposDelClienteAccion(cliente.id).then((e) => vigente && setEquipos(e))
    return () => {
      vigente = false
    }
  }, [cliente])

  const elegido = equipos?.find((e) => e.id === equipoId)
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Cliente</span>
        <input type="hidden" name="terceroId" value={cliente?.id ?? ''} />
        {cliente ? (
          <div className="flex h-9 items-center justify-between rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
            <span className="truncate text-sm font-medium">{cliente.razonSocial}</span>
            <button
              type="button"
              onClick={() => {
                setCliente(null)
                setEquipos(null)
                setEquipoId('')
              }}
              className="text-xs text-acento hover:underline"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <Buscador<Cliente>
            etiqueta="Buscar cliente"
            placeholder="Nombre, código o CUIT"
            buscar={buscarClientesServicio}
            clave={(c) => c.id}
            render={(c) => c.razonSocial}
            alElegir={(c) => setCliente({ id: c.id, razonSocial: c.razonSocial })}
            autoFocus={!id}
          />
        )}
      </div>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Equipo</span>
        <select
          name="equipoId"
          value={equipoId}
          onChange={(e) => setEquipoId(e.target.value)}
          className={control}
          disabled={!cliente}
        >
          <option value="">
            {cliente
              ? equipos?.length === 0
                ? 'El cliente no tiene equipos instalados'
                : 'Sin equipo'
              : 'Elegí primero el cliente'}
          </option>
          {equipos?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.serie}
              {e.modelo ? ` · ${e.modelo}` : ''}
              {e.sector ? ` · ${e.sector}` : ''}
              {e.contratoId ? ' · en contrato' : ''}
            </option>
          ))}
          {/* Mientras cargan los equipos, el elegido sigue en el formulario. */}
          {!equipos && inicial.equipoId && <option value={inicial.equipoId}>Equipo actual</option>}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha del pedido</span>
        <input type="date" name="fecha" defaultValue={inicial.fecha} className={control} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Tipo de orden</span>
        <select name="tipoOrdenId" value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={control}>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
          <option value="">Sin formulario</option>
        </select>
      </label>
      {!tipo && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Clase</span>
          <select name="tipo" defaultValue={inicial.tipo ?? 'correctivo'} className={control}>
            {Object.entries(TIPOS_ORDEN).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Prioridad</span>
        <select name="prioridad" defaultValue={inicial.prioridad ?? 'normal'} className={control}>
          <option value="normal">Normal</option>
          <option value="urgente">Urgente</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Quién paga</span>
        <select name="cobertura" defaultValue={id ? inicial.cobertura : ''} className={control}>
          {!id && (
            <option value="">
              Según el equipo
              {elegido
                ? ` (${elegido.contratoId ? 'contrato' : elegido.garantiaHasta && elegido.garantiaHasta >= inicial.fecha ? 'garantía' : 'con cargo'})`
                : ''}
            </option>
          )}
          {Object.entries(COBERTURAS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
        <span className={etiqueta}>Pedido del cliente (resumen)</span>
        <textarea
          name="falla"
          defaultValue={inicial.falla ?? ''}
          rows={2}
          required
          className="rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm focus:border-acento"
        />
      </label>
      {tipo && tipo.instrucciones.some((c) => c.tipo !== 'equipo') && (
        <div className="rounded-md border border-borde p-3 sm:col-span-2 lg:col-span-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-texto-2 uppercase">Instrucciones para el técnico</p>
          <FormularioDinamico
            key={tipo.id}
            campos={tipo.instrucciones}
            inicial={tipo.id === inicial.tipoOrdenId ? inicial.instrucciones : null}
            nombre="instrucciones"
            contexto={{ omitir: ['equipo'] }}
          />
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Contacto</span>
        <input
          name="contacto"
          defaultValue={inicial.contacto ?? ''}
          placeholder="Del equipo, si se deja vacío"
          className={control}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Teléfono</span>
        <input name="telefono" defaultValue={inicial.telefono ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Email para avisos</span>
        <input
          name="email"
          type="email"
          defaultValue={inicial.email ?? ''}
          placeholder="El de la ficha, si se deja vacío"
          className={control}
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Domicilio de la visita</span>
        <input
          name="domicilio"
          defaultValue={inicial.domicilio ?? ''}
          placeholder="El del equipo, si se deja vacío"
          className={control}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Técnico</span>
        <SelectorTecnico tecnicos={tecnicos} inicial={inicial.tecnicoId} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Visita programada</span>
        <input type="date" name="programada" defaultValue={inicial.programada ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Hora</span>
        <input type="time" name="hora" defaultValue={inicial.hora ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Duración (minutos)</span>
        <input
          name="duracion"
          inputMode="numeric"
          defaultValue={id ? inicial.duracion : ''}
          placeholder={tipo ? String(tipo.duracion) : '60'}
          className={`${control} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Observaciones internas</span>
        <input name="observaciones" defaultValue={inicial.observaciones ?? ''} className={control} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Grabando…' : id ? 'Guardar cambios' : 'Abrir la orden'}
          </Boton>
        </div>
      </div>
    </form>
  )
}

type Hueco = Extract<Awaited<ReturnType<typeof buscarHuecosAccion>>, { huecos: unknown }>['huecos'][number]

/** Programar la visita a mano o con el asistente de huecos (el "Coordinator" de Persat). */
export function Programar({
  id,
  tecnicos,
  inicial,
  hoy,
}: {
  id: string
  tecnicos: Opcion[]
  inicial: { tecnicoId: string | null; programada: string | null; hora: string | null; duracion: number; acompanantes: string[] }
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(programarAccion.bind(null, id), undefined)
  const [valores, setValores] = useState(inicial)
  const [huecos, setHuecos] = useState<Hueco[] | null>(null)
  const [error, setError] = useState('')
  const [buscando, iniciar] = useTransition()
  const buscar = () =>
    iniciar(async () => {
      setError('')
      const r = await buscarHuecosAccion(id, valores.programada ?? hoy)
      if (r.ok) setHuecos(r.huecos)
      else setError(r.error)
    })
  return (
    <div className="flex flex-col gap-3">
      <form action={accion} className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={etiqueta}>Técnico</span>
          <select
            name="tecnicoId"
            value={valores.tecnicoId ?? ''}
            onChange={(e) => setValores({ ...valores, tecnicoId: e.target.value || null })}
            className={control}
          >
            <option value="">Sin técnico</option>
            {tecnicos.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        {valores.tecnicoId && tecnicos.length > 1 && (
          <fieldset className="flex flex-col gap-1 sm:col-span-2">
            <legend className={etiqueta}>Acompañantes</legend>
            <input type="hidden" name="conAcompanantes" value="1" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
              {tecnicos
                .filter((t) => t.valor !== valores.tecnicoId)
                .map((t) => (
                  <label key={t.valor} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name="acompanantes"
                      value={t.valor}
                      checked={valores.acompanantes.includes(t.valor)}
                      onChange={(e) =>
                        setValores({
                          ...valores,
                          acompanantes: e.target.checked
                            ? [...valores.acompanantes, t.valor]
                            : valores.acompanantes.filter((x) => x !== t.valor),
                        })
                      }
                    />
                    {t.texto}
                  </label>
                ))}
            </div>
          </fieldset>
        )}
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Día</span>
          <input
            type="date"
            name="programada"
            value={valores.programada ?? ''}
            onChange={(e) => setValores({ ...valores, programada: e.target.value || null })}
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Hora</span>
          <input
            type="time"
            name="hora"
            value={valores.hora ?? ''}
            onChange={(e) => setValores({ ...valores, hora: e.target.value || null })}
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Duración (min)</span>
          <input
            name="duracion"
            inputMode="numeric"
            value={valores.duracion}
            onChange={(e) => setValores({ ...valores, duracion: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            className={`${control} cifras`}
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <Boton type="submit" variante="primario" disabled={enviando}>
            Programar
          </Boton>
          <Boton type="button" onClick={buscar} disabled={buscando || !tecnicos.length}>
            {buscando ? 'Buscando…' : 'Buscar huecos'}
          </Boton>
        </div>
        <div className="sm:col-span-2">
          <Resultado estado={estado} />
        </div>
      </form>
      {error && <Aviso>{error}</Aviso>}
      {huecos &&
        (huecos.length ? (
          <ul className="divide-y divide-borde rounded-md border border-borde text-sm">
            {huecos.map((h) => (
              <li key={`${h.tecnicoId}${h.fecha}`}>
                <button
                  type="button"
                  onClick={() => {
                    setValores({ ...valores, tecnicoId: h.tecnicoId, programada: h.fecha, hora: h.hora })
                    setHuecos(null)
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-superficie-2"
                >
                  <span>
                    <span className="font-medium">{h.tecnico}</span>
                    <span className="block text-xs text-texto-2">
                      {h.fecha.split('-').reverse().join('/')} a las {h.hora} · libre hasta las {h.hasta}
                      {h.viaje !== null && ` · ${h.viaje ? `${h.viaje} min de viaje` : 'en el mismo lugar'}`}
                    </span>
                  </span>
                  <span className="flex text-aviso" aria-label={`${h.estrellas} de 5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} aria-hidden className={`size-3.5 ${i < h.estrellas ? 'fill-current' : 'opacity-30'}`} />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Aviso tono="aviso">No hay huecos en la próxima semana con la jornada de los técnicos.</Aviso>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------- Trabajo

export function Visita({
  id,
  tecnicos,
  tecnicoId,
  hoy,
}: {
  id: string
  tecnicos: Opcion[]
  tecnicoId: string | null
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(visitaAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_6rem]">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha</span>
        <input type="date" name="fecha" defaultValue={hoy} className={control} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Técnico</span>
        <SelectorTecnico tecnicos={tecnicos} inicial={tecnicoId} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Horas</span>
        <input name="horas" inputMode="decimal" placeholder="1,5" className={`${control} cifras`} />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-3">
        <span className={etiqueta}>Qué se hizo</span>
        <input name="detalle" required className={control} placeholder="Diagnóstico, limpieza, cambio de repuesto…" />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" disabled={enviando}>
            Cargar visita
          </Boton>
        </div>
      </div>
    </form>
  )
}

export function Item({
  id,
  depositos,
  conCargo,
  alicuotas,
}: {
  id: string
  depositos: Opcion[]
  conCargo: boolean
  alicuotas: { valor: number; texto: string }[]
}) {
  const [articulo, setArticulo] = useState<Articulo | null>(null)
  const [estado, accion, enviando] = useActionState(async (anterior: Estado, datos: FormData) => {
    const r = await itemAccion(id, anterior, datos)
    // Cargado (con o sin aviso de stock): el formulario queda listo para el siguiente.
    if (r?.ok || r?.aviso) setArticulo(null)
    return r
  }, undefined)
  // Precio e IVA salen del artículo elegido; al cambiarlo se vuelven a armar.
  const deArticulo = articulo?.id ?? 'concepto'

  return (
    <form action={accion} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1fr)_8rem_6rem]">
      <div className="flex flex-col gap-1">
        <span className={etiqueta}>Artículo o concepto</span>
        <input type="hidden" name="articuloId" value={articulo?.id ?? ''} />
        {articulo ? (
          <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
            <span className="truncate text-sm">
              <span className="cifras text-texto-3">{articulo.codigo}</span> {articulo.nombre}
            </span>
            <button type="button" onClick={() => setArticulo(null)} className="text-xs text-acento hover:underline">
              Cambiar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Buscador<Articulo>
              etiqueta="Buscar artículo"
              placeholder="Código o nombre del insumo o repuesto"
              buscar={(t) => buscarArticulosOrden(id, t)}
              clave={(a) => a.id}
              render={(a) => (
                <span>
                  <span className="cifras text-texto-3">{a.codigo}</span> {a.nombre}
                </span>
              )}
              alElegir={setArticulo}
            />
            <input name="descripcion" placeholder="…o escribí un concepto (Mano de obra, Viático)" className={control} />
          </div>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Cantidad</span>
        <input name="cantidad" defaultValue="1" inputMode="decimal" className={`${control} cifras`} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Sale del depósito</span>
        <select name="depositoId" className={control} disabled={!articulo?.llevaStock}>
          {articulo?.llevaStock ? (
            depositos.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.texto}
              </option>
            ))
          ) : (
            <option value="">No lleva stock</option>
          )}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Precio unitario sin IVA</span>
        <input
          key={deArticulo}
          name="precioUnitario"
          defaultValue={conCargo && articulo?.precio ? articulo.precio.replace('.', ',') : ''}
          inputMode="decimal"
          placeholder={conCargo ? '0,00' : 'Sin cargo'}
          className={`${control} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>IVA</span>
        <select key={deArticulo} name="alicuotaIva" defaultValue={articulo?.alicuotaIva ?? 5} className={control}>
          {alicuotas.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.texto}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-5">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" disabled={enviando}>
            Agregar
          </Boton>
        </div>
      </div>
    </form>
  )
}

/** Cierre del supervisor: después del informe del técnico, o directo desde la oficina. */
export function Cerrar({
  id,
  hoy,
  conEquipo,
  sugerido,
  informada,
}: {
  id: string
  hoy: string
  conEquipo: boolean
  sugerido: string | null
  informada: boolean
}) {
  const [estado, accion, enviando] = useActionState(cerrarAccion.bind(null, id), undefined)
  const [cierre, setCierre] = useState(sugerido ?? 'ok')
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-3">
      <fieldset className="flex flex-col gap-1 sm:col-span-3">
        <legend className={`${etiqueta} mb-1`}>
          Cierre{sugerido && ` (el técnico propuso: ${CIERRES[sugerido as keyof typeof CIERRES]})`}
        </legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CIERRES).map(([k, t]) => (
            <label
              key={k}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${cierre === k ? 'border-acento bg-acento-suave' : 'border-borde'}`}
            >
              <input
                type="radio"
                name="cierre"
                value={k}
                checked={cierre === k}
                onChange={() => setCierre(k)}
                className="sr-only"
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha</span>
        <input type="date" name="fecha" defaultValue={hoy} className={control} required />
      </label>
      {conEquipo && !informada && (
        <>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Contador del equipo (opcional)</span>
            <input name="contador" inputMode="numeric" className={`${control} cifras`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Copias de prueba</span>
            <input name="creditos" inputMode="numeric" className={`${control} cifras`} />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 sm:col-span-3">
        <span className={etiqueta}>
          {informada ? 'Nota del supervisor' : 'Qué se hizo'}
          {cierre !== 'ok' ? ' (obligatoria: el desvío o por qué no se cumplió)' : informada ? ' (opcional)' : ''}
        </span>
        <textarea
          name="nota"
          rows={2}
          className="rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm focus:border-acento"
        />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            Cerrar la orden
          </Boton>
        </div>
      </div>
    </form>
  )
}

export function Cancelar({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(cancelarAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-60 flex-1 flex-col gap-1">
        <span className={etiqueta}>Motivo</span>
        <input name="motivo" required className={control} placeholder="El cliente lo resolvió, pedido duplicado…" />
      </label>
      <Boton type="submit" disabled={enviando}>
        Cancelar la orden
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

export function Facturar({ id, puntos, hoy }: { id: string; puntos: { valor: number; texto: string }[]; hoy: string }) {
  const [estado, accion, enviando] = useActionState(facturarAccion.bind(null, id), undefined)
  if (!puntos.length) return <Aviso tono="aviso">No hay puntos de venta de factura electrónica activos.</Aviso>
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Punto de venta</span>
        <select name="puntoVenta" className={control}>
          {puntos.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.texto}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha</span>
        <input type="date" name="fecha" defaultValue={hoy} className={control} required />
      </label>
      <Boton type="submit" variante="primario" disabled={enviando}>
        {enviando ? 'Armando…' : 'Facturar en borrador'}
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

/** Cambiar el tipo de cierre de una orden cerrada (sin reabrirla). */
export function Recerrar({ id, actual, nota }: { id: string; actual: string; nota: string | null }) {
  const [estado, accion, enviando] = useActionState(recerrarAccion.bind(null, id), undefined)
  return (
    <details>
      <summary className="cursor-pointer text-sm text-acento hover:underline">Cambiar el tipo de cierre</summary>
      <form action={accion} className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap gap-3 text-sm">
          {Object.entries(CIERRES).map(([k, t]) => (
            <label key={k} className="flex items-center gap-1">
              <input type="radio" name="cierre" value={k} defaultChecked={actual === `cerrada_${k}`} /> {t}
            </label>
          ))}
        </div>
        <textarea
          name="nota"
          rows={2}
          defaultValue={nota ?? ''}
          placeholder="Desvío o por qué no se cumplió"
          className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm focus:border-acento"
        />
        <div>
          <Boton type="submit" disabled={enviando}>
            Guardar el cierre
          </Boton>
        </div>
        <Resultado estado={estado} />
      </form>
    </details>
  )
}
