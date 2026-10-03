/**
 * Datos de DEMOSTRACIÓN para desarrollar: una empresa ficticia con maestros
 * de ejemplo y un usuario administrador. Todo es inventado (los CUIT tienen
 * dígito verificador válido pero no corresponden a nadie).
 *
 *   npm run db:semilla
 *
 * El usuario sale de SEMILLA_EMAIL (por defecto admin@demo.local). La clave,
 * de SEMILLA_CLAVE o, si no está, se genera y se guarda en
 * .data/credenciales-dev.txt (fuera de git). Se puede correr varias veces:
 * si la empresa demo ya existe no hace nada.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

import { eq } from 'drizzle-orm'

import { db } from '../src/db/conexion'
import { conEmpresa } from '../src/db/empresa'
import { migrar } from '../src/db/migrar'
import * as t from '../src/db/schema'
import { hashearClave } from '../src/lib/auth/clave'
import { digitoVerificador } from '../src/lib/cuit'

/** CUIT ficticio con verificador válido a partir de prefijo + 8 dígitos. */
function cuit(prefijo: string, numero: string): string {
  for (const p of [prefijo, prefijo === '30' ? '33' : '23']) {
    const v = digitoVerificador(p + numero)
    if (v !== null) return `${p}${numero}${v}`
  }
  throw new Error(`Sin CUIT válido para ${numero}`)
}

const base = db()
await migrar(base)

const CUIT_DEMO = cuit('30', '71999001')
const [existente] = await base.select().from(t.empresas).where(eq(t.empresas.cuit, CUIT_DEMO))
if (existente) {
  console.log('La empresa demo ya existe: no se cargó nada.')
  process.exit(0)
}

const [empresa] = await base
  .insert(t.empresas)
  .values({
    razonSocial: 'Empresa Demo S.A.',
    nombreFantasia: 'Demo',
    cuit: CUIT_DEMO,
    condicionIva: 1,
    iibbRegimen: 'convenio',
    iibbNumero: '901-000001-0',
    inicioActividades: '2015-03-01',
    domicilioFiscal: 'Av. Siempre Viva 742',
    localidad: 'Resistencia',
    codigoPostal: '3500',
    provincia: 'H',
  })
  .returning()
// La demo tiene todo: plan Empresa con la aplicación de contratos.
await base
  .insert(t.suscripciones)
  .values({ empresaId: empresa.id, plan: 'empresa', estado: 'activa', aplicaciones: ['contratos', 'tienda'] })

const email = process.env.SEMILLA_EMAIL ?? 'admin@demo.local'
const clave = process.env.SEMILLA_CLAVE ?? `${randomBytes(9).toString('base64url')}-${randomBytes(2).readUInt16BE()}`
const [rolDueno] = await base.select().from(t.roles).where(eq(t.roles.nombre, 'Dueño'))
const [usuario] = await base
  .insert(t.usuarios)
  // En desarrollo, el usuario demo también administra la plataforma.
  .values({ email, nombre: 'Administrador Demo', hashClave: await hashearClave(clave), adminPlataforma: true })
  .onConflictDoNothing()
  .returning()
const usuarioId = usuario?.id ?? (await base.select().from(t.usuarios).where(eq(t.usuarios.email, email)))[0].id
await base.insert(t.membresias).values({ usuarioId, empresaId: empresa.id, rolId: rolDueno.id })

await conEmpresa(empresa.id, async (tx) => {
  const [central, salon] = await tx
    .insert(t.depositos)
    .values([
      { codigo: '001', nombre: 'Depósito central', domicilio: 'Av. Siempre Viva 742' },
      { codigo: '002', nombre: 'Salón de ventas' },
    ])
    .returning()
  await tx.insert(t.puntosVenta).values([
    { numero: 4, nombre: 'Factura electrónica', tipo: 'electronico', depositoId: central.id },
    { numero: 9, nombre: 'Factura de crédito electrónica MiPyME', tipo: 'fce', depositoId: central.id },
    { numero: 6, nombre: 'Remitos', tipo: 'remitos', depositoId: salon.id },
  ])
  const [contado, cc30] = await tx
    .insert(t.condicionesPago)
    .values([
      { nombre: 'Contado', dias: 0 },
      { nombre: 'Cuenta corriente 30 días', dias: 30 },
      { nombre: 'Tres cuotas', dias: 30, cuotas: 3 },
    ])
    .returning()
  const [zonaCentro] = await tx
    .insert(t.zonas)
    .values([{ nombre: 'Centro' }, { nombre: 'Interior' }])
    .returning()
  const [transporte] = await tx
    .insert(t.transportes)
    .values([{ nombre: 'Retira en el local' }, { nombre: 'Correo Argentino' }])
    .returning()
  const [vendedor1] = await tx
    .insert(t.vendedores)
    .values([
      { codigo: '01', nombre: 'Laura Vendedora', comisionVenta: '3', comisionCobranza: '1' },
      { codigo: '02', nombre: 'Martín Vendedor', comisionVenta: '2.5', comisionCobranza: '1' },
    ])
    .returning()

  const [base_, , dolares] = await tx
    .insert(t.listasPrecios)
    .values([
      { codigo: '001', nombre: 'Lista general', moneda: 'PES' },
      { codigo: '002', nombre: 'Gremio', moneda: 'PES' },
      { codigo: '003', nombre: 'Dólares', moneda: 'DOL' },
    ])
    .returning()
  await tx.insert(t.listasPrecios).values([
    { codigo: '004', nombre: 'Tarjeta 3 cuotas', listaBaseId: base_.id, porcentaje: '30' },
    { codigo: '005', nombre: 'Cheque a 30 días', listaBaseId: base_.id, porcentaje: '5' },
  ])

  const [insumos, equipos, servicios] = await tx
    .insert(t.rubros)
    .values([{ nombre: 'Insumos' }, { nombre: 'Equipos' }, { nombre: 'Servicios' }])
    .returning()
  const [toner] = await tx.insert(t.rubros).values({ nombre: 'Tóner', padreId: insumos.id }).returning()
  const [marcaA, marcaB] = await tx
    .insert(t.marcas)
    .values([{ nombre: 'Ricoh' }, { nombre: 'Epson' }, { nombre: 'HP' }])
    .returning()

  const articulos = await tx
    .insert(t.articulos)
    .values([
      {
        codigo: 'TN-1001',
        nombre: 'Tóner negro alto rendimiento',
        rubroId: toner.id,
        marcaId: marcaA.id,
        costo: '42000',
        stockMinimo: '5',
      },
      { codigo: 'TN-1002', nombre: 'Tóner cian', rubroId: toner.id, marcaId: marcaA.id, costo: '51000', stockMinimo: '3' },
      {
        codigo: 'TI-2001',
        nombre: 'Botella de tinta negra 70 ml',
        rubroId: insumos.id,
        marcaId: marcaB.id,
        costo: '9800',
        stockMinimo: '10',
      },
      {
        codigo: 'EQ-3001',
        nombre: 'Multifunción láser A4 color',
        tipo: 'producto',
        rubroId: equipos.id,
        marcaId: marcaA.id,
        costo: '1450',
        monedaCosto: 'DOL',
        llevaSerie: true,
      },
      {
        codigo: 'EQ-3002',
        nombre: 'Impresora de tinta continua A3',
        rubroId: equipos.id,
        marcaId: marcaB.id,
        costo: '980',
        monedaCosto: 'DOL',
        llevaSerie: true,
      },
      { codigo: 'SV-9001', nombre: 'Visita técnica', tipo: 'servicio', rubroId: servicios.id, llevaStock: false, alicuotaIva: 5 },
      { codigo: 'SV-9002', nombre: 'Abono mensual de mantenimiento', tipo: 'servicio', rubroId: servicios.id, llevaStock: false },
    ])
    .returning()
  const precioDe: Record<string, string> = {
    'TN-1001': '68500',
    'TN-1002': '82000',
    'TI-2001': '15900',
    'SV-9001': '45000',
    'SV-9002': '120000',
  }
  await tx
    .insert(t.precios)
    .values(
      articulos
        .filter((a) => precioDe[a.codigo])
        .map((a) => ({ listaId: base_.id, articuloId: a.id, precio: precioDe[a.codigo] })),
    )
  await tx
    .insert(t.precios)
    .values(
      articulos
        .filter((a) => a.monedaCosto === 'DOL')
        .map((a) => ({ listaId: dolares.id, articuloId: a.id, precio: String(Math.round(Number(a.costo) * 1.35)) })),
    )

  const terceros = await tx
    .insert(t.terceros)
    .values([
      {
        codigo: '00001',
        razonSocial: 'Estudio Contable Norte S.R.L.',
        tipoDocumento: 80,
        numeroDocumento: cuit('30', '71999101'),
        condicionIva: 1,
        email: 'admin@estudionorte.example',
        provincia: 'H',
        localidad: 'Resistencia',
        condicionPagoId: cc30.id,
        vendedorId: vendedor1.id,
        zonaId: zonaCentro.id,
        listaPreciosId: base_.id,
      },
      {
        codigo: '00002',
        razonSocial: 'Colegio San Martín',
        tipoDocumento: 80,
        numeroDocumento: cuit('30', '71999102'),
        condicionIva: 4,
        provincia: 'H',
        localidad: 'Resistencia',
        condicionPagoId: cc30.id,
      },
      {
        codigo: '00003',
        razonSocial: 'Gómez, Carla',
        tipoDocumento: 80,
        numeroDocumento: cuit('27', '30111222'),
        condicionIva: 6,
        provincia: 'W',
        localidad: 'Corrientes',
        condicionPagoId: contado.id,
      },
      {
        codigo: '00004',
        razonSocial: 'Consumidor final',
        tipoDocumento: 99,
        condicionIva: 5,
        condicionPagoId: contado.id,
        transporteId: transporte.id,
      },
      {
        codigo: '00005',
        razonSocial: 'Clínica del Litoral S.A.',
        tipoDocumento: 80,
        numeroDocumento: cuit('30', '71999105'),
        condicionIva: 1,
        provincia: 'H',
        localidad: 'Resistencia',
        condicionPagoId: cc30.id,
        limiteCredito: '2500000',
      },
      {
        codigo: 'P0001',
        razonSocial: 'Distribuidora Mayorista Insumos S.A.',
        esCliente: false,
        esProveedor: true,
        tipoDocumento: 80,
        numeroDocumento: cuit('30', '71999201'),
        condicionIva: 1,
        provincia: 'C',
        localidad: 'CABA',
      },
      {
        codigo: 'P0002',
        razonSocial: 'Logística Rápida S.R.L.',
        esCliente: false,
        esProveedor: true,
        tipoDocumento: 80,
        numeroDocumento: cuit('30', '71999202'),
        condicionIva: 1,
        provincia: 'H',
      },
    ])
    .returning()
  await tx.insert(t.tercerosContactos).values([
    { terceroId: terceros[0].id, nombre: 'Sofía Paredes', cargo: 'Administración', email: 'sofia@estudionorte.example' },
    { terceroId: terceros[4].id, nombre: 'Jorge Ibáñez', cargo: 'Compras', telefono: '0362 400-0000' },
  ])
})

mkdirSync('.data', { recursive: true })
if (!process.env.SEMILLA_CLAVE) {
  writeFileSync('.data/credenciales-dev.txt', `Usuario: ${email}\nClave: ${clave}\n`, { mode: 0o600 })
}
console.log(`Empresa demo creada. Usuario: ${email}. La clave está en .data/credenciales-dev.txt (fuera de git).`)
process.exit(0)
