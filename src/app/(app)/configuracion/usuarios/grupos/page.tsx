import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { miembros } from '@/modulos/empresa/usuarios'
import { listarGrupos } from '@/modulos/maestros/grupos'

import { BorrarGrupo, GruposDelUsuario, NuevoGrupo } from './Formularios'

export const metadata: Metadata = { title: 'Grupos de clientes' }

export default async function Grupos() {
  const sesion = await exigirPermiso('empresa.usuarios')
  const grupos = await conEmpresa(sesion, (tx) => listarGrupos(tx))
  const { lista } = await miembros(sesion.empresa.id)
  const activos = lista.filter((m) => m.activa)
  return (
    <>
      <Link href="/configuracion/usuarios" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Usuarios y roles
      </Link>
      <EncabezadoPagina
        titulo="Grupos de clientes"
        bajada="Un usuario con grupos asignados solo ve los clientes de esos grupos, con sus órdenes, contratos, equipos y formularios. Sin grupos ve todos. Los proveedores se ven siempre. El grupo de cada cliente se elige en su ficha."
      />
      <Panel className="mb-4 p-4">
        <NuevoGrupo />
      </Panel>
      {grupos.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Grupos</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-borde">
                {grupos.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-2 font-medium">{g.nombre}</td>
                    <td className="cifras px-4 py-2 text-right text-texto-2">
                      {g.clientes} cliente{g.clientes === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-2 text-xs text-texto-2">
                      {g.usuarios.length} usuario{g.usuarios.length === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <BorrarGrupo id={g.id} nombre={g.nombre} clientes={g.clientes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Qué ve cada usuario</h2>
            <ul className="divide-y divide-borde">
              {activos.map((m) => {
                const elegidos = grupos.filter((g) => g.usuarios.includes(m.usuarioId)).map((g) => g.id)
                return (
                  <li key={m.usuarioId} className="px-4 py-2">
                    <span className="mb-1 flex items-center gap-2 text-sm font-medium">
                      {m.nombre}
                      {elegidos.length === 0 ? <Chip>Todos los clientes</Chip> : <Chip tono="aviso">Solo sus grupos</Chip>}
                    </span>
                    <GruposDelUsuario
                      usuarioId={m.usuarioId}
                      grupos={grupos.map((g) => ({ id: g.id, nombre: g.nombre }))}
                      elegidos={elegidos}
                    />
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      )}
    </>
  )
}
