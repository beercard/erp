import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  depositos,
  empresas,
  padronIibb,
  percepcionesIibb,
  puntosVenta,
  remitos,
  retenciones,
  terceros,
} from '../../db/schema'
import { archivoCot, pedirCot, separarDomicilio } from '../comercial/cot'
import { emitirRemito } from '../comercial/remitos'
import { registrarMovimientos } from '../comercial/stock'
import { emitirPago, EsquemaPago, liquidarPago } from '../compras/pagos'
import { calcularComprobante } from '../facturacion/comprobantes'
import { actualizarDesdeArba, guardarConfiguracionArba, leerRespuestaAlicuotas, leerRespuestaCot, pedidoAlicuotas } from './arba'
import { alicuotasPadron, configurarRetencionIibb, importarPadron, leerRenglon, renglones } from './padronesIibb'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-solo-para-pruebas-000000000000'
const U = '00000000-0000-4000-8000-000000000001'
const CLIENTE = '30711222339'
const PROVEEDOR = '30999176522'
const AJENO = '20123456786'

describe('Padrones de IIBB', () => {
  it('lee los renglones de ARBA, AGIP y el formato genérico', () => {
    expect(leerRenglon('arba', `P;25092026;01102026;31102026;${CLIENTE};C;S;N;3,50;12;`)).toMatchObject({
      provincia: 'B',
      cuit: CLIENTE,
      desde: '2026-10-01',
      hasta: '2026-10-31',
      percepcion: '3.50',
      retencion: null,
      grupoPercepcion: '12',
    })
    expect(leerRenglon('arba', 'Régimen;Publicación;...')).toBeNull()
    expect(leerRenglon('agip', `25092026;01102026;31102026;${CLIENTE};C;S;N;2,00;1,50;5;6;ESTUDIO SUR`)).toMatchObject({
      provincia: 'C',
      percepcion: '2.00',
      retencion: '1.50',
    })
    expect(
      leerRenglon('generico', `${CLIENTE};1,2;0,8`, { provincia: 'S', desde: '2026-10-01', hasta: '2026-10-31' }),
    ).toMatchObject({ provincia: 'S', percepcion: '1.2', retencion: '0.8' })
    expect(leerRenglon('generico', `${CLIENTE};1,2`)).toBeNull()
  })

  it('separa en renglones un flujo que llega en pedazos', async () => {
    async function* trozos() {
      yield 'uno\r\ndo'
      yield 's\ntres'
    }
    const lista: string[] = []
    for await (const r of renglones(trozos())) lista.push(r)
    expect(lista).toEqual(['uno', 'dos', 'tres'])
  })

  it('separa calle y número de un domicilio escrito de corrido', () => {
    expect(separarDomicilio('Av. Mitre 1234 PB')).toEqual({ calle: 'Av. Mitre', numero: '1234', resto: 'PB' })
    expect(separarDomicilio('Ruta 8 km 50')).toMatchObject({ calle: 'Ruta', numero: '8' })
    expect(separarDomicilio('Sin número')).toEqual({ calle: 'Sin número', numero: '0', resto: '' })
  })

  it('una percepción con provincia toma la alícuota del padrón antes que la general', () => {
    const regla = {
      id: 'p1',
      empresaId: 'e',
      nombre: 'Percepción IIBB Buenos Aires',
      provincia: 'B',
      alicuota: '3',
      minimoBase: '0',
      soloLetraA: true,
      tributoArca: 7,
      activa: true,
      creado: new Date(),
      actualizado: new Date(),
    }
    const items = [{ cantidad: '1', precioUnitario: '1000', alicuotaIva: 5 }]
    const base = { alicuotaCliente: null, provinciaCliente: 'C', activas: [regla] }
    // Cliente de otra provincia, sin padrón: no se le percibe.
    expect(calcularComprobante('A', items, base).tributos).toEqual([])
    // En el padrón de ARBA con 1,5 %: se percibe aunque viva en otra provincia.
    expect(calcularComprobante('A', items, { ...base, padron: { B: { percepcion: '1.5' } } }).tributos[0]).toMatchObject({
      alicuota: '1.5000',
      importe: '15.00',
    })
    // La ficha del cliente manda sobre el padrón.
    expect(
      calcularComprobante('A', items, { ...base, alicuotaCliente: '0', padron: { B: { percepcion: '1.5' } } }).tributos,
    ).toEqual([])
  })
})

describe('Padrones, retención de IIBB, ARBA y COT con base de datos', () => {
  let empresa: string
  let proveedor: string
  let cliente: string
  let articulo: string
  let deposito: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: empresa }] = await db
      .insert(empresas)
      .values({
        razonSocial: 'Distribuidora S.A.',
        cuit: '30715974823',
        condicionIva: 1,
        domicilioFiscal: 'Av. Mitre 1234',
        localidad: 'Avellaneda',
        codigoPostal: '1870',
        provincia: 'B',
      })
      .returning()
    await en(async (tx) => {
      ;[{ id: cliente }, { id: proveedor }] = await tx
        .insert(terceros)
        .values([
          {
            codigo: 'C1',
            razonSocial: 'Estudio Sur',
            tipoDocumento: 80,
            numeroDocumento: CLIENTE,
            condicionIva: 1,
            domicilio: 'Calle 50 N° 742',
            localidad: 'La Plata',
            codigoPostal: '1900',
            provincia: 'B',
          },
          {
            codigo: 'P1',
            razonSocial: 'Insumos SRL',
            esCliente: false,
            esProveedor: true,
            tipoDocumento: 80,
            numeroDocumento: PROVEEDOR,
            condicionIva: 1,
          },
        ])
        .returning()
      ;[{ id: deposito }] = await tx.insert(depositos).values({ codigo: '01', nombre: 'Central' }).returning()
      ;[{ id: articulo }] = await tx
        .insert(articulos)
        .values({ codigo: 'R1', nombre: 'Resma A4', costo: '5000', codigoCot: '480256', unidadCot: 7 })
        .returning()
      await tx.insert(puntosVenta).values({ numero: 3, nombre: 'Remitos', tipo: 'manual' })
      await registrarMovimientos(tx, U, [{ articuloId: articulo, depositoId: deposito, cantidad: '100', tipo: 'inicial' }])
      await tx.insert(percepcionesIibb).values({ nombre: 'Percepción ARBA', provincia: 'B', alicuota: '3', activa: true })
    })
  })

  it('importa solo los CUIT propios y junta percepción y retención', async () => {
    const percepcion = [
      `P;25092026;01102026;31102026;${CLIENTE};C;S;N;1,75;3;`,
      `P;25092026;01102026;31102026;${AJENO};C;S;N;4,00;9;`,
      `P;25092026;01102026;31102026;${PROVEEDOR};C;S;N;0,50;1;`,
    ]
    expect(await importarPadron(empresa, 'arba', percepcion)).toMatchObject({ ok: true, leidos: 3, guardados: 2 })
    const retencion = [`R;25092026;01102026;31102026;${PROVEEDOR};C;S;N;2,00;4;`]
    expect(await importarPadron(empresa, 'arba', retencion)).toMatchObject({ ok: true, guardados: 1 })
    expect(await en((tx) => alicuotasPadron(tx, PROVEEDOR, '2026-10-15'))).toEqual({
      B: { percepcion: '0.5000', retencion: '2.0000' },
    })
    expect(await en((tx) => alicuotasPadron(tx, PROVEEDOR, '2026-11-01'))).toEqual({})
    expect(await importarPadron(empresa, 'agip', percepcion)).toMatchObject({ ok: false })
  })

  it('retiene IIBB al pagar con la alícuota del padrón y emite el certificado', async () => {
    expect(
      await en((tx) => configurarRetencionIibb(tx, { activa: true, provincia: null, minimo: '0', alicuotaGeneral: null })),
    ).toMatchObject({
      ok: false,
    })
    await en((tx) => configurarRetencionIibb(tx, { activa: true, provincia: 'B', minimo: '1000', alicuotaGeneral: null }))
    const entrada = { terceroId: proveedor, fecha: '2026-10-15', aCuenta: '121000' }
    const l = await en((tx) => liquidarPago(tx, EsquemaPago.parse(entrada)))
    expect(l).toMatchObject({
      ok: true,
      liquidacion: {
        retencionIibb: { provincia: 'B', base: '100000.00', alicuota: '2.0000', importe: '2000.00', delPadron: true },
        aPagar: '119000.00',
      },
    })
    const r = await en((tx) => emitirPago(tx, U, { ...entrada, valores: [{ medio: 'transferencia', importe: '119000' }] }))
    expect(r).toMatchObject({ ok: true })
    const [ret] = await en((tx) => tx.select().from(retenciones))
    expect(ret).toMatchObject({ impuesto: 'iibb', regimen: 'B', numero: 1, importe: '2000.00' })
    // Fuera de la vigencia del padrón y sin alícuota general: no se retiene.
    const fuera = await en((tx) => liquidarPago(tx, EsquemaPago.parse({ ...entrada, fecha: '2026-11-02' })))
    expect(fuera).toMatchObject({ ok: true, liquidacion: { retencionIibb: null } })
  })

  it('consulta las alícuotas a ARBA con usuario, CIT y archivo, y las guarda', async () => {
    expect(pedidoAlicuotas([CLIENTE], '2026-10-01', '2026-10-31')).toContain(
      `<fechaDesde>20261001</fechaDesde><fechaHasta>20261031</fechaHasta><cantidadContribuyentes>1</cantidadContribuyentes>`,
    )
    expect(
      leerRespuestaAlicuotas(
        '<DFEError><codigoError>2</codigoError><mensajeError>Clave incorrecta</mensajeError></DFEError>',
        '',
        '',
      ),
    ).toEqual({
      error: '2: Clave incorrecta',
    })
    expect(
      await actualizarDesdeArba(empresa, '2026-10-03', [CLIENTE], (async () => new Response('')) as typeof fetch),
    ).toMatchObject({
      ok: false,
    })
    expect(
      await en((tx) => guardarConfiguracionArba(tx, { usuario: '30-71597482-3', cit: 'secreta', ambiente: 'prueba' })),
    ).toEqual({
      ok: true,
    })
    const pedidos: { url: string; user: string; password: string; nombre: string; xml: string }[] = []
    const f = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData
      const archivo = form.get('file') as File
      pedidos.push({
        url,
        user: String(form.get('user')),
        password: String(form.get('password')),
        nombre: archivo.name,
        xml: await archivo.text(),
      })
      return new Response(
        `<CONSULTA-ALICUOTA-RTA><contribuyentes class="list"><contribuyente><cuitContribuyente>${CLIENTE}</cuitContribuyente><alicuotaPercepcion>2,25</alicuotaPercepcion><alicuotaRetencion>1,00</alicuotaRetencion><grupoPercepcion>5</grupoPercepcion><grupoRetencion>6</grupoRetencion></contribuyente></contribuyentes></CONSULTA-ALICUOTA-RTA>`,
      )
    }) as unknown as typeof fetch
    expect(await actualizarDesdeArba(empresa, '2026-10-03', undefined, f)).toEqual({
      ok: true,
      guardados: 1,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    expect(pedidos[0]).toMatchObject({
      url: expect.stringContaining('dfe.test.arba.gov.ar'),
      user: '30715974823',
      password: 'secreta',
    })
    expect(pedidos[0].nombre).toMatch(/^DFEServicioConsulta_[0-9a-f]{32}\.xml$/)
    expect(pedidos[0].xml).toContain(`<cuitContribuyente>${CLIENTE}</cuitContribuyente>`)
    // La consulta reemplaza lo del archivo para la misma vigencia.
    expect(await en((tx) => alicuotasPadron(tx, CLIENTE, '2026-10-15'))).toEqual({
      B: { percepcion: '2.2500', retencion: '1.0000' },
    })
    const [fila] = await en((tx) => tx.select().from(padronIibb).where(eq(padronIibb.cuit, CLIENTE)))
    expect(fila.origen).toBe('servicio')
  })

  it('arma el archivo del COT y guarda el código que devuelve ARBA', async () => {
    const r = await en((tx) =>
      emitirRemito(tx, U, {
        puntoVenta: 3,
        terceroId: cliente,
        depositoId: deposito,
        fecha: '2026-10-03',
        items: [{ articuloId: articulo, descripcion: 'Resma A4', cantidad: '10' }],
      }),
    )
    if (!r.ok) throw new Error(r.error)
    let archivo = { nombre: '', contenido: '' }
    const f = (async (_: string, init: RequestInit) => {
      const a = (init.body as FormData).get('file') as File
      archivo = { nombre: a.name, contenido: Buffer.from(await a.arrayBuffer()).toString('latin1') }
      return new Response(
        '<TBCOT><cuitEmpresa>30715974823</cuitEmpresa><codigoIntegridad>abc123</codigoIntegridad><validacionesRemitos class="list"><remito><numeroUnico>091R000300000001</numeroUnico><procesado>SI</procesado><cot>1234567890123456</cot></remito></validacionesRemitos></TBCOT>',
      )
    }) as unknown as typeof fetch
    expect(await pedirCot(empresa, r.id, { patente: 'aa 123 bb', salida: '2026-10-04', hora: '07:30' }, '2026-10-03', f)).toEqual(
      {
        ok: true,
        cot: '1234567890123456',
      },
    )
    expect(archivo.nombre).toBe('TB_30715974823_000000_000_20261003_000001.txt')
    const lineas = archivo.contenido.split('\r\n')
    expect(lineas[0]).toBe('01|30715974823')
    const remito = lineas[1].split('|')
    expect(remito.slice(0, 7)).toEqual(['02', '20261003', '091R000300000001', '20261004', '0730', 'E', '0'])
    expect(remito[9]).toBe(CLIENTE)
    expect(remito[12]).toBe('Calle')
    expect(remito[13]).toBe('50')
    expect(remito.at(-1)).toBe('5000000') // 10 × $ 5.000, sin coma
    expect(remito.at(-4)).toBe('AA123BB')
    expect(lineas[2]).toBe('03|480256|7|1000|R1|Resma A4|unidad|1000')
    expect(lineas[3]).toBe('04|1')
    const [guardado] = await en((tx) => tx.select().from(remitos).where(eq(remitos.id, r.id)))
    expect(guardado).toMatchObject({ cot: '1234567890123456', cotIntegridad: 'abc123', patente: 'AA123BB' })
    // Ya tiene COT: no se pide de nuevo.
    expect(await pedirCot(empresa, r.id, {}, '2026-10-03', f)).toMatchObject({ ok: false })
  })

  it('informa los rechazos de ARBA', () => {
    expect(
      leerRespuestaCot(
        '<TBCOT><validacionesRemitos class="list"><remito><procesado>NO</procesado><errores class="list"><error><codigo>21</codigo><descripcion>Patente inválida</descripcion></error></errores></remito></validacionesRemitos></TBCOT>',
      ),
    ).toEqual({ ok: false, error: 'ARBA rechazó el remito: 21: Patente inválida' })
    expect(
      leerRespuestaCot('<TBError><tipoError>1</tipoError><codigo>5</codigo><mensaje>Usuario inexistente</mensaje></TBError>'),
    ).toEqual({
      ok: false,
      error: 'ARBA: 5: Usuario inexistente',
    })
    expect(archivoCot).toBeTypeOf('function')
  })
})
