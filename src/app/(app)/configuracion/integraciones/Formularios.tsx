'use client'

import { Copy } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { EVENTOS } from '@/modulos/integraciones/eventos'

import { crearClaveAccion, crearWebhookAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

function Secreto({ valor, aviso }: { valor: string; aviso: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Aviso tono="aviso">
      <span className="flex flex-col gap-2">
        <span>{aviso}</span>
        <span className="flex items-center gap-2">
          <code className="cifras flex-1 rounded bg-superficie px-2 py-1 text-xs break-all text-texto">{valor}</code>
          <Boton
            type="button"
            onClick={() =>
              navigator.clipboard
                .writeText(valor)
                .then(() => setCopiado(true))
                .catch(() => undefined)
            }
          >
            <Copy aria-hidden className="size-4" /> {copiado ? 'Copiada' : 'Copiar'}
          </Boton>
        </span>
      </span>
    </Aviso>
  )
}

export function NuevaClave() {
  const [estado, accion, enviando] = useActionState(crearClaveAccion, undefined)
  return (
    <div className="flex flex-col gap-3">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className={etiqueta}>Nombre (para qué es)</span>
          <input name="nombre" required placeholder="Tienda online, MPS Monitor…" className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Acceso</span>
          <select name="acceso" className={control}>
            <option value="lectura">Solo lectura</option>
            <option value="total">Lectura y escritura</option>
          </select>
        </label>
        <Boton type="submit" variante="primario" disabled={enviando}>
          Crear clave
        </Boton>
      </form>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.clave && <Secreto valor={estado.clave} aviso="Copiala ahora: por seguridad no se vuelve a mostrar." />}
    </div>
  )
}

export function NuevoWebhook() {
  const [estado, accion, enviando] = useActionState(crearWebhookAccion, undefined)
  return (
    <div className="flex flex-col gap-3">
      <form action={accion} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Dirección (https://…)</span>
          <input name="url" type="url" required placeholder="https://mi-sistema.com/erp/eventos" className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Descripción</span>
          <input name="descripcion" className={control} />
        </label>
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className={`${etiqueta} mb-1`}>Eventos</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {Object.entries(EVENTOS).map(([k, t]) => (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="eventos" value={k} className="mt-1" defaultChecked={k.startsWith('orden.')} />
                <span>
                  <code className="text-xs">{k}</code>
                  <span className="block text-xs text-texto-3">{t}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            Agregar webhook
          </Boton>
        </div>
      </form>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.secreto && (
        <Secreto
          valor={estado.secreto}
          aviso="Secreto para verificar la firma de cada envío. Copialo ahora: no se vuelve a mostrar."
        />
      )}
    </div>
  )
}
