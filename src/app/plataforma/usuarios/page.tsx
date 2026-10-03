import { Search, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Boton, Chip, EncabezadoPagina, Panel, Vacio } from '@/components/ui'
import { listarUsuarios } from '@/modulos/plataforma/consola'

import { activarUsuarioAccion, cerrarSesionesAccion } from '../acciones'
import { exigirAdmin } from '../admin'
import { fechaHora, hace, Pestanas } from '../componentes'
import { BotonAccion } from '../Formularios'

export const metadata: Metadata = { title: 'Usuarios · Plataforma' }

const TIPOS = [
  { valor: '', texto: 'Todos' },
  { valor: 'admin', texto: 'Administran la plataforma' },
  { valor: 'inactivo', texto: 'Desactivados' },
  { valor: 'sin_empresa', texto: 'Sin empresa' },
  { valor: 'nunca', texto: 'Nunca entraron' },
]

export default async function Usuarios({ searchParams }: PageProps<'/plataforma/usuarios'>) {
  const sesion = await exigirAdmin()
  const p = (await searchParams) as { q?: string; tipo?: string }
  const filtro = { q: p.q ?? '', tipo: p.tipo ?? '' }
  const { total, filas: lista } = await listarUsuarios(filtro)
  const enlace = (tipo: string) => {
    const q = new URLSearchParams(Object.entries({ ...filtro, tipo }).filter(([, v]) => v) as [string, string][])
    return `/plataforma/usuarios${q.size ? `?${q}` : ''}`
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        bajada={`${total} ${total === 1 ? 'persona tiene' : 'personas tienen'} cuenta. Quién entra, a qué empresas, y su acceso.`}
      />

      <div className="flex flex-col gap-4">
        <form className="flex flex-wrap items-end gap-2" role="search">
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Buscar</span>
            <input
              name="q"
              defaultValue={filtro.q}
              placeholder="Nombre o email"
              className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm focus:border-acento"
            />
          </label>
          {filtro.tipo && <input type="hidden" name="tipo" value={filtro.tipo} />}
          <Boton type="submit">
            <Search aria-hidden /> Buscar
          </Boton>
        </form>

        <Pestanas opciones={TIPOS.map((t) => ({ href: enlace(t.valor), texto: t.texto, activa: filtro.tipo === t.valor }))} />

        <Panel className="overflow-x-auto">
          {lista.length === 0 ? (
            <Vacio titulo="No hay usuarios con esos filtros" />
          ) : (
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-borde text-left text-xs text-texto-2">
                <tr>
                  <th className="px-4 py-2 font-medium">Persona</th>
                  <th className="px-4 py-2 font-medium">Empresas</th>
                  <th className="px-4 py-2 font-medium">Último ingreso</th>
                  <th className="px-4 py-2 text-right font-medium">Sesiones</th>
                  <th className="px-4 py-2 text-right font-medium">Acceso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {lista.map((u) => (
                  <tr key={u.id} className={`align-top ${u.activo ? '' : 'text-texto-3'}`}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 font-medium">
                        {u.nombre}
                        {u.adminPlataforma && (
                          <span title="Administra la plataforma" className="text-acento">
                            <ShieldCheck aria-hidden className="size-4" />
                            <span className="sr-only">Administra la plataforma</span>
                          </span>
                        )}
                        {u.id === sesion.usuario.id && <Chip tono="acento">Vos</Chip>}
                      </span>
                      <a href={`mailto:${u.email}`} className="block text-xs text-texto-2 hover:text-acento">
                        {u.email}
                      </a>
                      <span className="text-xs text-texto-3">cuenta desde {fechaHora(u.creado).split(',')[0]}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.empresas.length === 0 ? (
                        <span className="text-xs text-texto-3">Ninguna</span>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {u.empresas.slice(0, 4).map((e) => (
                            <li key={e.id}>
                              <Link href={`/plataforma/empresas/${e.id}`} className="hover:text-acento">
                                {e.razonSocial}
                              </Link>
                              <span className="text-xs text-texto-3"> · {e.rol}</span>
                            </li>
                          ))}
                          {u.empresas.length > 4 && <li className="text-xs text-texto-3">y {u.empresas.length - 4} más</li>}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs" title={fechaHora(u.ultimoIngreso)}>
                      {hace(u.ultimoIngreso)}
                    </td>
                    <td className="cifras px-4 py-2.5 text-right">{u.sesiones}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col items-end gap-1.5">
                        {!u.activo && <Chip tono="error">Desactivado</Chip>}
                        {u.id !== sesion.usuario.id && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {u.activo && u.sesiones > 0 && (
                              <BotonAccion
                                accion={cerrarSesionesAccion.bind(null, u.id)}
                                texto="Cerrar sesiones"
                                variante="fantasma"
                                pregunta={`¿Cerrar las ${u.sesiones} sesiones abiertas de ${u.email}? Va a tener que volver a ingresar.`}
                              />
                            )}
                            {u.activo ? (
                              <BotonAccion
                                accion={activarUsuarioAccion.bind(null, u.id, false)}
                                texto="Desactivar"
                                variante="peligro"
                                pregunta={`¿Desactivar a ${u.email}? No va a poder entrar a ninguna empresa.`}
                              />
                            ) : (
                              <BotonAccion accion={activarUsuarioAccion.bind(null, u.id, true)} texto="Activar" />
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel className="p-4 text-sm">
          <h2 className="mb-1 flex items-center gap-1.5 font-semibold">
            <ShieldCheck aria-hidden className="size-4 text-acento" /> Quién administra la plataforma
          </h2>
          <p className="text-texto-2">
            Por seguridad, la aplicación no puede dar ni quitar este permiso: lo hace quien administra el servidor, por SSH. La
            persona tiene que tener cuenta (registrarse en /registro) antes.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-superficie-2 px-3 py-2 font-mono text-xs">
            {`cd ~/erp/deploy && docker compose exec app node scripts/admin-plataforma.mjs persona@correo.com
# para quitarlo:
cd ~/erp/deploy && docker compose exec app node scripts/admin-plataforma.mjs persona@correo.com --quitar`}
          </pre>
        </Panel>
      </div>
    </>
  )
}
