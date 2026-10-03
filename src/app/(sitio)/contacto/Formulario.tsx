'use client'

import { CheckCircle2 } from 'lucide-react'
import { useActionState } from 'react'

import { Antibots } from '@/components/Antibots'
import { SOLUCIONES } from '@/components/sitio/soluciones'

import { enviarConsultaAccion } from './acciones'

const campo = 'h-11 w-full tarjeta px-3 text-[15px] focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20'

export function FormularioContacto({ origen }: { origen: string }) {
  const [estado, accion, enviando] = useActionState(enviarConsultaAccion, undefined)
  if (estado?.ok) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-xl border border-borde bg-superficie p-10 text-center"
      >
        <CheckCircle2 aria-hidden className="size-10 text-ok" />
        <p className="text-xl font-semibold">¡Gracias! Recibimos tu consulta.</p>
        <p className="text-texto-2">Te respondemos por email en el día hábil.</p>
        {estado.codigo && (
          <p className="text-sm text-texto-2">
            Código de tu trámite: <span className="cifras font-semibold text-texto">{estado.codigo}</span>
          </p>
        )}
      </div>
    )
  }
  return (
    <form action={accion} className="grid gap-4 rounded-xl border border-borde bg-superficie p-6 sm:grid-cols-2 sm:p-8">
      <input type="hidden" name="origen" value={origen} />
      <Antibots />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nombre y apellido
        <input name="nombre" required autoComplete="name" className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input name="email" type="email" required autoComplete="email" className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Teléfono <span className="font-normal text-texto-3">(opcional)</span>
        <input name="telefono" type="tel" autoComplete="tel" className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Empresa <span className="font-normal text-texto-3">(opcional)</span>
        <input name="empresa" autoComplete="organization" className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
        Rubro
        <select name="rubro" className={campo} defaultValue="">
          <option value="">Elegí uno</option>
          {SOLUCIONES.map((s) => (
            <option key={s.slug}>{s.menu}</option>
          ))}
          <option>Otro</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
        ¿En qué te podemos ayudar?
        <textarea
          name="mensaje"
          required
          minLength={10}
          rows={5}
          placeholder="Contanos qué sistema usás hoy, cuántas personas lo usarían y qué te gustaría resolver."
          className={`${campo} h-auto py-2`}
        />
      </label>
      {estado?.error && (
        <p role="alert" className="rounded-lg bg-error-suave px-3 py-2 text-sm text-error sm:col-span-2">
          {estado.error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-texto-3">Usamos tus datos solo para responderte. Ver la política de privacidad.</p>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-acento px-6 py-3 font-medium text-sobre-acento hover:bg-acento-hover disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : 'Enviar consulta'}
        </button>
      </div>
    </form>
  )
}
