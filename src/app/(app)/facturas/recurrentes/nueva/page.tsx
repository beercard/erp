import type { Metadata } from 'next'

import { Aviso, EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'

import { opcionesRecurrente } from '../datos'
import { FormularioRecurrente } from '../Formulario'

export const metadata: Metadata = { title: 'Nueva factura recurrente' }

/** Primer día del mes que viene: lo más común para un abono. */
function proximoMes(hoy: string) {
  const [a, m] = hoy.split('-').map(Number)
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10)
}

export default async function NuevaRecurrente() {
  await exigirPermiso('ventas.facturar')
  const o = await enLaEmpresa('ventas.facturar', (tx) => opcionesRecurrente(tx))
  return (
    <>
      <EncabezadoPagina titulo="Nueva factura recurrente" />
      {!o.puntosVenta.length ? (
        <Aviso tono="aviso">
          No hay puntos de venta de factura electrónica. Cargá uno en Configuración → Puntos de venta (tipo electrónico).
        </Aviso>
      ) : (
        <FormularioRecurrente
          id={null}
          clientes={o.clientes}
          puntosVenta={o.puntosVenta}
          inicial={{
            terceroId: '',
            nombre: '',
            cadaMeses: 1,
            proxima: proximoMes(hoyArgentina()),
            hasta: null,
            puntoVenta: o.puntosVenta[0].valor,
            concepto: 2,
            diasVencimiento: 10,
            renglones: [{ descripcion: 'Abono {periodo}', cantidad: '1', precioUnitario: '0', alicuotaIva: 5 }],
            observaciones: null,
            autorizar: true,
            enviar: true,
          }}
        />
      )}
    </>
  )
}
