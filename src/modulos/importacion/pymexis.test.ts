import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  cuentasTesoreria,
  depositos,
  empresas,
  listasPrecios,
  movimientosStock,
  percepcionesIibb,
  terceros,
  tercerosContactos,
} from '../../db/schema'
import { saldos } from '../comercial/stock'
import { cuentaProveedor } from '../compras/cuentas'
import { cuentaCorriente } from '../facturacion/cuentas'
import { preciosVigentes } from '../maestros/articulos'
import { importarPymexis, type Informe } from './pymexis'

/** Exportación de PYMEXIS inventada, con un caso de cada regla. */
const ARCHIVOS: Record<string, string> = {
  provincias: 'IdProvincia,Nombre,JURISDICCION\n"06","CHACO","906"\n"05","CORRIENTES","905"\n',
  rubros: 'IdRubro,Nombre\n"0001","INSUMOS"\n"0003","EQUIPOS COMERCIALIZADOS"\n"0005","SERVICIOS"\n',
  subrubros: 'IdSubRubro,Nombre\n"001","TONER"\n',
  marcas: 'IDMARCA,NOMBRE\n"999","SIN ASIGNAR"\n"002","RICOH"\n',
  vendedores: 'IdVendedor,Nombre,email,ComisionVta,ComisionCob\n"016","GARCIA","",1.5,0\n',
  zonas: 'IdZona,Nombre\n"01","CENTRO"\n"02","CENTRO"\n',
  transportes: 'IdTransporte,Nombre,Telefono,Cuit\n"003","KOMSA RETIRA","",""\n',
  depositos: 'IdDeposito,Nombre,Domicilio,INHABILITADO\n"001","CENTRAL","PERON 702","0"\n',
  condiciones_pago: 'IdForma,Nombre,cuotas,cdiames\n"01","Contado",0,0\n"03","Cuenta Corriente",,\n',
  puntos_venta:
    'IdPuntoVenta,Nombre,ESELECTRONICA,ESFACTURADECREDITO\n"00001","NO USAR","0","0"\n"00004","FACTURA ELECTRONICA","1","0"\n"00009","FCE","1","1"\n',
  listas:
    'IdLista,Nombre,CalculaPorc,DESDELISTA,PORCLISTA,FECHAVTO\n"002","LISTA","True","ZZZ",0.00,"2999-12-31"\n"007","TARJETA 03","False","002",30.00,"2999-12-31"\n"013","NARANJA Z","False","002",10.00,"2999-12-31"\n',
  clientes:
    'idcliente,nombre,Domicilio,Localidad,Cpostal,idprovincia,Telefonos,email,IdCondiva,Cuit,Documento,Ingbrutos,LiqIbrutos,IdZona,IdVendedor,IdTransporte,IdLista,IdForma,LimiteCredito,Descu1,inactivo,FechaIngreso,ultima_factura\n' +
    '"00001","ESTUDIO\nNORTE","PERON 1","RESISTENCIA","3500","06","","a@b.com; c@d.com","0","20-12345678-6","","","True","02","016","003","002","03",1000.5,0,"False","2020-01-01","2026-09-01"\n' +
    '"00214","CONSUMIDOR FINAL","","","","06","","","2","","","","False","","","","","01",0,0,"False","",""\n' +
    '"00300","CUIT MALO","","","","05","","","0","20-12345678-9","","","False","","","","","",0,0,"True","",""\n',
  // KOMSA percibe Corrientes: 0,75 % a los de Convenio, 1,5 % a los locales. Hay uno suelto en Chaco.
  clientes_iibb: 'IDCLIENTE,IDPROVINCIA,PORCENTAJE\n"00001","05",0.75\n"00300","05",1.50\n"00001","06",1.50\n',
  proveedores:
    'IdProveedor,nombre,domicilio,localidad,cpostal,idprovincia,telefonos,email,idcondiva,cuit,ingbrutos,Inactivo,Retieneg,Categoriag,Saldocc,saldoCCmonedaExtra,ultima_compra\n' +
    '"00010","ESTUDIO NORTE (PROV)","","","","06","","","0","20123456786","","False","True","2",0,0,""\n' +
    '"00011","DISTRIBUIDORA","","","","05","","","0","30-71999201-9","","False","True","1",710,100,""\n',
  cuentas_bancarias:
    'IdBanco,Nombre,Cuenta,ultimo_movimiento\n' +
    '"010","BANCO ICBC","CTA. CTE. 0517","2026-09-30"\n' +
    '"011","BANCO GALICIA U$S","C.E. 9750","2024-08-15"\n' +
    '"013","MERCADO PAGO","","2026-09-25"\n' +
    '"018","TARJETA VISA GALICIA","","2026-09-22"\n',
  categorias_ganancias:
    'IdCategoria,Nombre,Porcentaje,MinimoImponible,Regimen,MINIMORET\n' +
    '"1","Materiales",2.000,224000.00,"Enajenacion de Bienes Muebles y Bienes de Cambio",240.00\n' +
    '"2","Servicios",2.000,42700.00,"Locaciones de Obra/Servicios no ejecutados en relacion de dependencia",90.00\n',
  // Saldos abiertos: una factura en pesos, un pago a cuenta (crédito) y una factura en dólares.
  saldos_proveedores:
    'IdProveedor,fecha,IdTipoComp,LetraComp,Sucursal,Numero,Importe,Saldo,FechaVto,idmoneda,cotizacion,nTipo,idunico\n' +
    '"00011","2026-09-01",0,"A",3,77,1210.00,1210.00,"2026-10-01","001",1,0,501\n' +
    '"00011","2026-09-05",6,"X",0,12,-500.00,-500.00,,"001",1,0,502\n' +
    '"00011","2026-09-10",0,"A",3,78,100.00,100.00,,"002",1500,0,503\n',
  saldos_clientes:
    'IdCliente,fecha,IdTipoComp,LetraComp,Sucursal,Numero,Importe,Saldo,FechaVto,idmoneda,cotizacion,ntipo,IdUnico\n' +
    '"00001","2026-09-02",0,"A",4,9657,1000.00,1000.00,"2026-10-02","001",1,0,901\n' +
    '"00001","2026-09-20",6,"X",1,55,-200.00,-200.00,,"001",1,0,902\n',
  contactos: 'idcliente,contacto,telefono\n"00001","SOFIA","0362-1"\n',
  articulos:
    'IdArticulo,IdBarra,Nombre,IdRubro,IdSubRubro,IDMARCA,UniMedi,CodIva,InHabilitado,TieneSerie,Codigobarra,COSTO,idmoneda,StockMinimo,tipoarti,FechaAlta,ultimo_movimiento\n' +
    '"TN-1","","TONER NEGRO","0001","001","002","","900","False","","",40,"002",2,"0","",""\n' +
    '"TN-1","","TONER NEGRO REPETIDO","0001","","002","","901","False","","",0,"001",0,"0","",""\n' +
    '"SRV","","VISITA","0005","","999","","900","False","","",0,"001",0,"0","",""\n' +
    '"E1234","","MP 2014 SERIE E1234","0003","","002","","900","False","","",0,"002",0,"2","",""\n' +
    '"RARO","","ARTICULO RARO","0001","","","","031","False","","",0,"001",0,"0","",""\n' +
    '"TN-2","","TONER CIAN","0001","","002","","900","False","","",0,"002",0,"0","",""\n' +
    '"TN-3","","TONER AMARILLO","0001","","002","","900","False","","",0,"002",0,"0","",""\n' +
    '"EQ-105","","IMPRESORA AL 10,5","0003","","002","","901","False","","",0,"001",0,"0","",""\n',
  precios:
    'IdArticulo,IdBarra,IdLista,Precio,IvaIncluido,idmoneda\n' +
    '"TN-1","","002",100.00,"False","002"\n"TN-1","","007",130.00,"False","002"\n"TN-1","","013",500.00,"False","002"\n' +
    '"SRV","","002",50.00,"False","001"\n"SRV","","007",99.00,"False","001"\n"SRV","","013",55.00,"False","001"\n' +
    '"RARO","","002",10.00,"False","002"\n"RARO","","007",13.00,"False","002"\n"RARO","","013",900.00,"False","002"\n' +
    '"TN-2","","002",200.00,"False","002"\n"TN-2","","007",260.00,"False","002"\n"TN-2","","013",1.00,"False","002"\n' +
    '"TN-3","","002",300.00,"False","002"\n"TN-3","","007",390.00,"False","002"\n"TN-3","","013",2.00,"False","002"\n' +
    // Con IVA incluido y al 10,5 %: 110,50 y 143,65 son 100 y 130 netos.
    '"EQ-105","","002",110.50,"True","001"\n"EQ-105","","007",143.65,"True","001"\n"EQ-105","","013",3.00,"True","001"\n',
  // El 999 no está en la tabla de depósitos (pasa en KOMSA).
  stock: 'IdArticulo,IdDeposito,cantidad\n"TN-1","001",5\n"TN-2","999",-2\n',
}

let empresa: string
let carpeta: string
let informe: Informe
const USUARIO = '00000000-0000-4000-8000-000000000001'

beforeAll(async () => {
  carpeta = mkdtempSync(join(tmpdir(), 'pymexis-'))
  for (const [nombre, contenido] of Object.entries(ARCHIVOS)) writeFileSync(join(carpeta, `${nombre}.csv`), '﻿' + contenido)
  const db = await baseDePrueba()
  const [e] = await db
    .insert(empresas)
    .values({ razonSocial: 'KOMSA de prueba', cuit: '30715974823', condicionIva: 1 })
    .returning()
  empresa = e.id
  informe = await importarPymexis(carpeta, empresa, USUARIO, '2026-10-01')
  // Segunda corrida: no tiene que duplicar nada.
  informe = await importarPymexis(carpeta, empresa, USUARIO, '2026-10-01')
})

describe('importación de PYMEXIS', () => {
  it('deja afuera los equipos individuales y renombra el código repetido', async () => {
    const arts = await conEmpresa(empresa, (tx) => tx.select().from(articulos))
    expect(arts.map((a) => a.codigo).sort()).toEqual(['EQ-105', 'RARO', 'SRV', 'TN-1', 'TN-1-2', 'TN-2', 'TN-3'])
    expect(informe.cantidades.equiposNoImportados).toBe(1)
    expect(informe.avisos.some((a) => a.includes('"TN-1-2"'))).toBe(true)
    expect(informe.avisos.some((a) => a.includes('tasa de IVA "031"'))).toBe(true)
    const servicio = arts.find((a) => a.codigo === 'SRV')
    expect([servicio?.tipo, servicio?.llevaStock]).toEqual(['servicio', false])
  })

  it('arma listas derivadas con precios especiales y respeta la moneda de cada precio', async () => {
    const listas = await conEmpresa(empresa, (tx) => tx.select().from(listasPrecios))
    const tarjeta = listas.find((l) => l.codigo === '007')!
    const naranja = listas.find((l) => l.codigo === '013')!
    expect(tarjeta.listaBaseId).not.toBeNull()
    expect(naranja.listaBaseId).toBeNull()
    expect(informe.avisos.some((a) => a.includes('Lista 013'))).toBe(true)
    const precios = await conEmpresa(empresa, (tx) => preciosVigentes(tx, tarjeta.id))
    const arts = await conEmpresa(empresa, (tx) => tx.select().from(articulos))
    const de = (c: string) => precios.get(arts.find((a) => a.codigo === c)!.id)
    // 100 USD + 30 % = 130 (calculado); el servicio tenía 99 en vez de 65: precio especial.
    expect(de('TN-1')).toEqual({ precio: '130.00', moneda: 'DOL', especial: false })
    expect(de('SRV')).toEqual({ precio: '99.00', moneda: 'PES', especial: true })
  })

  it('saca el IVA con la alícuota del artículo y compara la derivada en neto', async () => {
    const listas = await conEmpresa(empresa, (tx) => tx.select().from(listasPrecios))
    const arts = await conEmpresa(empresa, (tx) => tx.select().from(articulos))
    const eq105 = arts.find((a) => a.codigo === 'EQ-105')!.id
    const base = await conEmpresa(empresa, (tx) => preciosVigentes(tx, listas.find((l) => l.codigo === '002')!.id))
    const tarjeta = await conEmpresa(empresa, (tx) => preciosVigentes(tx, listas.find((l) => l.codigo === '007')!.id))
    // 110,50 / 1,105 = 100 (con el 21 % fijo daba 91,32).
    expect(base.get(eq105)?.precio).toBe('100.00')
    // 100 neto + 30 % = 130: sigue a la lista base, no es precio especial.
    expect(tarjeta.get(eq105)).toEqual({ precio: '130.00', moneda: 'PES', especial: false })
  })

  it('une al proveedor con el cliente del mismo CUIT y no duplica en la segunda corrida', async () => {
    const ters = await conEmpresa(empresa, (tx) => tx.select().from(terceros))
    expect(ters).toHaveLength(4)
    const estudio = ters.find((x) => x.codigo === '00001')!
    expect([estudio.esCliente, estudio.esProveedor, estudio.razonSocial]).toEqual([true, true, 'ESTUDIO\nNORTE'])
    expect(estudio.email).toBe('a@b.com')
    expect(estudio.provincia).toBe('H')
    const malo = ters.find((x) => x.codigo === '00300')!
    expect([malo.tipoDocumento, malo.numeroDocumento, malo.activo]).toEqual([99, null, false])
    expect(ters.find((x) => x.codigo === 'P00011')?.esProveedor).toBe(true)
    const contactos = await conEmpresa(empresa, (tx) =>
      tx.select().from(tercerosContactos).where(eq(tercerosContactos.terceroId, estudio.id)),
    )
    expect(contactos).toHaveLength(1)
  })

  it('trae la alícuota de percepción de cada cliente y crea la percepción inactiva', async () => {
    const percs = await conEmpresa(empresa, (tx) => tx.select().from(percepcionesIibb))
    expect(percs).toHaveLength(1)
    expect([percs[0].nombre, percs[0].provincia, Number(percs[0].alicuota), percs[0].activa]).toEqual([
      'Percepción IIBB Corrientes',
      'W',
      1.5,
      false,
    ])
    const ters = await conEmpresa(empresa, (tx) => tx.select().from(terceros))
    const alicuota = (c: string) => Number(ters.find((x) => x.codigo === c)!.percepcionIibb)
    expect([alicuota('00001'), alicuota('00300'), alicuota('00214')]).toEqual([0.75, 1.5, 0])
    expect(informe.cantidades.clientesConPercepcion).toBe(2)
    expect(informe.avisos.some((a) => a.includes('Chaco, que el ERP no percibe'))).toBe(true)
  })

  it('carga el stock inicial una sola vez y después sincroniza con ajustes', async () => {
    const deps = await conEmpresa(empresa, (tx) => tx.select().from(depositos))
    expect(deps.find((d) => d.codigo === '999')?.nombre).toContain('sin nombre en PYMEXIS')
    expect(informe.avisos.some((a) => a.includes('999'))).toBe(true)
    // La segunda corrida del beforeAll no agregó nada.
    expect(informe.cantidades.movimientosDeStock).toBe(0)
    const arts = await conEmpresa(empresa, (tx) => tx.select().from(articulos))
    const id = (c: string) => arts.find((a) => a.codigo === c)!.id
    const saldo = async () =>
      new Map((await conEmpresa(empresa, (tx) => saldos(tx))).map((x) => [x.articuloId, Number(x.cantidad)]))
    expect((await saldo()).get(id('TN-1'))).toBe(5)
    expect((await saldo()).get(id('TN-2'))).toBe(-2)

    // En PYMEXIS se vendieron 2 TN-1 y se corrigió el TN-2.
    writeFileSync(join(carpeta, 'stock.csv'), 'IdArticulo,IdDeposito,cantidad\n"TN-1","001",3\n')
    const otra = await importarPymexis(carpeta, empresa, USUARIO, '2026-10-02')
    expect(otra.cantidades.movimientosDeStock).toBe(2)
    expect((await saldo()).get(id('TN-1'))).toBe(3)
    expect((await saldo()).get(id('TN-2'))).toBe(0)
    const movs = await conEmpresa(empresa, (tx) =>
      tx
        .select()
        .from(movimientosStock)
        .where(eq(movimientosStock.articuloId, id('TN-1'))),
    )
    expect(movs.map((m) => m.tipo).sort()).toEqual(['ajuste', 'inicial'])
  })
})

describe('cuentas de tesorería', () => {
  it('crea las cuentas bancarias con su tipo y moneda, y una caja', async () => {
    const cuentas = await conEmpresa(empresa, (tx) => tx.select().from(cuentasTesoreria))
    const de = (c: string) => cuentas.find((x) => x.codigo === c)
    expect([
      de('B010')?.tipo,
      de('B011')?.moneda,
      de('B011')?.activa,
      de('B013')?.tipo,
      de('B018')?.tipo,
      de('CAJA')?.tipo,
    ]).toEqual(['banco', 'DOL', false, 'billetera', 'tarjeta', 'caja'])
    expect(cuentas).toHaveLength(5)
  })
})

describe('retenciones y saldos iniciales', () => {
  it('asigna el régimen de Ganancias según la categoría de PYMEXIS', async () => {
    const ters = await conEmpresa(empresa, (tx) => tx.select().from(terceros))
    // El proveedor 00010 se fusionó con el cliente 00001 (mismo CUIT): el régimen queda en esa ficha.
    expect(ters.find((x) => x.codigo === '00001')?.regimenGanancias).toBe('94')
    expect(ters.find((x) => x.codigo === 'P00011')?.regimenGanancias).toBe('78')
    expect(ters.find((x) => x.codigo === '00214')?.regimenGanancias).toBeNull()
  })

  it('migra los comprobantes con saldo y se puede repetir sin duplicar', async () => {
    const correr = () => importarPymexis(carpeta, empresa, USUARIO, '2026-10-01', { saldos: true })
    const primera = await correr()
    expect([primera.cantidades.saldosProveedores, primera.cantidades.saldosClientes]).toEqual([3, 2])
    const segunda = await correr()
    expect(segunda.avisos.some((a) => a.includes('saldos de clientes ya se habían migrado'))).toBe(true)
    const ters = await conEmpresa(empresa, (tx) => tx.select().from(terceros))
    const prov = ters.find((x) => x.codigo === 'P00011')!.id
    const cc = await conEmpresa(empresa, (tx) => cuentaProveedor(tx, prov))
    expect(cc.cuentas.map((c) => [c.moneda, c.saldo])).toEqual([
      ['DOL', '100.00'],
      ['PES', '710.00'],
    ])
    const cliente = ters.find((x) => x.codigo === '00001')!.id
    const cuenta = await conEmpresa(empresa, (tx) => cuentaCorriente(tx, cliente))
    expect([cuenta.saldo, cuenta.pendientes.length, cuenta.aCuenta]).toEqual(['800.00', 1, '200.00'])
  })
})
