import { eq, inArray } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { VistaDocumento } from '@/components/comercial/VistaDocumento'
import type { Transaccion } from '@/db/conexion'
import { condicionesIva, condicionesPago, tiposDocumento, transportes } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { fechaCorta, sumarDias } from '@/lib/fechas'
import { obtenerPedido, obtenerPresupuesto } from '@/modulos/comercial/documentos'
import { formatearNumero } from '@/modulos/comercial/numeracion'
import { obtenerRemito } from '@/modulos/comercial/remitos'
import { datosEmpresa } from '@/modulos/empresa/datos'

import { BotonImprimir } from './BotonImprimir'
import { HojaOrdenCompra, HojaPago, HojaRetencion } from './HojasCompras'
import { HojaFactura } from './HojaFactura'
import { HojaRecibo } from './HojaRecibo'
import { HojaServicio } from './HojaServicio'

export const metadata: Metadata = { title: 'Imprimir' }

const TIPOS = ['presupuesto', 'pedido', 'remito'] as const
type Tipo = (typeof TIPOS)[number]

type Doc =
  | { tipo: 'presupuesto'; d: NonNullable<Awaited<ReturnType<typeof obtenerPresupuesto>>> }
  | { tipo: 'pedido'; d: NonNullable<Awaited<ReturnType<typeof obtenerPedido>>> }
  | { tipo: 'remito'; d: NonNullable<Awaited<ReturnType<typeof obtenerRemito>>> }

async function cargar(tx: Transaccion, tipo: Tipo, id: string): Promise<Doc | null> {
  if (tipo === 'presupuesto') {
    const d = await obtenerPresupuesto(tx, id)
    return d && { tipo, d }
  }
  if (tipo === 'pedido') {
    const d = await obtenerPedido(tx, id)
    return d && { tipo, d }
  }
  const d = await obtenerRemito(tx, id)
  return d && { tipo, d }
}

const cantidad = (v: string) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 4 })

/**
 * Hoja A4 de un documento, fuera del marco de la app. Presupuesto, pedido,
 * remito y recibo no son fiscales (llevan la "X"); facturas y notas van en
 * HojaFactura con su CAE y QR.
 */
export default async function Imprimir({ params }: PageProps<'/imprimir/[tipo]/[id]'>) {
  const { tipo, id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  if (tipo === 'factura') return <HojaFactura id={id} />
  if (tipo === 'recibo') return <HojaRecibo id={id} />
  if (tipo === 'pago') return <HojaPago id={id} />
  if (tipo === 'retencion') return <HojaRetencion id={id} />
  if (tipo === 'orden-compra') return <HojaOrdenCompra id={id} />
  if (tipo === 'servicio') return <HojaServicio id={id} />
  if (!TIPOS.includes(tipo as Tipo)) notFound()
  const sesion = await requerirEmpresa()
  const empresa = await datosEmpresa(sesion.empresa.id)
  const datos = await enLaEmpresa('ventas.ver', async (tx) => {
    const doc = await cargar(tx, tipo as Tipo, id)
    if (!doc) return null
    const codigosIva = [doc.d.cliente?.condicionIva, empresa?.condicionIva].filter((c): c is number => c != null)
    const ivas = codigosIva.length ? await tx.select().from(condicionesIva).where(inArray(condicionesIva.codigo, codigosIva)) : []
    const [tipoDoc] = doc.d.cliente?.tipoDocumento
      ? await tx.select().from(tiposDocumento).where(eq(tiposDocumento.codigo, doc.d.cliente.tipoDocumento))
      : []
    const condicionId = doc.tipo === 'remito' ? null : doc.d.condicionPagoId
    const [condicion] = condicionId ? await tx.select().from(condicionesPago).where(eq(condicionesPago.id, condicionId)) : []
    const transporteId = doc.tipo === 'remito' ? doc.d.transporteId : null
    const [transporte] = transporteId ? await tx.select().from(transportes).where(eq(transportes.id, transporteId)) : []
    return { doc, ivas: new Map(ivas.map((i) => [i.codigo, i.nombre])), tipoDoc, condicion, transporte }
  })
  if (!datos || !empresa) notFound()
  const { doc, ivas } = datos
  const c = doc.d.cliente

  const titulo =
    doc.tipo === 'presupuesto'
      ? `Presupuesto N° ${String(doc.d.numero).padStart(6, '0')}`
      : doc.tipo === 'pedido'
        ? `Nota de pedido N° ${String(doc.d.numero).padStart(6, '0')}`
        : `Remito N° ${formatearNumero(doc.d.puntoVenta, doc.d.numero)}`

  return (
    <div className="hoja min-h-full">
      <div className="no-imprimir sticky top-0 flex items-center justify-between gap-3 border-b border-borde bg-superficie-2 px-6 py-3">
        <span className="text-sm text-texto-2">Vista de impresión · A4</span>
        <BotonImprimir />
      </div>
      <article className="mx-auto max-w-[190mm] px-6 py-8 text-[12px] print:max-w-none print:p-0">
        <header className="grid grid-cols-[1fr_auto_1fr] gap-4 border-b-2 border-texto pb-4">
          <div>
            <p className="text-lg font-bold">{empresa.nombreFantasia || empresa.razonSocial}</p>
            {empresa.nombreFantasia && <p>{empresa.razonSocial}</p>}
            <p>{[empresa.domicilioFiscal, empresa.localidad].filter(Boolean).join(', ')}</p>
            <p>{ivas.get(empresa.condicionIva)}</p>
          </div>
          <div className="flex flex-col items-center">
            {/* "X": documento sin valor fiscal, como manda la costumbre para remitos y presupuestos. */}
            <span className="grid size-12 place-items-center border-2 border-texto text-2xl font-bold">X</span>
            <span className="mt-1 text-center text-[9px] leading-tight">
              Documento no válido
              <br />
              como factura
            </span>
          </div>
          <div className="text-right">
            <p className="text-base font-bold">{titulo}</p>
            <p>Fecha: {fechaCorta(doc.d.fecha)}</p>
            <p className="cifras">CUIT {formatearCuit(empresa.cuit)}</p>
            {empresa.iibbNumero && <p className="cifras">IIBB {empresa.iibbNumero}</p>}
            {empresa.inicioActividades && <p>Inicio de actividades: {fechaCorta(empresa.inicioActividades)}</p>}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-borde py-3">
          <Dato etiqueta="Cliente">
            {c?.razonSocial} <span className="cifras text-texto-2">({c?.codigo})</span>
          </Dato>
          <Dato etiqueta={datos.tipoDoc?.abreviatura ?? 'Documento'}>
            <span className="cifras">
              {c?.numeroDocumento && (c.tipoDocumento === 80 ? formatearCuit(c.numeroDocumento) : c.numeroDocumento)}
            </span>
          </Dato>
          <Dato etiqueta="Domicilio">{[c?.domicilio, c?.localidad].filter(Boolean).join(', ')}</Dato>
          <Dato etiqueta="IVA">{c?.condicionIva != null ? ivas.get(c.condicionIva) : ''}</Dato>
          {datos.condicion && <Dato etiqueta="Condición de pago">{datos.condicion.nombre}</Dato>}
          {doc.tipo === 'presupuesto' && (
            <Dato etiqueta="Válido hasta">{fechaCorta(sumarDias(doc.d.fecha, doc.d.validezDias))}</Dato>
          )}
          {doc.tipo === 'pedido' && doc.d.fechaEntrega && (
            <Dato etiqueta="Entrega prevista">{fechaCorta(doc.d.fechaEntrega)}</Dato>
          )}
          {doc.tipo === 'remito' && <Dato etiqueta="Sale de">{doc.d.deposito?.nombre}</Dato>}
          {datos.transporte && <Dato etiqueta="Transporte">{datos.transporte.nombre}</Dato>}
          {doc.tipo === 'remito' && doc.d.pedido && (
            <Dato etiqueta="Pedido">
              <span className="cifras">{String(doc.d.pedido.numero).padStart(6, '0')}</span>
            </Dato>
          )}
          {doc.tipo !== 'remito' && doc.d.moneda !== 'PES' && (
            <Dato etiqueta="Moneda">
              Dólares · cotización <span className="cifras">{Number(doc.d.cotizacion).toLocaleString('es-AR')}</span>
            </Dato>
          )}
        </section>

        <section className="py-3">
          {doc.tipo === 'remito' ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-borde text-left text-texto-2">
                  <th className="py-1.5 pr-3 font-medium">Cantidad</th>
                  <th className="py-1.5 pr-3 font-medium">Descripción</th>
                  <th className="py-1.5 font-medium">Números de serie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {doc.d.items.map((i) => (
                  <tr key={i.id} className="break-inside-avoid">
                    <td className="cifras py-1.5 pr-3">{cantidad(i.cantidad)}</td>
                    <td className="py-1.5 pr-3">{i.descripcion}</td>
                    <td className="cifras py-1.5 text-texto-2">{i.series?.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <VistaDocumento moneda={doc.d.moneda} items={doc.d.items} />
          )}
        </section>

        {doc.d.observaciones && (
          <section className="border-t border-borde py-3 whitespace-pre-line">
            <p className="mb-1 font-semibold">Observaciones</p>
            {doc.d.observaciones}
          </section>
        )}

        {doc.tipo === 'remito' && (
          <footer className="mt-16 grid grid-cols-3 gap-8 text-center text-texto-2">
            {['Firma', 'Aclaración', 'DNI'].map((t) => (
              <p key={t} className="border-t border-texto pt-1">
                {t}
              </p>
            ))}
          </footer>
        )}
        {doc.tipo === 'remito' && doc.d.estado === 'anulado' && (
          <p className="mt-6 text-center text-xl font-bold tracking-widest text-error">ANULADO</p>
        )}
      </article>
    </div>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <p>
      <span className="text-texto-2">{etiqueta}: </span>
      {children}
    </p>
  )
}
