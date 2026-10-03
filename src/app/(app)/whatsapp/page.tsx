import { Bot, CheckCheck, FileText, Image as Imagen, Settings, UserRound } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Boton, BotonEnlace, Chip, EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { cuentaDeEmpresa, listarConversaciones, obtenerConversacion } from '@/modulos/whatsapp/whatsapp'

import { atenderAccion } from './acciones'
import { AlFinal, Refrescar, Responder } from './Piezas'

export const metadata: Metadata = { title: 'WhatsApp' }

const ZONA = 'America/Argentina/Buenos_Aires'
const hora = (d: Date) => d.toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' })
const cuando = (d: Date | null) => {
  if (!d) return ''
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: ZONA })
  return d.toLocaleDateString('es-AR', { timeZone: ZONA }) === hoy
    ? hora(d)
    : d.toLocaleDateString('es-AR', { timeZone: ZONA, day: 'numeric', month: 'short' })
}
const ESTADO_ENVIO: Record<string, string> = { enviado: '✓', entregado: '✓✓', leido: '✓✓', fallido: '!' }

/** Bandeja de WhatsApp: conversaciones a la izquierda y la elegida a la derecha, como en el teléfono. */
export default async function BandejaWhatsapp({ searchParams }: PageProps<'/whatsapp'>) {
  const sesion = await exigirPermiso('whatsapp.atender')
  const { c, q, ver } = await searchParams
  const texto = typeof q === 'string' ? q : ''
  const estado = ver === 'cerradas' ? 'cerrada' : 'abierta'
  const elegida = typeof c === 'string' && /^[0-9a-f-]{36}$/i.test(c) ? c : null
  const [cuenta, lista, conv] = await enLaEmpresa(
    'whatsapp.atender',
    async (tx) =>
      [
        await cuentaDeEmpresa(tx),
        await listarConversaciones(tx, { q: texto, estado }),
        elegida ? await obtenerConversacion(tx, elegida) : null,
      ] as const,
  )
  const configurar = tienePermiso(sesion.permisos, 'whatsapp.configurar')
  const enlace = (p: Record<string, string | null>) => {
    const u = new URLSearchParams({ ...(texto ? { q: texto } : {}), ...(ver === 'cerradas' ? { ver: 'cerradas' } : {}) })
    for (const [k, v] of Object.entries(p)) {
      if (v === null) u.delete(k)
      else u.set(k, v)
    }
    return `/whatsapp?${u}`
  }

  return (
    <>
      <Refrescar segundos={15} />
      <EncabezadoPagina
        titulo="WhatsApp"
        bajada={
          cuenta
            ? `${cuenta.numero ?? 'Número conectado'}${cuenta.agente ? ' · el agente de atención está activo' : ''}`
            : 'Conectá el número de WhatsApp Business de la empresa.'
        }
        acciones={
          configurar && (
            <BotonEnlace href="/whatsapp/configuracion">
              <Settings aria-hidden /> Configuración
            </BotonEnlace>
          )
        }
      />
      {!cuenta && (
        <Aviso tono="info">
          Todavía no hay un número conectado.{' '}
          {configurar && (
            <Link href="/whatsapp/configuracion" className="font-medium underline">
              Conectarlo
            </Link>
          )}
        </Aviso>
      )}
      {cuenta && (
        <div className="tarjeta grid h-[calc(100dvh-15rem)] min-h-[28rem] overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className={`flex min-h-0 flex-col border-r border-borde ${elegida ? 'max-md:hidden' : ''}`}>
            <div className="flex flex-col gap-2 border-b border-borde p-3">
              <form role="search">
                {ver === 'cerradas' && <input type="hidden" name="ver" value="cerradas" />}
                <input
                  name="q"
                  defaultValue={texto}
                  placeholder="Buscar nombre, cliente o número"
                  aria-label="Buscar"
                  className="h-9 w-full rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm"
                />
              </form>
              <nav className="flex gap-1.5 text-[13px]">
                <Link
                  href={enlace({ ver: null, c: null })}
                  aria-current={estado === 'abierta' ? 'page' : undefined}
                  className="rounded-full px-2.5 py-1 text-texto-2 aria-[current=page]:bg-acento-suave aria-[current=page]:text-acento"
                >
                  Abiertas
                </Link>
                <Link
                  href={enlace({ ver: 'cerradas', c: null })}
                  aria-current={estado === 'cerrada' ? 'page' : undefined}
                  className="rounded-full px-2.5 py-1 text-texto-2 aria-[current=page]:bg-acento-suave aria-[current=page]:text-acento"
                >
                  Cerradas
                </Link>
              </nav>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-borde overflow-y-auto">
              {!lista.length && <li className="px-4 py-8 text-center text-sm text-texto-3">No hay conversaciones.</li>}
              {lista.map((x) => (
                <li key={x.id}>
                  <Link
                    href={enlace({ c: x.id })}
                    className={`flex gap-3 px-3 py-2.5 hover:bg-superficie-2 ${x.id === elegida ? 'bg-acento-suave/60' : ''}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok-suave text-sm font-semibold text-ok">
                      {(x.cliente ?? x.nombre ?? '#').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{x.cliente ?? x.nombre ?? `+${x.telefono}`}</span>
                        <span className="shrink-0 text-[11px] text-texto-3">{cuando(x.ultimoMensaje)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-texto-2">{x.ultimo ?? '(archivo)'}</span>
                        {x.noLeidos > 0 && (
                          <span className="rounded-full bg-ok px-1.5 text-[11px] font-semibold text-white">{x.noLeidos}</span>
                        )}
                      </span>
                      <span className="mt-0.5 flex gap-1">
                        {x.usuarioId && <Chip>Equipo</Chip>}
                        {!x.usuarioId && x.atiende === 'agente' && cuenta.agente && (
                          <Chip tono="info">
                            <Bot aria-hidden className="size-3" /> Agente
                          </Chip>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
          <section className={`flex min-h-0 flex-col ${elegida ? '' : 'max-md:hidden'}`}>
            {!conv ? (
              <div className="grid flex-1 place-items-center p-6 text-sm text-texto-3">Elegí una conversación.</div>
            ) : (
              <>
                <header className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-2.5">
                  <Link href={enlace({ c: null })} className="text-sm text-acento md:hidden">
                    ← Volver
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{conv.cliente ?? conv.nombre ?? `+${conv.telefono}`}</p>
                    <p className="text-xs text-texto-2">
                      +{conv.telefono}
                      {conv.terceroId && (
                        <>
                          {' · '}
                          <Link href={`/terceros/${conv.terceroId}`} className="text-acento hover:underline">
                            ficha del cliente
                          </Link>
                        </>
                      )}
                      {conv.usuarioId && ' · persona de la empresa'}
                    </p>
                  </div>
                  {!conv.usuarioId && cuenta.agente && (
                    <form
                      action={atenderAccion.bind(null, conv.id, { atiende: conv.atiende === 'agente' ? 'humano' : 'agente' })}
                    >
                      <Boton type="submit" variante={conv.atiende === 'agente' ? 'primario' : 'secundario'}>
                        {conv.atiende === 'agente' ? (
                          <>
                            <UserRound aria-hidden /> Lo atiendo yo
                          </>
                        ) : (
                          <>
                            <Bot aria-hidden /> Devolver al agente
                          </>
                        )}
                      </Boton>
                    </form>
                  )}
                  <form action={atenderAccion.bind(null, conv.id, { estado: conv.estado === 'abierta' ? 'cerrada' : 'abierta' })}>
                    <Boton type="submit" variante="fantasma">
                      <CheckCheck aria-hidden /> {conv.estado === 'abierta' ? 'Cerrar' : 'Reabrir'}
                    </Boton>
                  </form>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto bg-superficie-2/60 px-4 py-4">
                  <ol className="flex flex-col gap-2">
                    {conv.mensajes.map((m) => {
                      const mio = m.direccion === 'saliente'
                      return (
                        <li key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-suave ${mio ? 'rounded-br-md bg-ok-suave' : 'rounded-bl-md bg-superficie'}`}
                          >
                            {mio && m.autor !== 'usuario' && (
                              <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-texto-3">
                                {m.autor === 'agente' ? <Bot aria-hidden className="size-3" /> : null}
                                {m.autor === 'agente' ? 'Agente' : 'Sistema'}
                              </p>
                            )}
                            {m.medio && (
                              <p className="mb-1 flex items-center gap-1.5 text-xs text-texto-2">
                                {m.medio.tipo.startsWith('image/') ? (
                                  <Imagen aria-hidden className="size-4" />
                                ) : (
                                  <FileText aria-hidden className="size-4" />
                                )}
                                {m.medio.nombre ?? (m.medio.tipo.startsWith('image/') ? 'Foto' : 'Archivo')}
                              </p>
                            )}
                            {m.texto && <p className="break-words whitespace-pre-line">{m.texto}</p>}
                            {typeof m.datos?.nota === 'string' && <p className="mt-1 text-xs text-texto-2">{m.datos.nota}</p>}
                            <p className="mt-0.5 text-right text-[10px] text-texto-3">
                              {mio && m.usuario ? `${m.usuario} · ` : ''}
                              {hora(m.creado)}{' '}
                              {mio && (
                                <span className={m.estado === 'leido' ? 'text-info' : m.estado === 'fallido' ? 'text-error' : ''}>
                                  {ESTADO_ENVIO[m.estado] ?? ''}
                                </span>
                              )}
                            </p>
                            {m.error && <p className="text-[11px] text-error">{m.error}</p>}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                  <AlFinal />
                </div>
                <Responder id={conv.id} dentro={conv.dentroDeVentana} plantilla={Boolean(cuenta.plantilla)} />
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}
