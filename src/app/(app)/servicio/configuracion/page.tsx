import { desc } from 'drizzle-orm'
import { headers } from 'next/headers'
import { Send } from 'lucide-react'
import type { Metadata } from 'next'

import { Aviso, Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { correos } from '@/db/schema'
import { tienePermiso } from '@/lib/permisos'
import { correoConfigurado } from '@/modulos/comunicaciones/correo'
import { listarUsuariosPortal } from '@/modulos/portal/portal'
import { obtenerConfiguracion } from '@/modulos/servicio/configuracion'
import { listarEtiquetas } from '@/modulos/servicio/etiquetas'

import { paginaContratos } from '../../contratos/modulo'
import { enviarPendientesAccion } from '../acciones'
import { habilitarPortalAccion } from './acciones'
import { Etiquetas } from './Etiquetas'
import { FormularioConfiguracion } from './FormularioConfiguracion'
import { InvitarPortal } from './InvitarPortal'

export const metadata: Metadata = { title: 'Configuración del servicio técnico' }

const hora = (d: Date) =>
  d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

export default async function Configuracion({ searchParams }: PageProps<'/servicio/configuracion'>) {
  const sesion = await paginaContratos('servicio.configurar')
  const { enviados, fallidos, error } = (await searchParams) as { enviados?: string; fallidos?: string; error?: string }
  const { config, bandeja, usuarios, etiquetas } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    config: await obtenerConfiguracion(tx),
    etiquetas: await listarEtiquetas(tx, true),
    bandeja: await tx.select().from(correos).orderBy(desc(correos.creado)).limit(50),
    usuarios: await listarUsuariosPortal(tx),
  }))
  const h = await headers()
  const base = process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  const portal = `${base}/portal/ingresar?empresa=${sesion.empresa.cuit}`
  const smtp = correoConfigurado()
  const pendientes = bandeja.filter((c) => c.estado !== 'enviado').length
  return (
    <>
      <EncabezadoPagina
        titulo="Configuración del servicio técnico"
        bajada="Tiempos comprometidos, avisos al cliente, portal de clientes y correos."
      />
      <Panel className="mb-4 p-4">
        <FormularioConfiguracion inicial={config} portal={portal} />
      </Panel>
      <Panel className="mb-4 p-4">
        <h2 className="text-sm font-semibold">Etiquetas de las órdenes</h2>
        <p className="mb-1 text-xs text-texto-2">
          Para marcar y filtrar órdenes: espera repuesto, garantía del fabricante, cliente VIP… Se ven en el listado y en el
          calendario.
        </p>
        <Etiquetas etiquetas={etiquetas} />
      </Panel>
      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Usuarios del portal de clientes</h2>
        <div className="border-b border-borde p-4">
          {!config.portal && (
            <div className="mb-3">
              <Aviso tono="aviso">
                El portal está deshabilitado: los usuarios no pueden entrar hasta que lo habilites arriba.
              </Aviso>
            </div>
          )}
          <InvitarPortal />
        </div>
        {usuarios.length > 0 && (
          <table className="w-full min-w-[640px] text-sm">
            <tbody className="divide-y divide-borde">
              {usuarios.map((u) => (
                <tr key={u.id} className={u.activo ? '' : 'text-texto-3'}>
                  <td className="px-4 py-2 font-medium">{u.cliente}</td>
                  <td className="px-4 py-2">
                    {u.email}
                    {u.nombre && <span className="block text-xs text-texto-2">{u.nombre}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {!u.activo ? (
                      <Chip>De baja</Chip>
                    ) : u.aceptada ? (
                      <Chip tono="ok">Activo</Chip>
                    ) : (
                      <Chip tono="aviso">Invitación pendiente</Chip>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-texto-2">
                    Último ingreso: {u.ultimoIngreso ? hora(u.ultimoIngreso) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={habilitarPortalAccion.bind(null, u.id, !u.activo)}>
                      <Boton type="submit" className="h-7 px-2 text-xs">
                        {u.activo ? 'Dar de baja' : 'Habilitar'}
                      </Boton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel className="overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
          <h2 className="text-sm font-semibold">Bandeja de salida</h2>
          {smtp && pendientes > 0 && tienePermiso(sesion.permisos, 'servicio.configurar') && (
            <form action={enviarPendientesAccion}>
              <Boton type="submit">
                <Send aria-hidden className="size-4" /> Enviar los pendientes
              </Boton>
            </form>
          )}
        </div>
        <div className="px-4 pt-3">
          {!smtp && (
            <Aviso tono="aviso">
              No hay servidor de correo configurado: los emails quedan guardados acá y se pueden mandar por WhatsApp desde cada
              orden. Para que salgan solos, quien administra el servidor tiene que cargar SMTP_URL y CORREO_REMITENTE.
            </Aviso>
          )}
          {enviados && (
            <Aviso tono={fallidos !== '0' ? 'aviso' : 'ok'}>
              Enviados: {enviados}. {fallidos !== '0' ? `Con error: ${fallidos}.` : ''}
            </Aviso>
          )}
          {error && <Aviso>{error}</Aviso>}
        </div>
        {bandeja.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">Todavía no salió ningún correo.</p>
        ) : (
          <table className="mt-3 w-full min-w-[640px] text-sm">
            <thead className="border-y border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Para</th>
                <th className="px-4 py-2 font-medium">Asunto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {bandeja.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-texto-2">{hora(c.creado)}</td>
                  <td className="px-4 py-2">{c.para}</td>
                  <td className="px-4 py-2">
                    <details>
                      <summary className="cursor-pointer">{c.asunto}</summary>
                      <pre className="mt-2 font-sans text-xs whitespace-pre-wrap text-texto-2">{c.texto}</pre>
                    </details>
                  </td>
                  <td className="px-4 py-2">
                    <Chip tono={c.estado === 'enviado' ? 'ok' : c.estado === 'error' ? 'error' : 'neutro'}>
                      {c.estado === 'enviado' ? 'Enviado' : c.estado === 'error' ? `Error (${c.intentos})` : 'Pendiente'}
                    </Chip>
                    {c.error && <span className="block text-xs text-error">{c.error}</span>}
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
