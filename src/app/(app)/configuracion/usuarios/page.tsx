import { ChevronLeft, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { miembros } from '@/modulos/empresa/usuarios'

import { cambiarAccesoAccion, cambiarRolAccion, cancelarInvitacionAccion } from './acciones'
import { FormularioInvitacion } from './FormularioInvitacion'

export const metadata: Metadata = { title: 'Usuarios y roles' }

export default async function Usuarios({ searchParams }: PageProps<'/configuracion/usuarios'>) {
  const sesion = await requerirEmpresa()
  const { error, guardado } = await searchParams
  if (!tienePermiso(sesion.permisos, 'empresa.usuarios')) {
    return <Aviso>No tenés permiso para administrar los usuarios de esta empresa.</Aviso>
  }
  const { lista, pendientes, roles } = await miembros(sesion.empresa.id)
  const opcionesRol = roles.map((r) => ({ valor: r.id, texto: r.nombre }))

  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina titulo="Usuarios y roles" bajada="Quién entra a esta empresa y qué puede hacer cada uno." />
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Rol grabado.</Aviso>
        </div>
      )}

      <Panel className="mb-6 p-4">
        <h2 className="mb-3 text-sm font-semibold">Invitar a alguien</h2>
        <FormularioInvitacion roles={opcionesRol} />
      </Panel>

      <Panel className="mb-6 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Usuario</th>
              <th className="px-4 py-2.5 font-medium">Rol</th>
              <th className="px-4 py-2.5 font-medium">Último ingreso</th>
              <th className="px-4 py-2.5 font-medium">Acceso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {lista.map((m) => (
              <tr key={m.membresiaId}>
                <td className="px-4 py-2.5">
                  <span className="block font-medium">
                    {m.nombre}{' '}
                    {m.usuarioId === sesion.usuario.id && <span className="text-xs font-normal text-texto-3">(vos)</span>}
                  </span>
                  <span className="block text-xs text-texto-3">{m.email}</span>
                </td>
                <td className="px-4 py-2.5">
                  <form action={cambiarRolAccion.bind(null, m.membresiaId)} className="flex items-center gap-2">
                    <label htmlFor={`rol-${m.membresiaId}`} className="sr-only">
                      Rol de {m.nombre}
                    </label>
                    <select
                      id={`rol-${m.membresiaId}`}
                      name="rolId"
                      defaultValue={m.rolId}
                      className="h-8 rounded-md border border-borde bg-superficie px-2 text-sm"
                    >
                      {opcionesRol.map((r) => (
                        <option key={r.valor} value={r.valor}>
                          {r.texto}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-acento hover:underline">
                      Cambiar
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2.5 text-texto-2">
                  {m.ultimoIngreso
                    ? m.ultimoIngreso.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                    : 'Nunca'}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-3">
                    {m.activa ? <Chip tono="ok">Activo</Chip> : <Chip>Sin acceso</Chip>}
                    {m.usuarioId !== sesion.usuario.id && (
                      <form action={cambiarAccesoAccion.bind(null, m.membresiaId, !m.activa)}>
                        <button type="submit" className="text-xs font-medium text-texto-2 hover:text-texto">
                          {m.activa ? 'Quitar acceso' : 'Devolver acceso'}
                        </button>
                      </form>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {pendientes.map((p) => (
              <tr key={p.id} className="bg-superficie-2/50">
                <td className="px-4 py-2.5">
                  <span className="block text-texto-2">{p.email}</span>
                  <span className="block text-xs text-texto-3">Vence el {p.vence.toLocaleDateString('es-AR')}</span>
                </td>
                <td className="px-4 py-2.5 text-texto-2">{p.rol}</td>
                <td className="px-4 py-2.5">
                  <Chip tono="aviso">Invitación pendiente</Chip>
                </td>
                <td className="px-4 py-2.5">
                  <form action={cancelarInvitacionAccion.bind(null, p.id)}>
                    <button type="submit" className="text-xs font-medium text-texto-2 hover:text-texto">
                      Cancelar invitación
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between border-b border-borde px-4 py-3">
          <h2 className="text-sm font-semibold">Roles</h2>
          <BotonEnlace href="/configuracion/usuarios/roles/nuevo" className="h-8">
            <Plus aria-hidden className="size-4" /> Nuevo rol
          </BotonEnlace>
        </div>
        <ul className="divide-y divide-borde">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.nombre}</span>
                <span className="block text-xs text-texto-2">{r.descripcion}</span>
              </span>
              {r.empresaId ? (
                <Link href={`/configuracion/usuarios/roles/${r.id}`} className="text-xs font-medium text-acento hover:underline">
                  Modificar
                </Link>
              ) : (
                <Chip>De sistema</Chip>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
