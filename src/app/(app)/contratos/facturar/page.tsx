import { and, eq, inArray } from 'drizzle-orm'
import type { Metadata } from 'next'

import { EncabezadoPagina } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { puntosVenta } from '@/db/schema'
import { hoyArgentina } from '@/lib/fechas'
import { cotizacionVigente } from '@/modulos/comercial/cotizacion'

import { paginaContratos } from '../modulo'
import { Facturar } from './Facturar'

export const metadata: Metadata = { title: 'Facturar contratos' }

/** Hasta el 20 se factura el mes anterior; después, el corriente. */
function periodoSugerido(hoy: string) {
  const [a, m, d] = hoy.split('-').map(Number)
  if (d > 20) return hoy.slice(0, 7)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

export default async function FacturarContratos() {
  const sesion = await paginaContratos('contratos.facturar')
  const hoy = hoyArgentina()
  const { puntos, dolar } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    puntos: await tx
      .select({ numero: puntosVenta.numero, nombre: puntosVenta.nombre })
      .from(puntosVenta)
      .where(and(eq(puntosVenta.activo, true), inArray(puntosVenta.tipo, ['electronico'])))
      .orderBy(puntosVenta.numero),
    dolar: await cotizacionVigente(tx, 'DOL', hoy),
  }))
  return (
    <>
      <EncabezadoPagina
        titulo="Facturar contratos"
        bajada="Calcula cada contrato con las lecturas del mes y deja las facturas en borrador para revisarlas y autorizarlas."
      />
      <Facturar
        periodo={periodoSugerido(hoy)}
        fecha={hoy}
        cotizacion={dolar?.valor ?? ''}
        puntosVenta={puntos.map((p) => ({ valor: p.numero, texto: `${String(p.numero).padStart(5, '0')} · ${p.nombre}` }))}
      />
    </>
  )
}
