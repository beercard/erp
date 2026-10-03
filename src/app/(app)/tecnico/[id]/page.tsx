import { desc, eq } from 'drizzle-orm'
import { ArrowLeft, Navigation, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Sincronizador } from '@/components/servicio/Sincronizador'
import { VistaRespuestas } from '@/components/servicio/VistaRespuestas'
import { Aviso, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { lecturas } from '@/db/schema'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { equiposDelCliente, marcarVencidas, obtenerOrden, ordenesDelEquipo, tecnicoDeUsuario } from '@/modulos/servicio/servicio'
import { estaAbierta } from '@/modulos/servicio/tipos'

import { paginaContratos } from '../../contratos/modulo'
import { ChipEstado } from '../../servicio/ChipEstado'
import { InformeTecnico, Llegue } from './Componentes'

export const metadata: Metadata = { title: 'Orden de servicio' }

const horaDe = (d: Date) => d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', timeStyle: 'short' })

/** La orden en el celular del técnico: dónde ir, qué hacer, y la devolución. */
export default async function OrdenTecnico({ params }: PageProps<'/tecnico/[id]'>) {
  const sesion = await paginaContratos('servicio.trabajar')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const datos = await conEmpresa(sesion, async (tx) => {
    await marcarVencidas(tx)
    const o = await obtenerOrden(tx, id)
    if (!o) return null
    // El técnico ve solo las suyas (y las que acompaña, sin cargar el informe); quien coordina, todas.
    let acompana = false
    if (!tienePermiso(sesion.permisos, 'servicio.cargar')) {
      const t = await tecnicoDeUsuario(tx, sesion.usuario)
      if (!t) return null
      acompana = t.id !== o.tecnicoId && o.acompanantes.some((a) => a.id === t.id)
      if (t.id !== o.tecnicoId && !acompana) return null
    }
    const [equipos, historial, [ultima]] = await Promise.all([
      equiposDelCliente(tx, o.terceroId),
      o.equipoId ? ordenesDelEquipo(tx, o.equipoId) : Promise.resolve([]),
      o.equipoId
        ? tx
            .select({ contador: lecturas.contador, fecha: lecturas.fecha })
            .from(lecturas)
            .where(eq(lecturas.equipoId, o.equipoId))
            .orderBy(desc(lecturas.fecha))
            .limit(1)
        : Promise.resolve([]),
    ])
    return { o, acompana, equipos, historial: historial.filter((h) => h.id !== o.id && h.fechaResolucion).slice(0, 5), ultima }
  })
  if (!datos) notFound()
  const { o, acompana, equipos, historial, ultima } = datos
  const hoy = hoyArgentina()
  const abierta = estaAbierta(o.estado)
  const nombres = Object.fromEntries(equipos.map((e) => [e.id, `${e.serie}${e.modelo ? ` · ${e.modelo}` : ''}`]))
  const telefono = o.telefono ?? o.cliente.telefono

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/tecnico" className="flex items-center gap-1 text-sm text-texto-2 hover:text-texto">
        <ArrowLeft aria-hidden className="size-4" /> Mi agenda
      </Link>
      <Sincronizador />
      <header>
        <p className="text-xs text-texto-3">
          Orden {o.numero} · {o.tipoOrden?.nombre ?? o.tipo}
          {o.programada && ` · ${o.programada.split('-').reverse().join('/')}${o.hora ? ` ${o.hora}` : ''}`}
        </p>
        <h1 className="text-xl font-semibold">{o.cliente.razonSocial}</h1>
        <div className="mt-1 flex flex-wrap gap-1">
          {o.prioridad === 'urgente' && abierta && (
            <span className="rounded-full bg-error-suave px-2 py-0.5 text-xs font-medium text-error">Urgente</span>
          )}
          <ChipEstado estado={o.estado} cobertura={o.cobertura} facturada={false} />
        </div>
      </header>

      <Panel className="flex flex-col gap-3 p-4">
        {o.domicilio && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.domicilio)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 text-sm"
          >
            <Navigation aria-hidden className="size-5 shrink-0 text-acento" />
            <span>
              {o.domicilio}
              {o.equipo?.sector && <span className="block text-xs text-texto-3">{o.equipo.sector}</span>}
              <span className="block text-xs text-acento">Cómo llegar</span>
            </span>
          </a>
        )}
        {telefono && (
          <a href={`tel:${telefono.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 text-sm">
            <Phone aria-hidden className="size-5 shrink-0 text-acento" />
            <span>
              {o.contacto ? `${o.contacto} · ` : ''}
              {telefono}
            </span>
          </a>
        )}
        {o.equipo && (
          <p className="border-t border-borde pt-3 text-sm">
            <span className="cifras font-medium">{o.equipo.serie}</span> {o.equipo.modelo}
            {ultima && (
              <span className="block text-xs text-texto-3">
                Último contador: <span className="cifras">{ultima.contador.toLocaleString('es-AR')}</span> el{' '}
                {ultima.fecha.split('-').reverse().join('/')}
              </span>
            )}
          </p>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Qué hay que hacer</h2>
        <p className="text-sm whitespace-pre-line">{o.falla}</p>
        {o.plantilla && o.plantilla.instrucciones.some((c) => c.tipo !== 'equipo') && (
          <div className="mt-3 border-t border-borde pt-3">
            <VistaRespuestas
              campos={o.plantilla.instrucciones.filter((c) => c.tipo !== 'equipo')}
              valores={o.instrucciones}
              vacio=""
            />
          </div>
        )}
        {o.observaciones && <p className="mt-3 text-sm text-texto-2">{o.observaciones}</p>}
      </Panel>

      {historial.length > 0 && (
        <details className="tarjeta p-4">
          <summary className="cursor-pointer text-sm font-semibold">Historial del equipo ({historial.length})</summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {historial.map((h) => (
              <li key={h.id} className="border-t border-borde pt-2">
                <span className="text-xs text-texto-3">
                  {h.fechaResolucion?.split('-').reverse().join('/')} · {h.tipoOrden ?? h.tipo} · {h.tecnico ?? ''}
                </span>
                <span className="block">{h.falla}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {o.acompanantes.length > 0 && (
        <p className="text-sm text-texto-2">
          {acompana
            ? `Vas acompañando a ${o.tecnico?.nombre ?? 'otro técnico'}: el informe lo carga el responsable de la orden.`
            : `Van con vos: ${o.acompanantes.map((t) => t.nombre).join(', ')}.`}
        </p>
      )}

      {abierta && acompana ? null : abierta ? (
        <>
          {o.llegada ? <Aviso tono="ok">Llegaste a las {horaDe(o.llegada)}.</Aviso> : <Llegue id={o.id} />}
          <Panel className="p-4">
            <h2 className="mb-4 text-sm font-semibold">Informe</h2>
            <InformeTecnico
              id={o.id}
              campos={o.plantilla?.devolucion ?? []}
              equipos={equipos.map((e) => ({ id: e.id, texto: nombres[e.id] }))}
              hoy={hoy}
            />
          </Panel>
        </>
      ) : (
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Informe enviado</h2>
          {o.solucion && <p className="mb-3 text-sm whitespace-pre-line">{o.solucion}</p>}
          {o.plantilla && <VistaRespuestas campos={o.plantilla.devolucion} valores={o.resultados} equipos={nombres} vacio="" />}
        </Panel>
      )}
    </div>
  )
}
