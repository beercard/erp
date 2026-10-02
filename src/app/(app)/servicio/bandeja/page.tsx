import type { Metadata } from 'next'
import Link from 'next/link'

import { DescargarExcel } from '@/components/servicio/DescargarExcel'
import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { bandeja, listarFormularios } from '@/modulos/servicio/sueltos'

import { paginaContratos } from '../../contratos/modulo'
import { TablaBandeja } from './TablaBandeja'

export const metadata: Metadata = { title: 'Bandeja de entrada' }

/** Bandeja de entrada de los formularios sueltos, con los estados de color de la empresa. */
export default async function Bandeja({ searchParams }: PageProps<'/servicio/bandeja'>) {
  const sesion = await paginaContratos('servicio.cargar')
  const { estado = 'pendientes', formulario, q } = (await searchParams) as { estado?: string; formulario?: string; q?: string }
  const valido = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
  const { datos, formularios } = await conEmpresa(sesion, async (tx) => ({
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
      {formulario && valido(formulario) && (
        <div className="mb-3">
          <DescargarExcel ruta={`/servicio/reportes/formulario/${formulario}`} texto="Este formulario en Excel" />
        </div>
      )}
      {datos.envios.length === 0 ? (
        <Panel className="p-4 text-sm text-texto-2">No hay envíos.</Panel>
      ) : (
        <TablaBandeja
          envios={datos.envios.map((e) => ({
            id: e.id,
            numero: e.numero,
            formulario: e.formulario,
            color: e.color,
            cliente: e.cliente,
            serie: e.serie,
            origen: e.origen,
            tecnico: e.tecnico,
            portal: e.portal,
            enviado: e.enviado,
            estado: e.estado ? { id: e.estado.id, nombre: e.estado.nombre, color: e.estado.color } : null,
          }))}
          estados={datos.estados.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color }))}
        />
      )}
    </>
  )
}
