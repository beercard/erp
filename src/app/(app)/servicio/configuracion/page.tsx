import { desc } from 'drizzle-orm'
import { Send } from 'lucide-react'
import type { Metadata } from 'next'

import { Aviso, Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { correos } from '@/db/schema'
import { tienePermiso } from '@/lib/permisos'
import { correoConfigurado } from '@/modulos/comunicaciones/correo'
import { obtenerConfiguracion } from '@/modulos/servicio/configuracion'

import { paginaContratos } from '../../contratos/modulo'
import { enviarPendientesAccion } from '../acciones'
import { FormularioConfiguracion } from './FormularioConfiguracion'

export const metadata: Metadata = { title: 'Configuración del servicio técnico' }

const hora = (d: Date) =>
  d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

export default async function Configuracion({ searchParams }: PageProps<'/servicio/configuracion'>) {
  const sesion = await paginaContratos('servicio.configurar')
  const { enviados, fallidos, error } = (await searchParams) as { enviados?: string; fallidos?: string; error?: string }
  const { config, bandeja } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    config: await obtenerConfiguracion(tx),
    bandeja: await tx.select().from(correos).orderBy(desc(correos.creado)).limit(50),
  }))
  const smtp = correoConfigurado()
  const pendientes = bandeja.filter((c) => c.estado !== 'enviado').length
  return (
    <>
      <EncabezadoPagina
        titulo="Configuración del servicio técnico"
        bajada="Tiempos comprometidos, avisos al cliente y correos."
      />
      <Panel className="mb-4 p-4">
        <FormularioConfiguracion inicial={config} />
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
