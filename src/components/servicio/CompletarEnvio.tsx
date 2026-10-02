'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'

import { Buscador } from '@/components/comercial/Buscador'
import { FormularioDinamico } from '@/components/servicio/FormularioDinamico'
import { Aviso, Boton } from '@/components/ui'
import type { Campo, Valores } from '@/modulos/servicio/formularios'

type Resultado = { ok: true; id: string } | { ok: false; error: string }
type Cliente = { id: string; razonSocial: string }
type EstadoEnvio = { error?: string; ok?: string } | undefined

const etiqueta = 'text-xs font-medium text-texto-2'

/**
 * Completar un formulario suelto (oficina, técnico o portal). Es un borrador
 * en el servidor: las fotos y la firma se suben a medida que se cargan y lo
 * escrito se guarda solo, así no se pierde si se cierra la pantalla.
 */
export function CompletarEnvio({
  campos,
  inicial,
  pideCliente,
  cliente: clienteInicial,
  clienteFijo,
  ubicar,
  buscarClientes,
  equiposDe,
  enviar,
  guardar,
  subir,
  quitar,
  descartar,
  rutaArchivos,
}: {
  campos: Campo[]
  inicial: Valores
  pideCliente: boolean
  cliente: Cliente | null
  /** En el portal el cliente es el de la sesión. */
  clienteFijo?: boolean
  /** Manda la ubicación del celular con el envío (técnico). */
  ubicar?: boolean
  buscarClientes?: (texto: string) => Promise<(Cliente & { codigo?: string | null })[]>
  equiposDe: (terceroId: string) => Promise<{ id: string; serie: string; modelo: string | null; sector: string | null }[]>
  enviar: (estado: EstadoEnvio, fd: FormData) => Promise<EstadoEnvio>
  guardar: (valores: Valores, terceroId: string | null) => Promise<unknown>
  subir: (clase: 'foto' | 'firma', fd: FormData) => Promise<Resultado>
  quitar: (id: string) => Promise<unknown>
  descartar: () => Promise<unknown>
  rutaArchivos: string
}) {
  const [estado, accion, enviando] = useActionState(enviar, undefined)
  const [cliente, setCliente] = useState<Cliente | null>(clienteInicial)
  const [equipos, setEquipos] = useState<{ id: string; texto: string }[]>([])
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null)
  const valores = useRef<Valores>(inicial)
  const pendiente = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let vigente = true
    if (cliente)
      equiposDe(cliente.id)
        .then(
          (l) =>
            vigente &&
            setEquipos(
              l.map((e) => ({
                id: e.id,
                texto: `${e.modelo ? `${e.modelo} · ` : ''}${e.serie}${e.sector ? ` · ${e.sector}` : ''}`,
              })),
            ),
        )
        .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [cliente, equiposDe])

  useEffect(() => {
    if (!ubicar || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (p) => setUbicacion({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 120_000 },
    )
  }, [ubicar])

  // Guarda el borrador un ratito después del último cambio.
  const programarGuardado = useCallback(
    (terceroId: string | null) => {
      if (pendiente.current) clearTimeout(pendiente.current)
      pendiente.current = setTimeout(() => void guardar(valores.current, terceroId).catch(() => undefined), 1500)
    },
    [guardar],
  )
  const alCambiar = useCallback(
    (v: Valores) => {
      if (JSON.stringify(v) === JSON.stringify(valores.current)) return
      valores.current = v
      programarGuardado(cliente?.id ?? null)
    },
    [programarGuardado, cliente],
  )

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="terceroId" value={cliente?.id ?? ''} />
      {ubicacion && (
        <>
          <input type="hidden" name="lat" value={ubicacion.lat} />
          <input type="hidden" name="lng" value={ubicacion.lng} />
        </>
      )}
      {pideCliente && !clienteFijo && (
        <div className="flex flex-col gap-1">
          <span className={etiqueta}>Cliente</span>
          {cliente ? (
            <div className="flex h-10 items-center justify-between rounded-md border border-borde bg-superficie-2 px-2.5">
              <span className="truncate text-sm font-medium">{cliente.razonSocial}</span>
              <button
                type="button"
                onClick={() => {
                  setCliente(null)
                  setEquipos([])
                  programarGuardado(null)
                }}
                className="text-xs text-acento hover:underline"
              >
                Cambiar
              </button>
            </div>
          ) : buscarClientes ? (
            <Buscador<Cliente>
              etiqueta="Buscar cliente"
              placeholder="Nombre, código o CUIT"
              buscar={buscarClientes}
              clave={(c) => c.id}
              render={(c) => c.razonSocial}
              alElegir={(c) => {
                setCliente({ id: c.id, razonSocial: c.razonSocial })
                programarGuardado(c.id)
              }}
            />
          ) : null}
        </div>
      )}
      <FormularioDinamico
        campos={campos}
        inicial={inicial}
        nombre="valores"
        alCambiar={alCambiar}
        contexto={{ equipos, archivos: { subir, quitar, ruta: rutaArchivos } }}
      />
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
          {enviando ? 'Enviando…' : 'Enviar'}
        </Boton>
        <Boton
          type="button"
          className="h-10"
          disabled={enviando}
          onClick={() => {
            if (confirm('¿Descartar este formulario? Se pierde lo cargado.')) void descartar()
          }}
        >
          Descartar
        </Boton>
      </div>
    </form>
  )
}
