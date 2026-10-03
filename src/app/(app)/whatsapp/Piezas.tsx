'use client'

import { Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { autorizarAccion, enviarAccion, guardarCuentaAccion } from './acciones'

const campo = 'rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave'

/** Vuelve a pedir la bandeja cada tanto para ver los mensajes nuevos. */
export function Refrescar({ segundos }: { segundos: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, segundos * 1000)
    return () => clearInterval(t)
  }, [router, segundos])
  return null
}

/** Al abrir una conversación, se baja hasta el último mensaje. */
export function AlFinal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.scrollIntoView({ block: 'end' }), [])
  return <div ref={ref} />
}

export function Responder({ id, dentro, plantilla }: { id: string; dentro: boolean; plantilla: boolean }) {
  const [estado, accion, enviando] = useActionState(enviarAccion.bind(null, id), undefined)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok) form.current?.reset()
  }, [estado])
  const bloqueado = !dentro && !plantilla
  return (
    <form
      ref={form}
      action={accion}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          e.currentTarget.requestSubmit()
        }
      }}
      className="flex flex-col gap-2 border-t border-borde bg-superficie p-3"
    >
      {!dentro && (
        <p className="text-xs text-aviso">
          {plantilla
            ? 'Pasaron más de 24 horas desde su último mensaje: se manda con la plantilla aprobada.'
            : 'Pasaron más de 24 horas desde su último mensaje: para escribirle hace falta una plantilla aprobada (Configuración).'}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          name="texto"
          rows={2}
          required
          disabled={bloqueado}
          aria-label="Mensaje"
          placeholder="Escribí un mensaje (Enter manda, Mayús+Enter baja de línea)"
          className={`${campo} min-w-0 flex-1 resize-none py-2`}
        />
        <Boton type="submit" variante="primario" disabled={enviando || bloqueado} aria-label="Enviar">
          <Send aria-hidden />
        </Boton>
      </div>
      {estado?.error && <p className="text-xs text-error">{estado.error}</p>}
    </form>
  )
}

export function FormCuenta({
  cuenta,
}: {
  cuenta: {
    numeroId: string
    plantilla: string | null
    idioma: string
    agente: boolean
    registroFacturas: boolean
    instrucciones: string | null
    activa: boolean
  } | null
}) {
  const [estado, accion, enviando] = useActionState(guardarCuentaAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Phone number ID
          <input name="numeroId" required defaultValue={cuenta?.numeroId} inputMode="numeric" className={`${campo} h-9`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          App secret
          <input
            name="secretoApp"
            type="password"
            autoComplete="off"
            placeholder={cuenta ? 'Guardado (escribí para cambiarlo)' : ''}
            className={`${campo} h-9`}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Token de acceso permanente (usuario del sistema)
        <input
          name="token"
          type="password"
          autoComplete="off"
          placeholder={cuenta ? 'Guardado (escribí para cambiarlo)' : ''}
          className={`${campo} h-9`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Plantilla para escribir fuera de las 24 horas (opcional)
          <input name="plantilla" defaultValue={cuenta?.plantilla ?? ''} placeholder="aviso_general" className={`${campo} h-9`} />
          <span className="font-normal text-texto-3">
            Una plantilla aprobada en Meta con un solo parámetro de texto en el cuerpo: {'{{1}}'}.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Idioma
          <input name="idioma" defaultValue={cuenta?.idioma ?? 'es_AR'} className={`${campo} h-9`} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agente" defaultChecked={cuenta?.agente} className="mt-0.5" />
        <span>
          <span className="font-medium">Agente de atención.</span>{' '}
          <span className="text-texto-2">
            Contesta a tus clientes (saldo, facturas, links de pago, estado de pedidos y servicios) y te pasa la conversación
            cuando hace falta una persona.
          </span>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Indicaciones para el agente (opcional)
        <textarea
          name="instrucciones"
          rows={3}
          defaultValue={cuenta?.instrucciones ?? ''}
          placeholder="Ej.: Atendemos de 9 a 18. No prometas plazos de entrega."
          className={`${campo} py-2`}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="registroFacturas" defaultChecked={cuenta?.registroFacturas} className="mt-0.5" />
        <span>
          <span className="font-medium">Registro de facturas por WhatsApp.</span>{' '}
          <span className="text-texto-2">
            Las personas autorizadas (abajo) mandan la foto o el PDF de una factura de proveedor y queda lista para revisar en
            Compras.
          </span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activa" defaultChecked={cuenta?.activa ?? true} /> Conexión activa
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando} className="self-start">
        {enviando ? 'Probando con Meta…' : cuenta ? 'Guardar' : 'Conectar'}
      </Boton>
    </form>
  )
}

export function FormAutorizado({ personas }: { personas: { id: string; nombre: string }[] }) {
  const [estado, accion, enviando] = useActionState(autorizarAccion, undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Persona
        <select name="usuarioId" required className={`${campo} h-9`}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Celular
        <input name="telefono" required placeholder="11 5555-1234" className={`${campo} h-9`} />
      </label>
      <Boton type="submit" disabled={enviando}>
        Autorizar
      </Boton>
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
    </form>
  )
}
