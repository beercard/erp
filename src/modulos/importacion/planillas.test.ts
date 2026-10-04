import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  compras,
  comprobantes,
  depositos,
  empresas,
  listasPrecios,
  marcas,
  precios,
  rubros,
  terceros,
  usuarios,
} from '../../db/schema'
import { leerCsv } from '../../lib/csv'
import { saldoDe } from '../comercial/stock'
import { cuentaCorriente } from '../facturacion/cuentas'
import { importarArticulos, importarSaldos, importarTerceros, leerArticulos, leerSaldos, leerTerceros } from './planillas'

let empresa: string
let U: string
let deposito: string
const stock = (articuloId: string) => en((tx) => saldoDe(tx, articuloId, deposito))
const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

beforeAll(async () => {
  const db = await baseDePrueba()
  ;[{ id: empresa }] = await db
    .insert(empresas)
    .values({ razonSocial: 'Arranque S.A.', cuit: '30111111118', condicionIva: 1 })
    .returning()
  ;[{ id: U }] = await db.insert(usuarios).values({ email: 'admin@arranque.com', nombre: 'Admin', hashClave: 'x' }).returning()
  await en(async (tx) => {
    ;[{ id: deposito }] = await tx.insert(depositos).values({ codigo: '001', nombre: 'Central' }).returning()
    await tx.insert(listasPrecios).values({ codigo: '001', nombre: 'General', moneda: 'PES' })
  })
})

describe('importar clientes y proveedores', () => {
  const csv = [
    'Razón social;CUIT;Condición IVA;Tipo;Email;Provincia',
    'Clínica del Litoral S.A.;30-99917652-2;RI;cliente;pagos@clinica.com.ar;Santa Fe',
    'Insumos Norte SRL;30715974823;Responsable Inscripto;proveedor;;',
    'Lucía Pérez;27333444;Consumidor final;;;',
    'Mal CUIT;30999176523;RI;;;',
    'Sin nombre;;;;;',
  ].join('\n')

  it('valida fila por fila y da de alta lo válido', async () => {
    const l = leerTerceros(leerCsv(csv, ';'))
    expect(l.filas).toHaveLength(4)
    expect(l.errores).toEqual([{ fila: 5, error: 'El CUIT 30999176523 no es válido (revisá el dígito verificador).' }])
    const r = await en((tx) => importarTerceros(tx, U, l))
    expect(r).toMatchObject({ altas: 4, actualizados: 0 })
    expect(r.errores.map((e) => e.fila)).toEqual([5])
    const t = await en((tx) => tx.select().from(terceros))
    const clinica = t.find((x) => x.numeroDocumento === '30999176522')!
    expect(clinica).toMatchObject({
      condicionIva: 1,
      esCliente: true,
      email: 'pagos@clinica.com.ar',
      tipoDocumento: 80,
      provincia: 'S',
    })
    expect(t.find((x) => x.numeroDocumento === '30715974823')).toMatchObject({ esProveedor: true, esCliente: false })
    expect(t.find((x) => x.numeroDocumento === '27333444')).toMatchObject({ tipoDocumento: 96, condicionIva: 5 })
  })

  it('la misma planilla otra vez actualiza en lugar de duplicar, y conserva lo que viene vacío', async () => {
    const otra = 'Razón social;CUIT;Teléfono\nClínica del Litoral SA;30999176522;0342-4000000'
    const r = await en((tx) => importarTerceros(tx, U, leerTerceros(leerCsv(otra, ';'))))
    expect(r).toMatchObject({ altas: 0, actualizados: 1, errores: [] })
    const [c] = await en((tx) => tx.select().from(terceros).where(eq(terceros.numeroDocumento, '30999176522')))
    expect(c).toMatchObject({ razonSocial: 'Clínica del Litoral SA', telefono: '0342-4000000', email: 'pagos@clinica.com.ar' })
  })
})

describe('importar artículos', () => {
  it('da de alta con rubro, marca, precio de la lista general y stock inicial', async () => {
    const csv = [
      'Código;Nombre;Tipo;IVA;Costo;Precio;Rubro;Marca;Stock',
      'TN-1;Tóner negro;producto;21;10.000,50;15000;Insumos;Acme;12',
      'SV-1;Visita técnica;servicio;21;;25000;Servicios;;5',
      'X-1;Algo;producto;19;;;;;',
    ].join('\n')
    const l = leerArticulos(leerCsv(csv, ';'))
    expect(l.errores).toEqual([{ fila: 4, error: 'IVA 19 %: va 0, 2.5, 5, 10.5, 21 o 27.' }])
    const r = await en((tx) => importarArticulos(tx, U, l, '2026-10-04'))
    expect(r).toMatchObject({ altas: 2, actualizados: 0 })
    const [toner] = await en((tx) => tx.select().from(articulos).where(eq(articulos.codigo, 'TN-1')))
    expect(toner).toMatchObject({ alicuotaIva: 5, costo: '10000.5000', llevaStock: true })
    const [visita] = await en((tx) => tx.select().from(articulos).where(eq(articulos.codigo, 'SV-1')))
    expect(visita.llevaStock).toBe(false)
    expect(await en((tx) => tx.select({ nombre: rubros.nombre }).from(rubros))).toHaveLength(2)
    expect((await en((tx) => tx.select().from(marcas)))[0].nombre).toBe('Acme')
    const [p] = await en((tx) => tx.select().from(precios).where(eq(precios.articuloId, toner.id)))
    expect(p).toMatchObject({ precio: '15000.0000', vigenteDesde: '2026-10-04' })
    expect(await stock(toner.id)).toBe('12.0000')
  })

  it('reimportar actualiza el nombre y el precio, sin volver a sumar stock', async () => {
    const r = await en((tx) =>
      importarArticulos(
        tx,
        U,
        leerArticulos(leerCsv('codigo;nombre;precio;stock\nTN-1;Tóner negro XL;16000;12', ';')),
        '2026-10-05',
      ),
    )
    expect(r).toMatchObject({ altas: 0, actualizados: 1, errores: [] })
    const [toner] = await en((tx) => tx.select().from(articulos).where(eq(articulos.codigo, 'TN-1')))
    expect(toner.nombre).toBe('Tóner negro XL')
    expect(await en((tx) => tx.select().from(precios).where(eq(precios.articuloId, toner.id)))).toHaveLength(2)
    expect(await stock(toner.id)).toBe('12.0000')
  })
})

describe('importar saldos iniciales', () => {
  it('carga deudas y créditos como saldo inicial, una sola vez por tercero', async () => {
    const csv = [
      'CUIT;Cuenta;Saldo;Fecha;Vencimiento;Detalle',
      '30999176522;cliente;125.000,50;30/09/2026;15/10/2026;Facturas de septiembre',
      '27333444;cliente;-3000;30/09/2026;;Pago a cuenta',
      '30715974823;proveedor;80000;30/09/2026;;',
      '20111111112;cliente;100;;;',
    ].join('\n')
    const r = await en((tx) => importarSaldos(tx, U, leerSaldos(leerCsv(csv, ';')), '2026-10-04'))
    expect(r.altas).toBe(3)
    expect(r.errores).toEqual([{ fila: 5, error: 'No hay un cliente con documento 20111111112: importalo primero.' }])

    const [clinica] = await en((tx) => tx.select().from(terceros).where(eq(terceros.numeroDocumento, '30999176522')))
    const cc = await en((tx) => cuentaCorriente(tx, clinica.id))
    expect(cc.saldo).toBe('125000.50')
    const ventas = await en((tx) => tx.select().from(comprobantes))
    expect(ventas.map((v) => [v.clase, v.letra, v.tipo, v.total, v.origen]).sort()).toEqual([
      ['factura', 'X', 0, '125000.50', 'planilla'],
      ['nota_credito', 'X', 0, '3000.00', 'planilla'],
    ])
    const [compra] = await en((tx) => tx.select().from(compras))
    expect(compra).toMatchObject({ clase: 'factura', total: '80000.00', origen: 'planilla', periodoIva: '2026-09' })

    // Repetir la planilla no duplica la deuda.
    const otra = await en((tx) => importarSaldos(tx, U, leerSaldos(leerCsv(csv, ';')), '2026-10-04'))
    expect(otra.altas).toBe(0)
    expect(otra.errores.filter((e) => e.error.includes('ya tiene un saldo inicial'))).toHaveLength(3)
  })
})
