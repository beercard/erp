'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'

import { Antibots } from '@/components/Antibots'
import { Aviso, Boton, Campo, Selector } from '@/components/ui'
import { generarClave } from '@/lib/antibots'

import { DIAS_DE_PRUEBA } from '@/lib/planes'
import { RUBROS } from '@/lib/rubros'

import { crearOtraEmpresa, registrarse } from './acciones'

const CONDICIONES = [
  { valor: 1, texto: 'Responsable Inscripto' },
  { valor: 6, texto: 'Monotributo' },
  { valor: 4, texto: 'Exento' },
]

function DatosEmpresa({ valores }: { valores?: Record<string, string> }) {
  return (
    <>
      <Selector
        id="rubro"
        name="rubro"
        etiqueta="¿A qué se dedica la empresa?"
        opciones={RUBROS.map((r) => ({ valor: r.id, texto: r.nombre }))}
        defaultValue={valores?.rubro ?? ''}
        vacio="Elegí el rubro"
        required
      />
      <p className="-mt-2 text-xs text-texto-3">
        Lo dejamos preparado para tu rubro, y si usa servicio técnico, contratos o tienda online, la prueba lo incluye.
      </p>
      <Campo id="razonSocial" name="razonSocial" etiqueta="Razón social" defaultValue={valores?.razonSocial} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="cuit"
          name="cuit"
          etiqueta="CUIT"
          inputMode="numeric"
          placeholder="30-12345678-9"
          defaultValue={valores?.cuit}
          required
        />
        <Selector
          id="condicionIva"
          name="condicionIva"
          etiqueta="Condición frente al IVA"
          opciones={CONDICIONES}
          defaultValue={valores?.condicionIva ?? '1'}
        />
      </div>
    </>
  )
}

/**
 * Después de un error, React 19 reinicia el formulario a los valores de su
 * primer render (el rubro quedaba vacío y el navegador frenaba el reenvío sin
 * decir por qué). Con otra clave el formulario se arma de nuevo con lo ya
 * cargado, y el desafío antibots se renueva.
 */
const claveFormulario = (estado: { error?: string; valores?: Record<string, string> } | undefined) =>
  estado?.error ? `${estado.error}|${JSON.stringify(estado.valores ?? {})}` : 'inicial'

/** Cuenta nueva con su empresa. */
export function FormularioRegistro() {
  const [estado, accion, enviando] = useActionState(registrarse, undefined)
  useIrA(estado?.irA)
  const v = estado?.valores
  const [generada, setGenerada] = useState<string | null>(null)
  const [copiada, setCopiada] = useState(false)
  const clave = useRef<HTMLInputElement>(null)
  const repetir = useRef<HTMLInputElement>(null)
  function generar() {
    const nueva = generarClave()
    for (const r of [clave, repetir]) if (r.current) r.current.value = nueva
    setGenerada(nueva)
    setCopiada(false)
  }
  async function copiar() {
    if (!generada) return
    await navigator.clipboard?.writeText(generada).catch(() => undefined)
    setCopiada(true)
  }
  return (
    <form key={claveFormulario(estado)} action={accion} className="flex flex-col gap-4">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-texto-3 uppercase">Tus datos</legend>
        <Campo
          id="nombre"
          name="nombre"
          etiqueta="Nombre y apellido"
          autoComplete="name"
          defaultValue={v?.nombre}
          required
          autoFocus
        />
        <Campo id="email" name="email" type="email" etiqueta="Email" autoComplete="username" defaultValue={v?.email} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            ref={clave}
            id="clave"
            name="clave"
            type={generada ? 'text' : 'password'}
            etiqueta="Contraseña"
            autoComplete="new-password"
            ayuda="Al menos 10 caracteres."
            required
          />
          <Campo
            ref={repetir}
            id="repetir"
            name="repetir"
            type={generada ? 'text' : 'password'}
            etiqueta="Repetila"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="-mt-1 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={generar} className="text-acento hover:underline">
            Generar una contraseña segura
          </button>
          {generada && (
            <>
              <span className="text-texto-3">·</span>
              <button type="button" onClick={copiar} className="text-acento hover:underline">
                {copiada ? 'Copiada' : 'Copiarla'}
              </button>
              <span className="w-full text-xs text-texto-3">
                Guardala en tu gestor de contraseñas o anotala: no la vamos a volver a mostrar.
              </span>
            </>
          )}
        </div>
      </fieldset>
      <fieldset className="mt-2 flex flex-col gap-4">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-texto-3 uppercase">Tu empresa</legend>
        <DatosEmpresa valores={v} />
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-texto-2">
        <input type="checkbox" name="acepta" className="mt-0.5" defaultChecked={v?.acepta === 'on'} />
        <span>
          Acepto los{' '}
          <Link href="/legal/terminos" target="_blank" className="text-acento hover:underline">
            términos del servicio
          </Link>{' '}
          y la{' '}
          <Link href="/legal/privacidad" target="_blank" className="text-acento hover:underline">
            política de privacidad
          </Link>
          .
        </span>
      </label>
      <Antibots intento={estado} />
      <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 h-10">
        {enviando ? 'Creando la cuenta…' : 'Empezar la prueba gratis'}
      </Boton>
      <p className="text-center text-xs text-texto-3">{DIAS_DE_PRUEBA} días con el plan Inicial y lo de tu rubro. Sin tarjeta.</p>
    </form>
  )
}

/** Empresa adicional para una cuenta que ya existe. */
export function FormularioOtraEmpresa() {
  const [estado, accion, enviando] = useActionState(crearOtraEmpresa, undefined)
  useIrA(estado?.irA)
  return (
    <form key={claveFormulario(estado)} action={accion} className="flex flex-col gap-4">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <DatosEmpresa valores={estado?.valores} />
      <Boton type="submit" variante="primario" disabled={enviando}>
        {enviando ? 'Creando…' : `Crear la empresa con ${DIAS_DE_PRUEBA} días de prueba`}
      </Boton>
    </form>
  )
}

/** Con subdominios, la empresa nueva se abre en su dirección (otro origen: navegación común). */
function useIrA(url: string | undefined) {
  useEffect(() => {
    if (url) window.location.assign(url)
  }, [url])
}
