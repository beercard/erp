'use client'

import { useActionState, useEffect, useState } from 'react'

import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton } from '@/components/ui'
import { FRECUENCIAS } from '@/modulos/servicio/tipos'

import { buscarClientesServicio, equiposDelClienteAccion, guardarReglaAccion } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'
type Cliente = Awaited<ReturnType<typeof buscarClientesServicio>>[number]
type Equipo = Awaited<ReturnType<typeof equiposDelClienteAccion>>[number]
type Opcion = { valor: string; texto: string }

export function FormularioRegla({ tipos, tecnicos, hoy }: { tipos: Opcion[]; tecnicos: Opcion[]; hoy: string }) {
  const [vuelta, setVuelta] = useState(0)
  const [estado, accion, enviando] = useActionState(
    async (anterior: Parameters<typeof guardarReglaAccion>[1], datos: FormData) => {
      const r = await guardarReglaAccion(null, anterior, datos)
      if (r?.ok) setVuelta((n) => n + 1)
      return r
    },
    undefined,
  )
  return (
    <div className="flex flex-col gap-2">
      <Campos key={vuelta} accion={accion} enviando={enviando} tipos={tipos} tecnicos={tecnicos} hoy={hoy} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
    </div>
  )
}

function Campos({
  accion,
  enviando,
  tipos,
  tecnicos,
  hoy,
}: {
  accion: (d: FormData) => void
  enviando: boolean
  tipos: Opcion[]
  tecnicos: Opcion[]
  hoy: string
}) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [frecuencia, setFrecuencia] = useState('mensual')
  useEffect(() => {
    let vigente = true
    if (cliente) equiposDelClienteAccion(cliente.id).then((e) => vigente && setEquipos(e))
    return () => {
      vigente = false
    }
  }, [cliente])
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Cliente</span>
        <input type="hidden" name="terceroId" value={cliente?.id ?? ''} />
        {cliente ? (
          <div className="flex h-9 items-center justify-between rounded-md border border-borde bg-superficie-2 px-2.5">
            <span className="truncate text-sm font-medium">{cliente.razonSocial}</span>
            <button type="button" onClick={() => setCliente(null)} className="text-xs text-acento hover:underline">
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
            alElegir={setCliente}
          />
        )}
      </div>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Equipo</span>
        <select name="equipoId" className={control} disabled={!cliente}>
          <option value="">{frecuencia === 'copias' ? 'Elegí el equipo…' : 'Todo el cliente'}</option>
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.serie}
              {e.modelo ? ` · ${e.modelo}` : ''}
              {e.sector ? ` · ${e.sector}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Tipo de orden</span>
        <select name="tipoOrdenId" className={control}>
          {tipos.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Frecuencia</span>
        <select name="frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} className={control}>
          {Object.entries(FRECUENCIAS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Cada (N)</span>
        <input
          name="cada"
          inputMode="numeric"
          required
          placeholder={frecuencia === 'copias' ? '30.000' : frecuencia === 'mensual' ? '3' : '2'}
          className={`${control} cifras`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>{frecuencia === 'copias' ? 'Vigente desde' : 'Primera visita'}</span>
        <input type="date" name="desde" defaultValue={hoy} className={control} required />
      </label>
      {frecuencia !== 'copias' && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Hora</span>
          <input type="time" name="hora" className={control} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Técnico</span>
        <select name="tecnicoId" className={control}>
          <option value="">Lo asigna la oficina</option>
          {tecnicos.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Observaciones (van en cada orden)</span>
        <input name="observaciones" className={control} />
      </label>
      <div className="sm:col-span-2 lg:col-span-4">
        <Boton type="submit" variante="primario" disabled={enviando}>
          Agregar la regla
        </Boton>
      </div>
    </form>
  )
}
