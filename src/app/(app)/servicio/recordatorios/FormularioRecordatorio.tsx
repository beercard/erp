'use client'

import { useActionState, useEffect, useState } from 'react'

import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton } from '@/components/ui'

import { buscarClientesServicio, equiposDelClienteAccion, guardarRecordatorioAccion } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'
type Cliente = Awaited<ReturnType<typeof buscarClientesServicio>>[number]
type Equipo = Awaited<ReturnType<typeof equiposDelClienteAccion>>[number]

export function FormularioRecordatorio({ hoy, email }: { hoy: string; email: string }) {
  const [vuelta, setVuelta] = useState(0)
  const [estado, accion, enviando] = useActionState(
    async (anterior: Parameters<typeof guardarRecordatorioAccion>[0], datos: FormData) => {
      const r = await guardarRecordatorioAccion(anterior, datos)
      if (r?.ok) setVuelta((n) => n + 1)
      return r
    },
    undefined,
  )
  return (
    <div className="flex flex-col gap-2">
      <Campos key={vuelta} accion={accion} enviando={enviando} hoy={hoy} email={email} />
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
    </div>
  )
}

function Campos({
  accion,
  enviando,
  hoy,
  email,
}: {
  accion: (d: FormData) => void
  enviando: boolean
  hoy: string
  email: string
}) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
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
          <div className="flex h-9 items-center justify-between rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
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
        <span className={etiqueta}>Equipo (opcional)</span>
        <select name="equipoId" className={control} disabled={!equipos.length}>
          <option value="" />
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.serie}
              {e.modelo ? ` · ${e.modelo}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Qué hay que hacer</span>
        <input name="titulo" required placeholder="Llamar por la renovación del contrato" className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha</span>
        <input type="date" name="fecha" defaultValue={hoy} required className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Hora</span>
        <input type="time" name="hora" className={control} />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Detalle</span>
        <input name="detalle" className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Avisar por email a</span>
        <input name="avisarA" type="email" defaultValue={email} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Días antes</span>
        <input name="diasAntes" inputMode="numeric" defaultValue="1" className={`${control} cifras`} />
      </label>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="color" name="color" defaultValue="#2563eb" className="h-9 w-12 rounded border border-borde" /> Color
        </label>
        <Boton type="submit" variante="primario" disabled={enviando}>
          Agregar
        </Boton>
      </div>
    </form>
  )
}
