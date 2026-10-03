'use client'

import { useActionState, useState } from 'react'

import { FormularioDinamico } from '@/components/servicio/FormularioDinamico'
import { Aviso, Boton } from '@/components/ui'
import type { Campo } from '@/modulos/servicio/formularios'

import { aceptarAccion, contadoresAccion, ingresarAccion, pedirAccion } from './acciones'

const control = 'h-10 rounded-md border border-borde bg-superficie px-3 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

export function FormularioIngreso({ empresa }: { empresa: string }) {
  const [estado, accion, enviando] = useActionState(ingresarAccion, undefined)
  const [olvide, setOlvide] = useState(false)
  return (
    <form action={accion} className="flex flex-col gap-3">
      {empresa ? (
        <input type="hidden" name="empresa" value={empresa} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>CUIT de la empresa que te atiende</span>
          <input name="empresa" required inputMode="numeric" className={`${control} cifras`} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Email</span>
        <input name="email" type="email" required autoComplete="username" className={control} />
      </label>
      {!olvide && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Contraseña</span>
          <input name="clave" type="password" required autoComplete="current-password" className={control} />
        </label>
      )}
      {olvide && <input type="hidden" name="olvide" value="1" />}
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
        {olvide ? 'Mandarme el enlace' : 'Ingresar'}
      </Boton>
      <button type="button" onClick={() => setOlvide(!olvide)} className="text-left text-xs text-acento hover:underline">
        {olvide ? 'Volver a ingresar con mi contraseña' : 'Olvidé mi contraseña'}
      </button>
    </form>
  )
}

export function FormularioClave({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(aceptarAccion.bind(null, token), undefined)
  return (
    <form action={accion} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Contraseña (10 caracteres o más, con letras y números)</span>
        <input name="clave" type="password" required minLength={10} autoComplete="new-password" className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Repetila</span>
        <input name="repetir" type="password" required autoComplete="new-password" className={control} />
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
        Guardar y entrar
      </Boton>
    </form>
  )
}

type Tipo = { id: string; nombre: string; instrucciones: Campo[] }

export function FormularioPedido({
  equipos,
  tipos,
  equipo,
  contacto,
}: {
  equipos: { id: string; texto: string }[]
  tipos: Tipo[]
  equipo?: string
  contacto: string
}) {
  const [estado, accion, enviando] = useActionState(pedirAccion, undefined)
  const [tipoId, setTipoId] = useState(tipos.length === 1 ? tipos[0].id : '')
  const tipo = tipos.find((t) => t.id === tipoId)
  return (
    <form action={accion} className="flex flex-col gap-4">
      {tipos.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>¿Qué necesitás?</span>
          <select name="tipoOrdenId" required value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={control}>
            <option value="">Elegí…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Equipo</span>
        <select name="equipoId" defaultValue={equipo ?? (equipos.length === 1 ? equipos[0].id : '')} className={control}>
          <option value="">{equipos.length ? 'Ninguno en particular' : 'No tenés equipos cargados'}</option>
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.texto}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Contanos qué pasa</span>
        <textarea
          name="falla"
          required
          minLength={3}
          rows={4}
          className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm focus:border-acento"
        />
      </label>
      {tipo && tipo.instrucciones.some((c) => c.tipo !== 'equipo') && (
        <FormularioDinamico
          key={tipo.id}
          campos={tipo.instrucciones}
          nombre="instrucciones"
          contexto={{ omitir: ['equipo', 'fotos', 'firma', 'materiales'] }}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Quién recibe al técnico</span>
          <input name="contacto" defaultValue={contacto} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Teléfono</span>
          <input name="telefono" type="tel" className={control} />
        </label>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
          Pedir el servicio
        </Boton>
      </div>
    </form>
  )
}

export function FormularioContadores({
  equipos,
}: {
  equipos: { id: string; texto: string; ultimo: number | null; fecha: string | null }[]
}) {
  const [estado, accion, enviando] = useActionState(contadoresAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3">
      <ul className="divide-y divide-borde">
        {equipos.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{e.texto}</span>
              <span className="text-xs text-texto-2">
                {e.ultimo !== null
                  ? `Último: ${e.ultimo.toLocaleString('es-AR')}${e.fecha ? ` (${e.fecha.split('-').reverse().join('/')})` : ''}`
                  : 'Sin lecturas'}
              </span>
            </span>
            <input
              name={`contador:${e.id}`}
              inputMode="numeric"
              placeholder="Contador actual"
              aria-label={`Contador de ${e.texto}`}
              className={`${control} cifras w-40`}
            />
          </li>
        ))}
      </ul>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
          Guardar contadores
        </Boton>
      </div>
    </form>
  )
}
