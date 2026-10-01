import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EditorDocumento } from '@/components/comercial/EditorDocumento'
import { Aviso, EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import type { Clase } from '@/modulos/facturacion/tipos'

import { datosFactura } from '../cargar'

export const metadata: Metadata = { title: 'Nuevo comprobante' }

const TITULO: Record<Clase, string> = {
  factura: 'Nueva factura',
  nota_credito: 'Nueva nota de crédito',
  nota_debito: 'Nueva nota de débito',
}
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)

export default async function NuevaFactura({ searchParams }: PageProps<'/facturas/nueva'>) {
  await exigirPermiso('ventas.facturar')
  const sp = await searchParams
  const clase: Clase = sp.clase === 'nota_credito' || sp.clase === 'nota_debito' ? sp.clase : 'factura'
  const datos = await enLaEmpresa('ventas.facturar', (tx) =>
    datosFactura(tx, { pedidoId: uuid(sp.pedido), asociadoId: uuid(sp.asociado), clase }),
  )
  if (!datos) notFound()
  return (
    <>
      <EncabezadoPagina
        titulo={TITULO[clase]}
        bajada={
          clase === 'factura'
            ? 'Elegí el cliente y los artículos. Se graba como borrador: la autorización de ARCA se pide desde la ficha.'
            : clase === 'nota_credito'
              ? 'Por defecto trae todos los renglones del comprobante: dejá solo lo que se devuelve o se bonifica.'
              : 'Agregá lo que se cobra de más (intereses, diferencias de precio).'
        }
      />
      {!datos.factura.puntosVenta.length && (
        <div className="mb-4">
          <Aviso tono="aviso">
            No hay puntos de venta de factura electrónica. Cargá uno en Configuración → Puntos de venta (tipo electrónico).
          </Aviso>
        </div>
      )}
      <EditorDocumento
        tipo="factura"
        id={null}
        inicial={datos.inicial}
        lineasIniciales={datos.lineas}
        cotizacionDolar={datos.dolar}
        opciones={datos.opciones}
        factura={datos.factura}
      />
    </>
  )
}
