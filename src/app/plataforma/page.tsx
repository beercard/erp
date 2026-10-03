import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { pesos } from '@/components/planes/TarjetasPlanes'
import { Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { formatearCuit } from '@/lib/cuit'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { FUNCIONES, MESES_COBRADOS_EN_ANUAL, planPorId, precioDeLista, situacion, type Funcion } from '@/lib/planes'
import { listarConsultas } from '@/modulos/plataforma/consultas'
import { erroresRecientes, estadoCron } from '@/modulos/plataforma/monitoreo'
import { listarSuscripciones, pedidosPendientes } from '@/modulos/plataforma/suscripciones'

import { atenderConsultaAccion, resolverPedidoAccion } from './acciones'
import { exigirAdmin } from './admin'

export const metadata: Metadata = { title: 'Plataforma' }

const TONO: Record<string, 'ok' | 'info' | 'aviso' | 'error' | 'neutro'> = {
  prueba: 'info',
  activa: 'ok',
  impaga: 'aviso',
  suspendida: 'error',
  cancelada: 'neutro',
}

export default async function Plataforma({ searchParams }: PageProps<'/plataforma'>) {
  await exigirAdmin()
  const { estado: filtro } = (await searchParams) as { estado?: string }
  const hoy = hoyArgentina()
  const [todas, pedidos, consultas, cron, errores] = await Promise.all([
    listarSuscripciones(),
    pedidosPendientes(),
    listarConsultas(50),
    estadoCron(),
    erroresRecientes(15),
  ])
  const filas = todas.map((e) => {
    const datos = {
      plan: e.plan ?? 'gratis',
      estado: e.estado ?? 'activa',
      aplicaciones: e.aplicaciones ?? [],
      usuariosAdicionales: e.usuariosAdicionales ?? 0,
      pruebaHasta: e.pruebaHasta,
      pagadoHasta: e.pagadoHasta,
    }
    const sit = situacion(datos, hoy)
    const mensual = e.precioAcordado ? Number(e.precioAcordado) : precioDeLista(datos)
    return { ...e, ...datos, sit, mensual }
  })
  // Ingreso mensual recurrente: lo que pagan las activas (el anual, prorrateado).
  const pagas = filas.filter((f) => f.estado === 'activa' && f.mensual > 0)
  const mrr = pagas.reduce((t, f) => t + (f.ciclo === 'anual' ? (f.mensual * MESES_COBRADOS_EN_ANUAL) / 12 : f.mensual), 0)
  const visibles = filtro ? filas.filter((f) => f.estado === filtro) : filas
  const cuenta = (e: string) => filas.filter((f) => f.estado === e).length

  return (
    <main className="contenido mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/" className="flex items-center gap-1.5 text-sm text-texto-2 hover:text-texto">
        <ArrowLeft aria-hidden className="size-4" /> Volver al sistema
      </Link>
      <EncabezadoPagina titulo="Plataforma" bajada="Empresas clientes del servicio, sus suscripciones y los pedidos de cambio." />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-5">
        {[
          { texto: 'Ingreso mensual recurrente', valor: `${pesos(mrr)} + IVA` },
          { texto: 'Empresas que pagan', valor: String(pagas.length) },
          { texto: 'En prueba', valor: String(cuenta('prueba')) },
          { texto: 'Gratis', valor: String(filas.filter((f) => f.plan === 'gratis').length) },
          { texto: 'Solo lectura (vencidas o suspendidas)', valor: String(filas.filter((f) => f.sit.soloLectura).length) },
        ].map((k) => (
          <div key={k.texto} className="bg-superficie px-4 py-4">
            <span className="cifras block text-xl font-medium">{k.valor}</span>
            <span className="mt-1 block text-xs text-texto-2">{k.texto}</span>
          </div>
        ))}
      </div>

      <Panel>
        <h2 className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-3 text-sm font-semibold">
          Salud del servicio
          <Chip tono={!cron ? 'aviso' : cron.atrasado || !cron.ok ? 'error' : 'ok'}>
            {!cron
              ? 'La tarea periódica nunca corrió'
              : cron.atrasado
                ? `Tarea periódica atrasada: última ${cron.ultimo.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`
                : `Tarea periódica al día${cron.ok ? '' : ' (con errores)'}: ${cron.ultimo.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`}
          </Chip>
        </h2>
        {errores.length ? (
          <ul className="divide-y divide-borde text-sm">
            {errores.map((e) => (
              <li key={e.huella} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.mensaje}</span>
                  <span className="text-xs text-texto-3">
                    {e.ruta} · {e.tipo}
                  </span>
                </span>
                <span className="cifras text-right text-xs text-texto-2">
                  {e.cantidad} {e.cantidad === 1 ? 'vez' : 'veces'}
                  <span className="block">
                    {e.ultimo.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-texto-3">Sin errores registrados.</p>
        )}
      </Panel>

      {pedidos.length > 0 && (
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Pedidos de cambio ({pedidos.length})</h2>
          <table className="w-full min-w-[720px] text-sm">
            <tbody className="divide-y divide-borde">
              {pedidos.map((p) => {
                const d = p.detalle as { plan: string; ciclo: string; aplicaciones: string[]; usuariosAdicionales: number }
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/plataforma/${p.empresaId}`} className="font-medium hover:text-acento">
                        {p.empresa}
                      </Link>
                      <span className="block text-xs text-texto-3">
                        {p.usuario} · {p.email} · {fechaCorta(p.creado.toISOString())}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      Plan {planPorId(d.plan).nombre} ({d.ciclo})
                      {d.aplicaciones.length > 0 && ` + ${d.aplicaciones.map((a) => FUNCIONES[a as Funcion]?.nombre).join(', ')}`}
                      {d.usuariosAdicionales > 0 && ` + ${d.usuariosAdicionales} usuarios`}
                      <span className="cifras block text-xs text-texto-3">{pesos(precioDeLista(d))} /mes de lista</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <form action={resolverPedidoAccion.bind(null, p.id, false)}>
                          <BotonConfirmar pregunta="¿Rechazar el pedido?" className="h-8 px-3 text-xs">
                            Rechazar
                          </BotonConfirmar>
                        </form>
                        <form action={resolverPedidoAccion.bind(null, p.id, true)}>
                          <Boton type="submit" variante="primario" className="h-8 px-3 text-xs">
                            Aplicar (cobrado)
                          </Boton>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {[undefined, 'prueba', 'activa', 'impaga', 'suspendida', 'cancelada'].map((e) => (
          <Link
            key={e ?? 'todas'}
            href={e ? `/plataforma?estado=${e}` : '/plataforma'}
            className={`rounded-full border px-3 py-1 ${filtro === e ? 'border-acento bg-acento text-sobre-acento' : 'border-borde'}`}
          >
            {e ? `${e[0].toUpperCase()}${e.slice(1)} (${cuenta(e)})` : `Todas (${filas.length})`}
          </Link>
        ))}
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-borde text-left text-xs text-texto-2">
            <tr>
              <th className="px-4 py-2 font-medium">Empresa</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Usuarios</th>
              <th className="px-4 py-2 font-medium">Vence</th>
              <th className="px-4 py-2 text-right font-medium">Mensual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.map((f) => (
              <tr key={f.empresaId} className="group hover:bg-superficie-2">
                <td className="px-4 py-2.5">
                  <Link href={`/plataforma/${f.empresaId}`} className="font-medium group-hover:text-acento">
                    {f.razonSocial}
                  </Link>
                  <span className="cifras block text-xs text-texto-3">
                    {formatearCuit(f.cuit)} · alta {fechaCorta(f.alta.toISOString())}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {planPorId(f.plan).nombre}
                  {f.aplicaciones.length > 0 && (
                    <span className="block text-xs text-texto-3">
                      + {f.aplicaciones.map((a) => FUNCIONES[a as Funcion]?.nombre).join(', ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Chip tono={TONO[f.estado] ?? 'neutro'}>{f.estado}</Chip>
                  {f.sit.soloLectura && <span className="ml-1 text-xs text-error">solo lectura</span>}
                  {f.pedidos > 0 && <span className="ml-1 text-xs text-aviso">pedido</span>}
                </td>
                <td className="cifras px-4 py-2.5 text-right">
                  {f.usuarios} / {f.sit.limites.usuarios}
                </td>
                <td className="cifras px-4 py-2.5 text-xs">
                  {f.estado === 'prueba' && f.pruebaHasta
                    ? `prueba ${fechaCorta(f.pruebaHasta)}`
                    : f.pagadoHasta
                      ? fechaCorta(f.pagadoHasta)
                      : '—'}
                </td>
                <td className="cifras px-4 py-2.5 text-right">
                  {f.mensual ? pesos(f.mensual) : '—'}
                  {f.precioAcordado && <span className="block text-xs text-texto-3">acordado</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel className="overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
          Consultas del sitio{' '}
          {consultas.some((c) => c.estado === 'nueva') && (
            <Chip tono="aviso">{consultas.filter((c) => c.estado === 'nueva').length} nuevas</Chip>
          )}
        </h2>
        {consultas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-texto-2">Todavía no llegó ninguna consulta.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <tbody className="divide-y divide-borde">
              {consultas.map((c) => (
                <tr key={c.id} className={c.estado === 'nueva' ? '' : 'text-texto-3'}>
                  <td className="cifras px-4 py-2 align-top text-xs text-texto-2">
                    {c.creado.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    <span className="block">{c.id.slice(0, 8).toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <span className="font-medium">{c.nombre}</span>
                    {c.empresa && ` · ${c.empresa}`}
                    <a href={`mailto:${c.email}`} className="block text-xs text-acento">
                      {c.email}
                    </a>
                    {c.telefono && <span className="block text-xs text-texto-2">{c.telefono}</span>}
                  </td>
                  <td className="max-w-md px-4 py-2 align-top whitespace-pre-line">
                    {(c.rubro || c.origen) && (
                      <span className="mb-1 block text-xs text-texto-3">{[c.rubro, c.origen].filter(Boolean).join(' · ')}</span>
                    )}
                    {c.mensaje}
                  </td>
                  <td className="px-4 py-2 text-right align-top">
                    {c.estado === 'nueva' ? (
                      <form action={atenderConsultaAccion.bind(null, c.id)}>
                        <Boton type="submit" className="h-8 px-2 text-xs">
                          Atendida
                        </Boton>
                      </form>
                    ) : (
                      <Chip>Atendida</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  )
}
