import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Aviso, Boton } from '@/components/ui'
import { MarcoAcceso } from '@/components/MarcoAcceso'
import { codigoDelPedido, empresaDelPedido, sesionActual } from '@/lib/auth/servidor'
import { dominioEmpresas } from '@/lib/subdominio'

import { FormularioIngreso } from './FormularioIngreso'
import { LimpiarCache } from './LimpiarCache'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function PaginaIngreso({ searchParams }: PageProps<'/ingresar'>) {
  if (await sesionActual()) redirect('/')
  const { volver, clave, bienvenida, email, plataforma, codigo: codigoEscrito, error } = await searchParams
  const dominio = dominioEmpresas()
  const codigo = await codigoDelPedido()
  const empresa = codigo ? await empresaDelPedido() : null

  // Subdominio que no es de ninguna empresa.
  if (codigo && !empresa) {
    return (
      <MarcoAcceso>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Esta dirección no existe</h1>
        <p className="mt-2 text-sm text-texto-2">
          No hay ninguna empresa con el código <b>{codigo}</b>. Revisá la dirección o pedísela a quien administra tu empresa.
        </p>
      </MarcoAcceso>
    )
  }

  // Dominio base con subdominios: primero el código de la empresa (salvo quien administra la plataforma).
  if (dominio && !codigo && plataforma !== '1') {
    return (
      <MarcoAcceso>
        <LimpiarCache />
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Ingresá a tu empresa</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">
          Cada empresa tiene su dirección. Escribí el código que te pasaron (o la primera parte de la dirección).
        </p>
        <form action="/ingresar/empresa" method="get" className="flex flex-col gap-4">
          {error && (
            <Aviso>
              {error === 'intentos'
                ? 'Demasiados intentos. Esperá 15 minutos.'
                : 'No hay ninguna empresa con ese código. Revisalo o pedíselo a quien administra tu empresa.'}
            </Aviso>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="codigo" className="text-sm font-medium">
              Código de tu empresa
            </label>
            <div className="flex items-center overflow-hidden rounded-md border border-borde bg-superficie focus-within:border-acento">
              <input
                id="codigo"
                name="codigo"
                defaultValue={typeof codigoEscrito === 'string' ? codigoEscrito.slice(0, 60) : ''}
                required
                autoFocus
                autoCapitalize="none"
                autoComplete="organization"
                spellCheck={false}
                placeholder="miempresa"
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
              />
              <span className="shrink-0 pr-3 text-sm text-texto-3">.{dominio}</span>
            </div>
          </div>
          <Boton type="submit" variante="primario" className="mt-1 h-10">
            Continuar
          </Boton>
        </form>
        <p className="mt-6 text-center text-sm text-texto-2">
          ¿Todavía no lo usás?{' '}
          <Link href="/registro" className="text-acento hover:underline">
            Probalo gratis 30 días
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-texto-3">
          <Link href="/ingresar?plataforma=1" className="hover:underline">
            Administración de la plataforma y empresas de un mismo usuario
          </Link>
        </p>
      </MarcoAcceso>
    )
  }

  return (
    <MarcoAcceso>
      <LimpiarCache />
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
        {empresa ? `Ingresá a ${empresa.nombre}` : 'Ingresá a tu empresa'}
      </h1>
      <p className="mt-1 mb-6 text-sm text-texto-2">
        {empresa
          ? 'Con tu email y tu contraseña de usuario de la empresa.'
          : 'Facturación, stock, cuentas corrientes y tesorería en un solo lugar.'}
      </p>
      {bienvenida && (
        <div className="mb-4">
          <Aviso tono="ok">Tu empresa ya está lista. Guardá esta dirección: es por donde van a entrar vos y tu equipo.</Aviso>
        </div>
      )}
      {clave && (
        <div className="mb-4">
          <Aviso tono="ok">Listo: tu contraseña nueva ya funciona. Ingresá con ella.</Aviso>
        </div>
      )}
      <FormularioIngreso
        volver={typeof volver === 'string' ? volver : undefined}
        email={typeof email === 'string' ? email.slice(0, 200) : undefined}
      />
      <p className="mt-3 text-right text-sm">
        <Link href="/ingresar/recuperar" className="text-acento hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
      {!empresa && (
        <p className="mt-6 text-center text-sm text-texto-2">
          ¿Todavía no lo usás?{' '}
          <Link href="/registro" className="text-acento hover:underline">
            Probalo gratis 30 días
          </Link>{' '}
          ·{' '}
          <Link href="/precios" className="text-acento hover:underline">
            Planes
          </Link>
        </p>
      )}
    </MarcoAcceso>
  )
}
