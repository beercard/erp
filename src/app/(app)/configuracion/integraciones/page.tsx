import type { Metadata } from 'next'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { listarClaves } from '@/modulos/integraciones/claves'
import { listarWebhooks } from '@/modulos/integraciones/webhooks'

import { borrarWebhookAccion, reintentarAccion, revocarClaveAccion } from './acciones'
import { NuevaClave, NuevoWebhook } from './Formularios'

export const metadata: Metadata = { title: 'API e integraciones' }

const hora = (d: Date | null) =>
  d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—'

const ENDPOINTS = [
  ['GET', '/api/v1/clientes', 'Clientes (q, offset, limit)'],
  ['GET', '/api/v1/equipos', 'Equipos instalados (cliente, serie, estado) con su último contador'],
  ['GET', '/api/v1/tipos-orden', 'Tipos de orden con su formulario de instrucciones'],
  ['GET', '/api/v1/ordenes', 'Órdenes de servicio (estado, cliente, desde, hasta)'],
  ['GET', '/api/v1/ordenes/{id}', 'Una orden con instrucciones, informe, visitas e insumos'],
  ['POST', '/api/v1/ordenes', 'Abrir una orden: { cliente, equipo?, tipo?, falla, prioridad?, instrucciones? }'],
  ['POST', '/api/v1/lecturas', 'Contadores: { lecturas: [{ serie, contador, fecha?, creditos? }] }'],
]

export default async function Integraciones() {
  const sesion = await exigirPermiso('empresa.integraciones')
  const { claves, webhooks } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    claves: await listarClaves(tx),
    webhooks: await listarWebhooks(tx),
  }))
  return (
    <>
      <EncabezadoPagina
        titulo="API e integraciones"
        bajada="Para conectar una tienda, un sistema de lecturas (MPS Monitor) u otro sistema: claves de la API y avisos por webhook."
      />

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Claves de la API</h2>
        <div className="border-b border-borde p-4">
          <NuevaClave />
        </div>
        {claves.length > 0 && (
          <table className="w-full min-w-[640px] text-sm">
            <tbody className="divide-y divide-borde">
              {claves.map((c) => (
                <tr key={c.id} className={c.revocada ? 'text-texto-3' : ''}>
                  <td className="px-4 py-2 font-medium">{c.nombre}</td>
                  <td className="cifras px-4 py-2 text-xs">{c.prefijo}</td>
                  <td className="px-4 py-2">
                    <Chip tono={c.acceso === 'total' ? 'aviso' : 'neutro'}>
                      {c.acceso === 'total' ? 'Lectura y escritura' : 'Solo lectura'}
                    </Chip>
                  </td>
                  <td className="px-4 py-2 text-xs text-texto-2">Último uso: {hora(c.ultimoUso)}</td>
                  <td className="px-4 py-2 text-right">
                    {c.revocada ? (
                      <Chip>Revocada</Chip>
                    ) : (
                      <form action={revocarClaveAccion.bind(null, c.id)}>
                        <BotonConfirmar
                          pregunta={`¿Revocar la clave “${c.nombre}”? Lo que la use deja de funcionar.`}
                          className="h-7 px-2 text-xs"
                        >
                          Revocar
                        </BotonConfirmar>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <details className="border-t border-borde p-4 text-sm">
          <summary className="cursor-pointer text-acento">Cómo se usa la API</summary>
          <div className="mt-3 flex flex-col gap-3 text-texto-2">
            <p>
              Cada pedido lleva el encabezado <code className="text-texto">Authorization: Bearer erp_…</code>. Las respuestas son
              JSON; los listados se paginan con <code className="text-texto">offset</code> y{' '}
              <code className="text-texto">limit</code> (20 por defecto, hasta 100) y devuelven{' '}
              <code className="text-texto">{'{ paging: { offset, limit, total }, resultados }'}</code>. Los errores vienen con su
              código HTTP y <code className="text-texto">{'{ error }'}</code>.
            </p>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-borde">
                {ENDPOINTS.map(([m, ruta, texto]) => (
                  <tr key={m + ruta}>
                    <td className="py-1 pr-3 font-semibold text-texto">{m}</td>
                    <td className="py-1 pr-3">
                      <code className="text-texto">{ruta}</code>
                    </td>
                    <td className="py-1">{texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <Panel className="overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Webhooks</h2>
        <div className="border-b border-borde p-4">
          <NuevoWebhook />
        </div>
        {webhooks.lista.length > 0 && (
          <ul className="divide-y divide-borde text-sm">
            {webhooks.lista.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0">
                  <code className="block truncate">{w.url}</code>
                  <span className="text-xs text-texto-3">
                    {w.descripcion ? `${w.descripcion} · ` : ''}
                    {w.eventos.join(', ')} · secreto …{w.secretoFinal}
                  </span>
                </span>
                <form action={borrarWebhookAccion.bind(null, w.id)}>
                  <BotonConfirmar pregunta="¿Borrar este webhook? Se dejan de mandar los avisos." className="h-7 px-2 text-xs">
                    Borrar
                  </BotonConfirmar>
                </form>
              </li>
            ))}
          </ul>
        )}
        {webhooks.ultimas.length > 0 && (
          <div className="border-t border-borde">
            <h3 className="px-4 pt-3 text-xs font-semibold tracking-wide text-texto-2 uppercase">Últimos envíos</h3>
            <table className="mt-2 w-full min-w-[640px] text-sm">
              <tbody className="divide-y divide-borde">
                {webhooks.ultimas.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-xs whitespace-nowrap text-texto-2">{hora(e.creado)}</td>
                    <td className="px-4 py-2">
                      <code className="text-xs">{e.evento}</code>
                    </td>
                    <td className="px-4 py-2">
                      <Chip tono={e.estado === 'entregado' ? 'ok' : e.estado === 'fallido' ? 'error' : 'neutro'}>
                        {e.estado === 'entregado'
                          ? 'Entregado'
                          : e.estado === 'fallido'
                            ? 'Falló'
                            : `Pendiente (${e.intentos} intentos)`}
                      </Chip>
                    </td>
                    <td className="max-w-64 truncate px-4 py-2 text-xs text-texto-3">{e.respuesta}</td>
                    <td className="px-4 py-2 text-right">
                      {e.estado !== 'entregado' && (
                        <form action={reintentarAccion.bind(null, e.id)}>
                          <Boton type="submit" className="h-7 px-2 text-xs">
                            Reintentar
                          </Boton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-borde p-4 text-xs text-texto-2">
          Cada envío es un POST con <code>{'{ id, evento, fecha, datos }'}</code> y el encabezado{' '}
          <code>X-ERP-Firma: t=&lt;segundos&gt;,v1=&lt;HMAC-SHA256(secreto, &quot;t.cuerpo&quot;)&gt;</code>. Si el receptor no
          contesta 2xx, se reintenta a los 1, 2, 4… minutos, hasta 8 veces.
        </p>
      </Panel>
    </>
  )
}
