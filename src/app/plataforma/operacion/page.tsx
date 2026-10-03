import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { estadoOperacion } from '@/modulos/plataforma/consola'

import { archivarErrorAccion } from '../acciones'
import { exigirAdmin } from '../admin'
import { erroresDelDia, fechaHora, hace, Indicador, Indicadores, TituloPanel } from '../componentes'

export const metadata: Metadata = { title: 'Operación · Plataforma' }

type Nivel = 'ok' | 'error' | 'aviso'
const ICONO = { ok: CircleCheck, error: CircleAlert, aviso: CircleHelp }
const COLOR = { ok: 'text-ok', error: 'text-error', aviso: 'text-aviso' }

/** Un control del servicio: ícono y texto (nunca solo el color), qué pasa y qué hacer. */
function Control({ nivel, titulo, children }: { nivel: Nivel; titulo: string; children: ReactNode }) {
  const Icono = ICONO[nivel]
  return (
    <li className="flex gap-3 px-4 py-3">
      <Icono aria-hidden className={`mt-0.5 size-5 shrink-0 ${COLOR[nivel]}`} />
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          {titulo}
          <span className="sr-only"> ({nivel === 'ok' ? 'bien' : nivel === 'error' ? 'con problemas' : 'sin datos'})</span>
        </p>
        <div className="mt-0.5 text-texto-2">{children}</div>
      </div>
    </li>
  )
}

const megas = (bytes: number | null) =>
  bytes === null
    ? '—'
    : bytes > 1_073_741_824
      ? `${(bytes / 1_073_741_824).toFixed(1)} GB`
      : `${Math.round(bytes / 1_048_576)} MB`

export default async function Operacion() {
  await exigirAdmin()
  const o = await estadoOperacion()
  const ahora = new Date()
  const correoConErrores = o.correo.filter((c) => c.errores > 0)

  return (
    <>
      <EncabezadoPagina
        titulo="Operación"
        bajada="Salud del servidor: tarea periódica, copias de seguridad, correo saliente y errores."
      />

      <div className="flex flex-col gap-5">
        <Indicadores>
          <Indicador
            rotulo="Errores en 24 h"
            valor={erroresDelDia(o.errores, ahora)}
            detalle={`${o.errores.length} distintos registrados`}
          />
          <Indicador rotulo="Sesiones abiertas" valor={o.sesionesActivas} detalle={`${o.soportesAbiertos} en modo soporte`} />
          <Indicador rotulo="Base de datos" valor={megas(o.tamanoBase)} detalle="tamaño en disco" />
          <Indicador
            rotulo="Aplicación"
            valor={`${o.servidor.memoriaMb} MB`}
            detalle={`Node ${o.servidor.node} · arrancó ${hace(o.servidor.activoDesde, ahora)}`}
          />
        </Indicadores>

        <Panel>
          <TituloPanel>Controles</TituloPanel>
          <ul className="divide-y divide-borde">
            <Control
              nivel={!o.cron ? 'aviso' : o.cron.atrasado || !o.cron.ok ? 'error' : 'ok'}
              titulo="Tarea periódica (cada 15 minutos)"
            >
              {!o.cron
                ? 'Nunca corrió. Revisá el servicio "tarea" con: docker compose ps'
                : `Última vez ${hace(o.cron.ultimo, ahora)} (${fechaHora(o.cron.ultimo)})${o.cron.ok ? '' : ', con errores'}.${
                    o.cron.atrasado ? ' Está atrasada: mirá docker compose logs tarea app.' : ''
                  }`}
            </Control>
            <Control
              nivel={!o.copia ? 'aviso' : o.copia.atrasado || !o.copia.ok ? 'error' : 'ok'}
              titulo="Copia de seguridad diaria"
            >
              {!o.copia ? (
                'Sin datos todavía: la copia avisa acá desde deploy/copia.sh. Si ya corrió, revisá /var/log/vektra/copias.log.'
              ) : (
                <>
                  Última {hace(o.copia.ultimo, ahora)} ({fechaHora(o.copia.ultimo)}){o.copia.ok ? '' : ': FALLÓ'}.
                  {typeof o.copia.detalle?.tamano === 'string' && ` Tamaño ${o.copia.detalle.tamano}.`}{' '}
                  {o.copia.detalle?.externa === true
                    ? 'Se envió fuera del servidor.'
                    : o.copia.ok && 'Queda solo en el servidor: configurá RCLONE_DESTINO en deploy/.env.'}
                  {o.copia.atrasado && ' Hace más de un día que no hay copia.'}
                </>
              )}
            </Control>
            <Control
              nivel={!o.restauracion ? 'aviso' : o.restauracion.atrasado || !o.restauracion.ok ? 'error' : 'ok'}
              titulo="Prueba de restauración semanal"
            >
              {!o.restauracion
                ? 'Sin datos todavía (corre los domingos con deploy/probar-restauracion.sh).'
                : `Última ${hace(o.restauracion.ultimo, ahora)}${o.restauracion.ok ? ': la copia se restauró bien.' : ': LA COPIA NO SE PUDO RESTAURAR.'}`}
            </Control>
            <Control nivel={o.smtp ? (correoConErrores.length ? 'error' : 'ok') : 'error'} titulo="Correo saliente">
              {o.smtp
                ? `Configurado${o.remitente ? `, sale como ${o.remitente}` : ''}. ${
                    correoConErrores.length
                      ? `${correoConErrores.length} empresas tienen correos con error.`
                      : 'Sin correos con error.'
                  }`
                : 'Falta SMTP_URL en deploy/.env: los correos quedan en la bandeja de salida sin enviarse.'}
            </Control>
          </ul>
        </Panel>

        {o.correo.length > 0 && (
          <Panel className="overflow-x-auto">
            <TituloPanel>Correo saliente por empresa</TituloPanel>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-borde text-left text-xs text-texto-2">
                <tr>
                  <th className="px-4 py-2 font-medium">Empresa</th>
                  <th className="px-4 py-2 text-right font-medium">Enviados (7 días)</th>
                  <th className="px-4 py-2 text-right font-medium">Pendientes</th>
                  <th className="px-4 py-2 text-right font-medium">Con error</th>
                  <th className="px-4 py-2 font-medium">Último error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {o.correo.map((c) => (
                  <tr key={c.empresaId}>
                    <td className="px-4 py-2">
                      <Link href={`/plataforma/empresas/${c.empresaId}`} className="hover:text-acento">
                        {c.empresa}
                      </Link>
                    </td>
                    <td className="cifras px-4 py-2 text-right">{c.enviados}</td>
                    <td className="cifras px-4 py-2 text-right">{c.pendientes}</td>
                    <td className="cifras px-4 py-2 text-right">{c.errores ? <Chip tono="error">{c.errores}</Chip> : 0}</td>
                    <td className="max-w-xs truncate px-4 py-2 text-xs text-texto-3" title={c.ultimoError ?? ''}>
                      {c.ultimoError ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <Panel>
          <TituloPanel
            extra={<span className="text-xs text-texto-2">Se avisa por correo como mucho cada 6 horas por error</span>}
          >
            Errores del servidor
          </TituloPanel>
          {o.errores.length === 0 ? (
            <p className="px-4 py-6 text-sm text-texto-2">Sin errores registrados.</p>
          ) : (
            <ul className="divide-y divide-borde text-sm">
              {o.errores.map((e) => (
                <li key={e.huella}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-2.5 hover:bg-superficie-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.mensaje}</span>
                        <span className="text-xs text-texto-3">
                          {e.ruta ?? 'sin ruta'} · {e.tipo ?? '—'}
                        </span>
                      </span>
                      <span className="cifras text-right text-xs text-texto-2">
                        {e.cantidad} {e.cantidad === 1 ? 'vez' : 'veces'}
                        <span className="block">{hace(e.ultimo, ahora)}</span>
                      </span>
                    </summary>
                    <div className="flex flex-col gap-2 border-t border-borde bg-superficie-2/50 px-4 py-3">
                      <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap">{e.mensaje}</pre>
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                        <dt className="text-texto-2">Primera vez</dt>
                        <dd className="cifras">{fechaHora(e.primero)}</dd>
                        <dt className="text-texto-2">Última vez</dt>
                        <dd className="cifras">{fechaHora(e.ultimo)}</dd>
                        <dt className="text-texto-2">Digest</dt>
                        <dd className="font-mono">{e.digest ?? '—'}</dd>
                        <dt className="text-texto-2">Para ver el detalle</dt>
                        <dd className="font-mono">docker compose logs app | grep {e.digest ?? '…'}</dd>
                      </dl>
                      <form action={archivarErrorAccion.bind(null, e.huella)}>
                        <BotonConfirmar
                          pregunta="¿Archivar este error? Si vuelve a pasar, aparece de nuevo."
                          className="h-8 px-3 text-xs"
                        >
                          Archivar (ya se resolvió)
                        </BotonConfirmar>
                      </form>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
