'use client'

import { useActionState, useEffect, useState } from 'react'

import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton } from '@/components/ui'
import { COBERTURAS, TIPOS_ORDEN } from '@/modulos/servicio/tipos'

import {
  asignarAccion,
  buscarArticulosOrden,
  buscarClientesServicio,
  cancelarAccion,
  equiposDelClienteAccion,
  facturarAccion,
  guardarOrdenAccion,
  itemAccion,
  resolverAccion,
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
  domicilio: string | null
  tecnicoId: string | null
  programada: string | null
  cobertura: string
  observaciones: string | null
}

export function FormularioOrden({
  id,
  inicial,
  tecnicos,
}: {
  id: string | null
  inicial: Partial<DatosOrden> & { fecha: string }
  tecnicos: Opcion[]
}) {
  const [estado, accion, enviando] = useActionState(guardarOrdenAccion.bind(null, id), undefined)
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
          <div className="flex h-9 items-center justify-between rounded-md border border-borde bg-superficie-2 px-2.5">
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
        <span className={etiqueta}>Tipo</span>
        <select name="tipo" defaultValue={inicial.tipo ?? 'correctivo'} className={control}>
          {Object.entries(TIPOS_ORDEN).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
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
        <span className={etiqueta}>Falla o pedido del cliente</span>
        <textarea
          name="falla"
          defaultValue={inicial.falla ?? ''}
          rows={3}
          required
          className="rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm focus:border-acento"
        />
      </label>
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

export function Asignar({
  id,
  tecnicos,
  tecnicoId,
  programada,
}: {
  id: string
  tecnicos: Opcion[]
  tecnicoId: string | null
  programada: string | null
}) {
  const [estado, accion, enviando] = useActionState(asignarAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className={etiqueta}>Técnico</span>
        <SelectorTecnico tecnicos={tecnicos} inicial={tecnicoId} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Visita programada</span>
        <input type="date" name="programada" defaultValue={programada ?? ''} className={control} />
      </label>
      <Boton type="submit" disabled={enviando}>
        Asignar
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
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
          <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-borde bg-superficie-2 px-2.5">
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

export function Resolver({ id, hoy, conEquipo }: { id: string; hoy: string; conEquipo: boolean }) {
  const [estado, accion, enviando] = useActionState(resolverAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Resuelta el</span>
        <input type="date" name="fecha" defaultValue={hoy} className={control} required />
      </label>
      {conEquipo && (
        <>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Contador del equipo (opcional)</span>
            <input name="contador" inputMode="numeric" className={`${control} cifras`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Copias de prueba (no se cobran)</span>
            <input name="creditos" inputMode="numeric" className={`${control} cifras`} />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 sm:col-span-3">
        <span className={etiqueta}>Solución</span>
        <textarea
          name="solucion"
          rows={2}
          required
          className="rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm focus:border-acento"
        />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            Dar por resuelta
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
