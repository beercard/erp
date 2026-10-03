'use client'

import Link from 'next/link'
import { useActionState, useEffect } from 'react'

import { Aviso, Boton, Campo, Selector } from '@/components/ui'

import { crearOtraEmpresa, registrarse } from './acciones'

const CONDICIONES = [
  { valor: 1, texto: 'Responsable Inscripto' },
  { valor: 6, texto: 'Monotributo' },
  { valor: 4, texto: 'Exento' },
]

function DatosEmpresa({ valores }: { valores?: Record<string, string> }) {
  return (
    <>
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

/** Cuenta nueva con su empresa. */
export function FormularioRegistro() {
  const [estado, accion, enviando] = useActionState(registrarse, undefined)
  useIrA(estado?.irA)
  const v = estado?.valores
  return (
    <form action={accion} className="flex flex-col gap-4">
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
            id="clave"
            name="clave"
            type="password"
            etiqueta="Contraseña"
            autoComplete="new-password"
            ayuda="Al menos 10 caracteres."
            required
          />
          <Campo id="repetir" name="repetir" type="password" etiqueta="Repetila" autoComplete="new-password" required />
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
          <Link href="/precios#terminos" className="text-acento hover:underline">
            términos del servicio
          </Link>
          .
        </span>
      </label>
      <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 h-10">
        {enviando ? 'Creando la cuenta…' : 'Empezar la prueba gratis'}
      </Boton>
      <p className="text-center text-xs text-texto-3">30 días con todo lo del plan Pyme. Sin tarjeta.</p>
    </form>
  )
}

/** Empresa adicional para una cuenta que ya existe. */
export function FormularioOtraEmpresa() {
  const [estado, accion, enviando] = useActionState(crearOtraEmpresa, undefined)
  useIrA(estado?.irA)
  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <DatosEmpresa valores={estado?.valores} />
      <Boton type="submit" variante="primario" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear la empresa con 30 días de prueba'}
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
