import { and, asc, eq } from 'drizzle-orm'
import { ChevronLeft, Send } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Boton, EncabezadoPagina, Panel } from '@/components/ui'
import { puntosVenta } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { tienePermiso } from '@/lib/permisos'
import { calcularIntereses, configuracionCobranza, deudoresVencidos } from '@/modulos/facturacion/cobranza'

import { enviarEstadoAccion } from './acciones'
import { Configuracion, Intereses } from './Piezas'

export const metadata: Metadata = { title: 'Cobranza automática' }

export default async function CobranzaAutomatica({ searchParams }: PageProps<'/cobranzas/automatica'>) {
  const sesion = await requerirEmpresa()
  const { enviados, fallidos, error } = await searchParams
  const datos = await enLaEmpresa('ventas.ver', async (tx) => ({
    config: await configuracionCobranza(tx),
    deudores: await deudoresVencidos(tx),
    intereses: await calcularIntereses(tx),
    pvs: await tx
      .select({ numero: puntosVenta.numero, nombre: puntosVenta.nombre })
      .from(puntosVenta)
      .where(and(eq(puntosVenta.activo, true), eq(puntosVenta.tipo, 'electronico')))
      .orderBy(asc(puntosVenta.numero)),
  }))
  const cobrar = tienePermiso(sesion.permisos, 'ventas.cobrar')
  const total = datos.deudores.reduce((s, d) => s + Number(d.vencido), 0)
  return (
    <>
      <Link href="/cobranzas" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Cobranzas
      </Link>
      <EncabezadoPagina
        titulo="Cobranza automática"
        bajada={`${datos.deudores.length} clientes con deuda vencida por ${formatearMonto(total.toFixed(2), '$')}. Recordatorios, estado de cuenta e intereses por mora.`}
      />
      {typeof enviados === 'string' && (
        <div className="mb-4">
          <Aviso tono={Number(fallidos) ? 'aviso' : 'ok'}>
            Se mandó el estado de cuenta a {enviados} {enviados === '1' ? 'cliente' : 'clientes'}
            {Number(fallidos) ? `; ${fallidos} sin correo ni WhatsApp disponible` : ''}.
          </Aviso>
        </div>
      )}
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
              <h2 className="font-semibold">Deuda vencida</h2>
              {cobrar && datos.deudores.length > 0 && (
                <form action={enviarEstadoAccion.bind(null, null)}>
                  <Boton type="submit" variante="primario">
                    <Send aria-hidden /> Mandar el estado de cuenta a todos
                  </Boton>
                </form>
              )}
            </div>
            {datos.deudores.length ? (
              <ul className="divide-y divide-borde text-sm">
                {datos.deudores.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <Link href={`/terceros/${d.id}/cuenta`} className="font-medium hover:text-acento">
                        {d.nombre}
                      </Link>
                      <span className="block text-xs text-texto-3">
                        {d.comprobantes} {d.comprobantes === 1 ? 'comprobante' : 'comprobantes'} · el más viejo vencido hace{' '}
                        {d.masViejo} días
                        {!d.email && !d.telefono && ' · sin correo ni teléfono'}
                      </span>
                    </span>
                    <span className="cifras font-semibold text-error">{formatearMonto(d.vencido, '$')}</span>
                    {cobrar && (
                      <form action={enviarEstadoAccion.bind(null, d.id)}>
                        <Boton type="submit" title="Mandar el estado de cuenta por correo y WhatsApp">
                          <Send aria-hidden /> Mandar
                        </Boton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-texto-3">Nadie debe nada vencido.</p>
            )}
          </Panel>
          {datos.intereses.tasa && (
            <Panel className="p-4">
              <h2 className="mb-1 font-semibold">Intereses por mora a hoy</h2>
              <p className="mb-3 text-xs text-texto-3">
                {String(Number(datos.intereses.tasa)).replace('.', ',')} % mensual, simple por día, desde el vencimiento (o desde
                el último cobrado).
              </p>
              {datos.intereses.porCliente.length ? (
                <Intereses clientes={datos.intereses.porCliente} puntosVenta={datos.pvs} />
              ) : (
                <p className="text-sm text-texto-3">No hay intereses para cobrar.</p>
              )}
            </Panel>
          )}
        </div>
        <Panel className="p-4">
          <h2 className="mb-3 font-semibold">Configuración</h2>
          <Configuracion c={datos.config} />
        </Panel>
      </div>
    </>
  )
}
