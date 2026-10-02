import { CheckCircle2, ChevronRight, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Sincronizador } from '@/components/servicio/Sincronizador'
import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { agendaDelTecnico, listarTecnicos, marcarVencidas, tecnicoDeUsuario } from '@/modulos/servicio/servicio'

import { paginaContratos } from '../contratos/modulo'
import { ChipEstado } from '../servicio/ChipEstado'

export const metadata: Metadata = { title: 'Mi agenda' }

/**
 * Agenda del técnico, pensada para el celular: lo atrasado, lo de hoy y lo
 * que viene. Quien coordina puede ver la de cualquier técnico.
 */
export default async function MiAgenda({ searchParams }: PageProps<'/tecnico'>) {
  const sesion = await paginaContratos('servicio.trabajar')
  const { tecnico: elegido, enviada } = (await searchParams) as { tecnico?: string; enviada?: string }
  const coordina = tienePermiso(sesion.permisos, 'servicio.cargar')
  const hoy = hoyArgentina()
  const datos = await conEmpresa(sesion.empresa.id, async (tx) => {
    await marcarVencidas(tx)
    const propio = await tecnicoDeUsuario(tx, sesion.usuario)
    const tecnicos = coordina ? await listarTecnicos(tx) : []
    const id = (coordina && elegido) || propio?.id || null
    const nombre = tecnicos.find((t) => t.id === id)?.nombre ?? propio?.nombre ?? null
    return { id, nombre, tecnicos, ordenes: id ? await agendaDelTecnico(tx, id) : [] }
  })
  const grupos = [
    {
      titulo: 'Atrasadas',
      filas: datos.ordenes.filter(
        (o) => o.estado === 'vencida' || (o.programada && o.programada < hoy && o.estado !== 'informe'),
      ),
    },
    {
      titulo: 'Hoy',
      filas: datos.ordenes.filter((o) => o.programada === hoy && o.estado !== 'vencida' && o.estado !== 'informe'),
    },
    {
      titulo: 'Próximas',
      filas: datos.ordenes.filter(
        (o) => (!o.programada || o.programada > hoy) && o.estado !== 'vencida' && o.estado !== 'informe',
      ),
    },
    { titulo: 'Enviadas, esperando revisión', filas: datos.ordenes.filter((o) => o.estado === 'informe') },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        titulo="Mi agenda"
        bajada={datos.nombre ? `${datos.nombre} · ${hoy.split('-').reverse().join('/')}` : undefined}
      />
      <Sincronizador
        precargar={datos.ordenes.filter((o) => o.estado !== 'informe').map((o) => `/tecnico/${o.id}`)}
        enviada={enviada}
      />
      {enviada && (
        <div className="mb-4">
          <Aviso tono="ok">
            <span className="flex items-center gap-2">
              <CheckCircle2 aria-hidden className="size-4" /> Informe enviado. La oficina lo revisa y cierra la orden.
            </span>
          </Aviso>
        </div>
      )}
      {coordina && datos.tecnicos.length > 0 && (
        <form className="mb-4 flex gap-2">
          <select
            name="tecnico"
            defaultValue={datos.id ?? ''}
            className="h-10 flex-1 rounded-md border border-borde bg-superficie px-2 text-sm"
          >
            {!datos.id && <option value="">Elegí un técnico…</option>}
            {datos.tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <button className="h-10 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Ver</button>
        </form>
      )}
      {!datos.id ? (
        <Panel className="p-5 text-sm text-texto-2">
          Tu usuario no está vinculado a un técnico. En Configuración › Técnicos, cargá tu email ({sesion.usuario.email}) en tu
          ficha de técnico.
        </Panel>
      ) : datos.ordenes.length === 0 ? (
        <Panel className="p-5 text-sm text-texto-2">No tenés órdenes asignadas.</Panel>
      ) : (
        grupos
          .filter((g) => g.filas.length)
          .map((g) => (
            <section key={g.titulo} className="mb-5">
              <h2
                className={`mb-2 text-xs font-semibold tracking-wide uppercase ${g.titulo === 'Atrasadas' ? 'text-error' : 'text-texto-2'}`}
              >
                {g.titulo} <span className="font-normal">({g.filas.length})</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {g.filas.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/tecnico/${o.id}`}
                      className="flex items-center gap-3 rounded-lg border border-borde bg-superficie p-3 hover:border-acento"
                      style={{ borderLeftWidth: 4, borderLeftColor: o.color ?? undefined }}
                    >
                      <span className="cifras w-12 shrink-0 text-center text-sm font-semibold">
                        {o.hora ?? '—'}
                        {o.programada && o.programada !== hoy && (
                          <span className="block text-[11px] font-normal text-texto-3">
                            {o.programada.slice(8)}/{o.programada.slice(5, 7)}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.cliente}</span>
                        <span className="block truncate text-sm text-texto-2">
                          {o.prioridad === 'urgente' && <span className="font-semibold text-error">Urgente · </span>}
                          {o.tipoOrden ?? o.falla}
                        </span>
                        {o.serie && (
                          <span className="flex items-center gap-1 text-xs text-texto-3">
                            <MapPin aria-hidden className="size-3" />
                            <span className="cifras">{o.serie}</span> {o.modelo}
                          </span>
                        )}
                        <span className="mt-1 block">
                          <ChipEstado estado={o.estado} cobertura={o.cobertura} facturada={false} />
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-texto-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  )
}
