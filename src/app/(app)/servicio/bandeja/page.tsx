import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { bandeja, listarFormularios } from '@/modulos/servicio/sueltos'

import { paginaContratos } from '../../contratos/modulo'

export const metadata: Metadata = { title: 'Bandeja de entrada' }

const hora = (d: Date | null) =>
  d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—'

const ORIGEN: Record<string, string> = { oficina: 'Oficina', tecnico: 'Técnico', portal: 'Portal' }

/** Bandeja de entrada de los formularios sueltos, con los estados de color de la empresa. */
export default async function Bandeja({ searchParams }: PageProps<'/servicio/bandeja'>) {
  const sesion = await paginaContratos('servicio.cargar')
  const { estado = 'pendientes', formulario, q } = (await searchParams) as { estado?: string; formulario?: string; q?: string }
  const valido = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
  const { datos, formularios } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    datos: await bandeja(tx, {
      estado: estado === 'todos' || estado === 'pendientes' ? estado : valido(estado),
      formulario: valido(formulario),
      q,
    }),
    formularios: await listarFormularios(tx),
  }))
  const enlace = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const todo = { estado, formulario, q, ...cambios }
    for (const [k, v] of Object.entries(todo)) if (v) p.set(k, v)
    return `/servicio/bandeja?${p}`
  }
  const pestana = (activo: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${activo ? 'border-acento bg-acento-suave font-medium' : 'border-borde hover:bg-superficie-2'}`
  return (
    <>
      <EncabezadoPagina
        titulo="Bandeja de entrada"
        bajada="Los formularios que mandaron la oficina, los técnicos y los clientes desde el portal."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={enlace({ estado: 'pendientes' })} className={pestana(estado === 'pendientes')}>
          Pendientes
        </Link>
        {datos.estados.map((e) => (
          <Link key={e.id} href={enlace({ estado: e.id })} className={pestana(estado === e.id)}>
            <span aria-hidden className="size-2 rounded-full" style={{ background: e.color }} />
            {e.nombre}
          </Link>
        ))}
        <Link href={enlace({ estado: 'todos' })} className={pestana(estado === 'todos')}>
          Todos
        </Link>
      </div>
      <form className="mb-3 flex flex-wrap gap-2">
        <input type="hidden" name="estado" value={estado} />
        <select
          name="formulario"
          defaultValue={formulario ?? ''}
          className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
        >
          <option value="">Todos los formularios</option>
          {formularios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Cliente, serie o número"
          className="h-9 min-w-48 flex-1 rounded-md border border-borde bg-superficie px-2 text-sm"
        />
        <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Buscar</button>
      </form>
      <Panel className="overflow-x-auto">
        {datos.envios.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">No hay envíos.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">N°</th>
                <th className="px-4 py-2 font-medium">Formulario</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">De</th>
                <th className="px-4 py-2 font-medium">Recibido</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {datos.envios.map((e) => (
                <tr key={e.id} className="hover:bg-superficie-2">
                  <td className="cifras px-4 py-2">
                    <Link href={`/servicio/bandeja/${e.id}`} className="font-medium text-acento hover:underline">
                      {e.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="size-2 rounded-full" style={{ background: e.color }} />
                      {e.formulario}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {e.cliente ?? '—'}
                    {e.serie && <span className="cifras block text-xs text-texto-3">{e.serie}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-texto-2">
                    {ORIGEN[e.origen]}
                    {e.tecnico ? ` · ${e.tecnico}` : e.portal ? ` · ${e.portal}` : ''}
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap text-texto-2">{hora(e.enviado)}</td>
                  <td className="px-4 py-2">
                    {e.estado && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: `color-mix(in srgb, ${e.estado.color} 15%, transparent)`, color: e.estado.color }}
                      >
                        <span aria-hidden className="size-2 rounded-full" style={{ background: e.estado.color }} />
                        {e.estado.nombre}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
