import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Aviso, Boton, EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { obtenerRecurrente } from '@/modulos/facturacion/automatica'

import { activarRecurrenteAccion, eliminarRecurrenteAccion } from '../../automatica'
import { opcionesRecurrente } from '../datos'
import { FormularioRecurrente } from '../Formulario'

export const metadata: Metadata = { title: 'Factura recurrente' }

export default async function EditarRecurrente({ params }: PageProps<'/facturas/recurrentes/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  await exigirPermiso('ventas.facturar')
  const [r, o] = await enLaEmpresa('ventas.facturar', (tx) => Promise.all([obtenerRecurrente(tx, id), opcionesRecurrente(tx)]))
  if (!r) notFound()
  return (
    <>
      <EncabezadoPagina
        titulo={r.nombre}
        bajada={`${r.emitidas} ${r.emitidas === 1 ? 'factura emitida' : 'facturas emitidas'}${r.activa ? '' : ' · pausada'}`}
        acciones={
          <div className="flex gap-2">
            {r.ultimaFacturaId && (
              <Link href={`/facturas/${r.ultimaFacturaId}`} className="self-center text-sm text-acento hover:underline">
                Ver la última
              </Link>
            )}
            <form action={activarRecurrenteAccion.bind(null, id, !r.activa)}>
              <Boton type="submit">{r.activa ? 'Pausar' : 'Reanudar'}</Boton>
            </form>
            <form action={eliminarRecurrenteAccion.bind(null, id)}>
              <Boton type="submit" variante="fantasma">
                Eliminar
              </Boton>
            </form>
          </div>
        }
      />
      {r.ultimoError && (
        <div className="mb-4">
          <Aviso>Última vez: {r.ultimoError}</Aviso>
        </div>
      )}
      <FormularioRecurrente
        id={id}
        clientes={o.clientes}
        puntosVenta={o.puntosVenta}
        inicial={{
          terceroId: r.terceroId,
          nombre: r.nombre,
          cadaMeses: r.cadaMeses,
          proxima: r.proxima,
          hasta: r.hasta,
          puntoVenta: r.puntoVenta,
          concepto: r.concepto,
          diasVencimiento: r.diasVencimiento,
          renglones: r.renglones.map((i) => ({
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            alicuotaIva: i.alicuotaIva,
          })),
          observaciones: r.observaciones,
          autorizar: r.autorizar,
          enviar: r.enviar,
        }}
      />
    </>
  )
}
