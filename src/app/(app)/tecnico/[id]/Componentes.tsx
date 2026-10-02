'use client'

import { CloudOff, MapPinCheckInside } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useCallback, useState, useSyncExternalStore, useTransition } from 'react'

import { FormularioDinamico } from '@/components/servicio/FormularioDinamico'
import {
  borrarBorrador,
  encolar,
  guardarBorrador,
  leerBorrador,
  quitarInformesDe,
  sinConexion,
} from '@/components/servicio/sinSenal'
import { Aviso, Boton } from '@/components/ui'
import type { Campo, Valores } from '@/modulos/servicio/formularios'
import { CIERRES } from '@/modulos/servicio/tipos'

import { informarAccion, llegadaAccion, type Estado } from '../../servicio/acciones'

/** Solo en el navegador (el borrador y la cola viven en el celular). */
const sinSuscripcion = () => () => undefined
const useEnElNavegador = () =>
  useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  )

const ubicacion = () =>
  new Promise<{ lat: number | null; lng: number | null }>((ok) => {
    if (!('geolocation' in navigator)) return ok({ lat: null, lng: null })
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => ok({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  })

/** "Llegué": registra la hora y, si el celular la da, la ubicación. Sin señal queda guardado y se manda después. */
export function Llegue({ id }: { id: string }) {
  const router = useRouter()
  const [enviando, iniciar] = useTransition()
  const [error, setError] = useState('')
  const [guardada, setGuardada] = useState('')
  const marcar = () =>
    iniciar(async () => {
      setError('')
      const cuando = new Date().toISOString()
      const donde = await ubicacion()
      const guardarSinSenal = async () => {
        await encolar({ tipo: 'llegada', ordenId: id, cuando, ...donde })
        setGuardada(
          new Date(cuando).toLocaleTimeString('es-AR', { timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }),
        )
      }
      if (!navigator.onLine) return guardarSinSenal()
      try {
        const r = await llegadaAccion(id, { ...donde, cuando })
        if (!r.ok) setError(r.error)
        router.refresh()
      } catch (e) {
        if (sinConexion(e)) await guardarSinSenal()
        else throw e
      }
    })
  if (guardada) {
    return (
      <Aviso tono="aviso">
        <span className="flex items-center gap-2">
          <CloudOff aria-hidden className="size-4" /> Llegada de las {guardada} guardada en el celular: se manda cuando vuelva la
          señal.
        </span>
      </Aviso>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <Boton type="button" variante="primario" onClick={marcar} disabled={enviando} className="h-12 w-full text-base">
        <MapPinCheckInside aria-hidden className="size-5" /> {enviando ? 'Marcando…' : 'Llegué'}
      </Boton>
      {error && <Aviso>{error}</Aviso>}
    </div>
  )
}

type Props = { id: string; campos: Campo[]; equipos: { id: string; texto: string }[]; hoy: string }

/** Devolución del técnico. Se guarda como borrador mientras se completa; sin señal, queda en la cola del celular. */
export function InformeTecnico(props: Props) {
  // El borrador está en el celular: el formulario se arma recién en el navegador.
  return useEnElNavegador() ? <Informe {...props} /> : <p className="text-sm text-texto-3">Cargando el formulario…</p>
}

function Informe({ id, campos, equipos, hoy }: Props) {
  const [borrador] = useState(() => leerBorrador(id))
  const [cierre, setCierre] = useState(borrador.cierre ?? 'ok')
  const [encolado, setEncolado] = useState(false)
  const alCambiar = useCallback((resultados: Valores) => guardarBorrador(id, { resultados }), [id])

  const [estado, accion, enviando] = useActionState(async (anterior: Estado, datos: FormData): Promise<Estado> => {
    const pendiente = {
      tipo: 'informe' as const,
      ordenId: id,
      fecha: String(datos.get('fecha')),
      solucion: String(datos.get('solucion') ?? '').trim(),
      cierre: String(datos.get('cierre') ?? ''),
      resultados: JSON.parse(String(datos.get('resultados') || '{}')),
    }
    const guardarSinSenal = async () => {
      if (pendiente.solucion.length < 3) return { error: 'Escribí un resumen de lo que hiciste.' }
      await quitarInformesDe(id)
      await encolar(pendiente)
      setEncolado(true)
      return undefined
    }
    if (!navigator.onLine) return guardarSinSenal()
    try {
      // Lo que se mande ahora reemplaza lo que hubiera quedado en la cola de esta orden.
      await quitarInformesDe(id)
      const r = await informarAccion(id, anterior, datos)
      // Si salió bien, la acción ya llevó a la agenda; si no, el formulario sigue con lo cargado.
      if (!r?.error) borrarBorrador(id)
      else guardarBorrador(id, { solucion: pendiente.solucion, cierre: pendiente.cierre })
      return r
    } catch (e) {
      if (sinConexion(e)) return guardarSinSenal()
      throw e
    }
  }, undefined)

  if (encolado) {
    return (
      <div className="flex flex-col gap-3">
        <Aviso tono="aviso">
          <span className="flex items-center gap-2">
            <CloudOff aria-hidden className="size-4" /> Informe guardado en el celular. Se manda solo cuando vuelva la señal (con
            las fotos y la firma).
          </span>
        </Aviso>
        <Link href="/tecnico" className="text-sm text-acento hover:underline">
          Volver a Mi agenda
        </Link>
      </div>
    )
  }

  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="fecha" value={hoy} />
      <FormularioDinamico
        campos={campos}
        inicial={borrador.resultados as Valores | undefined}
        nombre="resultados"
        contexto={{ ordenId: id, equipos }}
        alCambiar={alCambiar}
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">
          Resumen de lo que hiciste <span className="text-error">*</span>
        </span>
        <textarea
          name="solucion"
          rows={3}
          required
          defaultValue={borrador.solucion ?? ''}
          onChange={(e) => guardarBorrador(id, { solucion: e.target.value })}
          className="rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
        />
      </label>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-texto-2">¿Cómo quedó?</legend>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(CIERRES).map(([k, t]) => (
            <label
              key={k}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm ${cierre === k ? 'border-acento bg-acento text-sobre-acento' : 'border-borde bg-superficie'}`}
            >
              <input
                type="radio"
                name="cierre"
                value={k}
                checked={cierre === k}
                onChange={() => {
                  setCierre(k)
                  guardarBorrador(id, { cierre: k })
                }}
                className="sr-only"
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando} className="h-12 w-full text-base">
        {enviando ? 'Enviando…' : 'Enviar el informe'}
      </Boton>
    </form>
  )
}
