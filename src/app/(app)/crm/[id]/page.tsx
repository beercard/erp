import {
  ArrowRight,
  CircleAlert,
  FileText,
  Hourglass,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  RotateCcw,
  Trophy,
  UserPlus,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, Boton, BotonEnlace, Chip, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import {
  asegurarEtapas,
  etiquetasUsadas,
  listarMotivos,
  obtenerOportunidad,
  posiblesDuplicados,
  responsables,
} from '@/modulos/crm/crm'

import {
  borrarOportunidadAccion,
  clienteAccion,
  ganarAccion,
  moverEnFichaAccion,
  presupuestoAccion,
  reabrirAccion,
  vincularAccion,
} from '../acciones'
import { pesosServidor } from '../formato'
import { FormularioOportunidad } from '../FormularioOportunidad'
import { ActividadPendiente, Agendar, Nota, Perder } from './PiezasFicha'

export const metadata: Metadata = { title: 'Oportunidad' }

const ESTADO = {
  abierta: { tono: 'info', texto: 'Abierta' },
  ganada: { tono: 'ok', texto: 'Ganada' },
  perdida: { tono: 'error', texto: 'Perdida' },
} as const

const soloDigitos = (t: string) => t.replace(/\D/g, '')
/** WhatsApp con código de país: si el número es local, se le agrega 549. */
const whatsapp = (t: string) => {
  const d = soloDigitos(t)
  return d.startsWith('54') ? d : `549${d.replace(/^0/, '').replace(/^(\d{2,4})15/, '$1')}`
}

export default async function FichaOportunidad({ params, searchParams }: PageProps<'/crm/[id]'>) {
  const sesion = await exigirPermiso('crm.ver')
  const { id } = await params
  const { editar, guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const datos = await enLaEmpresa('crm.ver', async (tx) => {
    const o = await obtenerOportunidad(tx, id)
    if (!o) return null
    return {
      o,
      etapas: await asegurarEtapas(tx),
      motivos: await listarMotivos(tx),
      personas: await responsables(tx, sesion.empresa.id),
      etiquetas: await etiquetasUsadas(tx),
      duplicados: o.estado === 'abierta' ? await posiblesDuplicados(tx, id) : { clientes: [], oportunidades: [] },
    }
  })
  if (!datos) notFound()
  const { o, etapas, motivos, personas, etiquetas, duplicados } = datos
  const puede = tienePermiso(sesion.permisos, 'crm.oportunidades')
  const hoy = hoyArgentina()

  if (editar === '1' && puede) {
    return (
      <FormularioOportunidad
        id={id}
        etapas={etapas}
        personas={personas}
        etiquetas={etiquetas}
        inicial={{ ...o, ingresoEsperado: o.ingresoEsperado, etiquetas: o.etiquetas }}
      />
    )
  }

  const indice = etapas.findIndex((e) => e.id === o.etapaId)
  const email = o.email ?? o.clienteEmail
  const telefono = o.telefono ?? o.clienteTelefono
  const pendientes = o.actividades.filter((a) => !a.hecha)
  const ponderado = (Number(o.ingresoEsperado) * o.probabilidad) / 100

  return (
    <>
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Listo, quedó guardado.</Aviso>
        </div>
      )}
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}

      {/* Cabecera: acciones a la izquierda y etapas a la derecha, como el formulario de Odoo */}
      <div className="tarjeta mb-5 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {puede && o.estado === 'abierta' && (
            <>
              {tienePermiso(sesion.permisos, 'ventas.presupuestos') && !o.presupuestoId && (
                <form action={presupuestoAccion.bind(null, id)}>
                  <Boton type="submit" variante="primario">
                    <FileText aria-hidden /> Nuevo presupuesto
                  </Boton>
                </form>
              )}
              <form action={ganarAccion.bind(null, id)}>
                <Boton type="submit" className="text-ok">
                  <Trophy aria-hidden /> Ganada
                </Boton>
              </form>
              <Perder id={id} motivos={motivos} />
            </>
          )}
          {puede && o.estado !== 'abierta' && (
            <form action={reabrirAccion.bind(null, id)}>
              <Boton type="submit">
                <RotateCcw aria-hidden /> Reabrir
              </Boton>
            </form>
          )}
          {o.presupuestoId && (
            <BotonEnlace href={`/presupuestos/${o.presupuestoId}`}>
              <FileText aria-hidden /> Presupuesto N.º {o.presupuestoNumero}
            </BotonEnlace>
          )}
          {puede && o.esProspecto && tienePermiso(sesion.permisos, 'maestros.terceros') && (
            <form action={clienteAccion.bind(null, id)}>
              <Boton type="submit" variante="fantasma">
                <UserPlus aria-hidden /> Dar de alta como cliente
              </Boton>
            </form>
          )}
        </div>
        <ol aria-label="Etapas" className="flex overflow-x-auto rounded-lg ring-1 ring-borde">
          {etapas.map((e, n) => {
            const actual = e.id === o.etapaId
            const pasada = n < indice
            const clase = `relative flex h-9 items-center px-4 text-[13px] whitespace-nowrap ${
              actual
                ? o.estado === 'perdida'
                  ? 'bg-error-suave font-semibold text-error'
                  : 'bg-acento font-semibold text-sobre-acento'
                : pasada
                  ? 'bg-acento-suave text-acento'
                  : 'text-texto-2 hover:bg-superficie-2'
            } ${n ? 'border-l border-borde' : ''}`
            return (
              <li key={e.id} aria-current={actual ? 'step' : undefined}>
                {puede && !actual && o.estado !== 'perdida' ? (
                  <form action={moverEnFichaAccion.bind(null, id, e.id)}>
                    <button type="submit" className={clase} title={`Pasar a ${e.nombre}`}>
                      {e.nombre}
                    </button>
                  </form>
                ) : (
                  <span className={clase}>{e.nombre}</span>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Chip tono={ESTADO[o.estado as keyof typeof ESTADO].tono}>{ESTADO[o.estado as keyof typeof ESTADO].texto}</Chip>
                  {o.estancada && (
                    <Chip tono="aviso">
                      <Hourglass aria-hidden className="size-3" /> {o.diasEnEtapa} días en {o.etapa}
                    </Chip>
                  )}
                  {o.etiquetas.map((e) => (
                    <Chip key={e}>{e}</Chip>
                  ))}
                </div>
                <h1 className="text-2xl leading-tight font-bold tracking-tight">{o.titulo}</h1>
                <p className="mt-1 text-texto-2">
                  {o.terceroId ? (
                    <Link href={`/terceros/${o.terceroId}`} className="font-medium text-texto hover:text-acento">
                      {o.cliente}
                    </Link>
                  ) : (
                    <>
                      {o.cliente} <span className="text-texto-3">· prospecto</span>
                    </>
                  )}
                  {o.contacto && o.contacto !== o.cliente && <> · {o.contacto}</>}
                </p>
              </div>
              {puede && (
                <BotonEnlace href={`/crm/${id}?editar=1`} variante="fantasma">
                  <Pencil aria-hidden /> Editar
                </BotonEnlace>
              )}
            </div>

            {(email || telefono) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {telefono && (
                  <>
                    <BotonEnlace href={`tel:${soloDigitos(telefono)}`}>
                      <Phone aria-hidden /> {telefono}
                    </BotonEnlace>
                    <BotonEnlace href={`https://wa.me/${whatsapp(telefono)}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden /> WhatsApp
                    </BotonEnlace>
                  </>
                )}
                {email && (
                  <BotonEnlace href={`mailto:${email}?subject=${encodeURIComponent(o.titulo)}`}>
                    <Mail aria-hidden /> {email}
                  </BotonEnlace>
                )}
              </div>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-borde pt-5 sm:grid-cols-3">
              {[
                [
                  'Ingreso esperado',
                  <span key="i" className="cifras text-lg font-bold">
                    {pesosServidor(o.ingresoEsperado)}
                  </span>,
                ],
                ['Probabilidad', `${o.probabilidad} %`],
                [
                  'Ponderado',
                  <span key="p" className="cifras">
                    {pesosServidor(ponderado)}
                  </span>,
                ],
                ['Cierre estimado', o.cierreEstimado ? o.cierreEstimado.split('-').reverse().join('/') : '—'],
                ['Responsable', o.responsable ?? 'Sin asignar'],
                ['Origen', o.origen ?? '—'],
              ].map(([t, v]) => (
                <div key={t as string}>
                  <dt className="text-xs text-texto-3">{t}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {o.proximoPaso && (
              <p className="mt-5 flex items-center gap-2 rounded-xl bg-acento-suave px-4 py-3 text-sm text-acento">
                <ArrowRight aria-hidden className="size-4 shrink-0" />
                <span>
                  <span className="font-semibold">Próximo paso:</span> {o.proximoPaso}
                </span>
              </p>
            )}
            {o.estado === 'perdida' && (
              <p className="mt-5 rounded-xl bg-error-suave px-4 py-3 text-sm text-error">
                <span className="font-semibold">Perdida en {o.etapa}:</span> {o.motivoPerdida}
                {o.notaPerdida && <> — {o.notaPerdida}</>}
              </p>
            )}
            {o.descripcion && <p className="mt-5 text-sm whitespace-pre-line text-texto-2">{o.descripcion}</p>}
          </Panel>

          {(duplicados.clientes.length > 0 || duplicados.oportunidades.length > 0) && (
            <Panel className="border-aviso/40 p-5">
              <p className="flex items-center gap-2 font-semibold text-aviso">
                <CircleAlert aria-hidden className="size-4" /> Puede estar repetida
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {duplicados.clientes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Cliente{' '}
                      <Link href={`/terceros/${c.id}`} className="font-medium hover:text-acento">
                        {c.razonSocial}
                      </Link>
                      <span className="text-texto-3"> {c.email ?? c.telefono ?? ''}</span>
                    </span>
                    {puede && (
                      <form action={vincularAccion.bind(null, id, c.id)}>
                        <Boton type="submit" className="h-8">
                          Es este cliente
                        </Boton>
                      </form>
                    )}
                  </li>
                ))}
                {duplicados.oportunidades.map((d) => (
                  <li key={d.id}>
                    Otra oportunidad abierta:{' '}
                    <Link href={`/crm/${d.id}`} className="font-medium hover:text-acento">
                      {d.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel>
            <h2 className="border-b border-borde px-5 py-3 font-semibold">Historial</h2>
            <div className="p-5">
              {puede && <Nota oportunidadId={id} />}
              <ol className="mt-5 flex flex-col gap-4">
                {o.historial.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${h.tipo === 'nota' ? 'bg-acento' : 'bg-borde-fuerte'}`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm ${h.tipo === 'nota' ? 'rounded-lg bg-superficie-2 px-3 py-2 whitespace-pre-line' : 'text-texto-2'}`}
                      >
                        {h.texto}
                      </p>
                      <p className="mt-0.5 text-xs text-texto-3">
                        {h.usuario ?? 'Sistema'} ·{' '}
                        {new Intl.DateTimeFormat('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/Argentina/Buenos_Aires',
                        }).format(new Date(h.creado))}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <h2 className="flex items-center justify-between border-b border-borde px-5 py-3 font-semibold">
              Actividades
              <span className="text-xs font-normal text-texto-3">{pendientes.length} pendientes</span>
            </h2>
            <div className="p-5">
              {puede && o.estado === 'abierta' && (
                <Agendar oportunidadId={id} hoy={hoy} personas={personas} yo={sesion.usuario.id} />
              )}
              {o.sinActividad && (
                <p className="mt-4 rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso">
                  No hay nada agendado: una oportunidad sin próximo contacto se enfría.
                </p>
              )}
              {pendientes.length > 0 && (
                <ul className="mt-2 divide-y divide-borde">
                  {pendientes.map((a) => (
                    <ActividadPendiente key={a.id} a={a} oportunidadId={id} editar={puede} />
                  ))}
                </ul>
              )}
              {o.actividades.some((a) => a.hecha) && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-texto-2">
                    Hechas ({o.actividades.filter((a) => a.hecha).length})
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {o.actividades
                      .filter((a) => a.hecha)
                      .map((a) => (
                        <li key={a.id} className="text-sm text-texto-2">
                          <span className="line-through">{a.resumen}</span>
                          {a.resultado && <span className="text-texto"> — {a.resultado}</span>}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          </Panel>
          {puede && (
            <form action={borrarOportunidadAccion.bind(null, id)} className="self-end">
              <BotonConfirmar
                variante="fantasma"
                pregunta="¿Borrar la oportunidad con sus actividades e historial? No se puede deshacer."
              >
                Borrar oportunidad
              </BotonConfirmar>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
