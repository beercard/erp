import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  canalesVenta,
  comprobantes,
  cuentasTesoreria,
  depositos,
  empresas,
  movimientosStock,
  pedidosCanal,
  puntosVenta,
  recibos,
  remitos,
} from '../../db/schema'
import type { ClienteArca } from '../arca/cliente'
import { saldoCuenta } from '../tesoreria/cuentas'
import { conectarCanal } from './canales'
import { facturarPedidosPagados } from './facturar'
import { importarPedido } from './sincronizar'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-solo-para-pruebas-000000000000'

const U = '00000000-0000-4000-8000-000000000001'

/** ARCA de mentira: autoriza todo. */
const arca: ClienteArca = {
  ambiente: 'homologacion',
  ultimoAutorizado: async () => 0,
  solicitarCae: async () => ({ resultado: 'A', cae: '76400000000001', caeVence: '2026-10-13', observaciones: [], errores: [] }),
  consultar: async () => null,
}

describe('Pedidos de tiendas que se facturan solos', () => {
  let empresa: string
  let canalId: string
  let billetera: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: empresa }] = await db
      .insert(empresas)
      .values({ razonSocial: 'Tienda S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    await en(async (tx) => {
      const [toner] = await tx.insert(articulos).values({ codigo: 'TON-1', nombre: 'Tóner', alicuotaIva: 5 }).returning()
      const [dep] = await tx.insert(depositos).values({ codigo: '001', nombre: 'Central' }).returning()
      await tx.insert(movimientosStock).values({ articuloId: toner.id, depositoId: dep.id, cantidad: '10', tipo: 'ajuste' })
      await tx.insert(puntosVenta).values({ numero: 7, nombre: 'Web', tipo: 'electronico' })
      ;[{ id: billetera }] = await tx
        .insert(cuentasTesoreria)
        .values({ codigo: 'MP', nombre: 'Mercado Pago', tipo: 'billetera' })
        .returning()
      const r = await conectarCanal(tx, U, {
        tipo: 'tiendanube',
        nombre: 'Web',
        cuenta: '9',
        credenciales: { acceso: 't', tienda: '9' },
      })
      if (!r.ok) throw new Error(r.error)
      canalId = r.id
      await tx
        .update(canalesVenta)
        .set({ depositoId: dep.id, facturarSolo: true, cuentaCobroId: billetera })
        .where(eq(canalesVenta.id, canalId))
    })
  })

  it('el pedido pagado se remite, se factura en ARCA y se cobra en la cuenta de la tienda; una sola vez', async () => {
    const importado = await en(async (tx) => {
      const [canal] = await tx.select().from(canalesVenta).where(eq(canalesVenta.id, canalId))
      return importarPedido(tx, canal, {
        externoId: '5001',
        numero: '5001',
        fecha: new Date('2026-10-03T13:00:00Z'),
        estado: 'pagado',
        moneda: 'ARS',
        total: 24200,
        comprador: { nombre: 'Lucía Pérez', email: 'lucia@ejemplo.com', documento: '27333444', telefono: null },
        items: [{ externoId: 'P1', varianteId: '', sku: 'TON-1', titulo: 'Tóner', cantidad: 2, precioUnitario: 12100 }],
      })
    })
    expect(importado).toBe('importado')

    const r = await facturarPedidosPagados(empresa, async () => arca, 20, '2026-10-03')
    expect(r).toEqual({ facturados: 1, errores: 0 })
    const [f] = await en((tx) => tx.select().from(comprobantes))
    expect(f).toMatchObject({ estado: 'autorizado', clase: 'factura', puntoVenta: 7, total: '24200.00' })
    expect(await en((tx) => tx.select().from(remitos))).toHaveLength(1)
    const [rec] = await en((tx) => tx.select().from(recibos))
    expect(rec.total).toBe('24200.00')
    expect(await en((tx) => saldoCuenta(tx, billetera))).toBe('24200.00')
    const [pc] = await en((tx) => tx.select().from(pedidosCanal))
    expect(pc.detalle).toContain('remitido, facturado')

    // No se factura dos veces.
    expect(await facturarPedidosPagados(empresa, async () => arca, 20, '2026-10-03')).toEqual({ facturados: 0, errores: 0 })
  })
})
