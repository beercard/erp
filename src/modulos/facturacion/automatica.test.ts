import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { comoPlataforma, conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  comprobantes,
  comprobantesItems,
  correos,
  empresas,
  facturasRecurrentes,
  facturasSuscripcion,
  membresias,
  puntosVenta,
  roles,
  suscripciones,
  terceros,
  usuarios,
} from '../../db/schema'
import type { ClienteArca } from '../arca/cliente'
import { emitirFacturasSuscripcion } from '../plataforma/facturasSuscripcion'
import { registrarPago } from '../plataforma/suscripciones'
import {
  alicuotaDesdeTexto,
  avanzarLote,
  clientePorDocumento,
  conPeriodo,
  crearLote,
  detalleLote,
  facturarRecurrentes,
  guardarRecurrente,
  sumarMeses,
} from './automatica'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-solo-para-pruebas-000000000000'

let ultimo = 0
/** ARCA de mentira: autoriza todo, con un número que no se repite. */
const arca: ClienteArca = {
  ambiente: 'homologacion',
  ultimoAutorizado: async () => ultimo,
  solicitarCae: async () => ({
    resultado: 'A',
    cae: String(76400000000000 + ++ultimo),
    caeVence: '2026-10-13',
    observaciones: [],
    errores: [],
  }),
  consultar: async () => null,
}
const crearCliente = async () => arca

describe('utilidades', () => {
  it('convierte el porcentaje de IVA al código de ARCA', () => {
    expect(alicuotaDesdeTexto('21')).toBe(5)
    expect(alicuotaDesdeTexto('10,5%')).toBe(4)
    expect(alicuotaDesdeTexto(0)).toBe(3)
    expect(alicuotaDesdeTexto('19')).toBeNull()
  })
  it('pone el período en la descripción y suma meses', () => {
    expect(conPeriodo('Abono {periodo}', '2026-10-01')).toBe('Abono octubre 2026')
    expect(sumarMeses('2026-11-15', 3)).toBe('2027-02-15')
  })
})

describe('facturación automática', () => {
  let empresa: string
  let cliente: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: empresa }] = await db
      .insert(empresas)
      .values({ razonSocial: 'Servicios del Sur S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    await en(async (tx) => {
      await tx.insert(puntosVenta).values({ numero: 3, nombre: 'Web', tipo: 'electronico' })
      ;[{ id: cliente }] = await tx
        .insert(terceros)
        .values({
          codigo: '00001',
          razonSocial: 'Clínica del Litoral S.A.',
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
          email: 'pagos@clinica.com.ar',
        })
        .returning()
    })
  })

  it('una recurrente se factura el día que toca, con el período, se autoriza, se manda y corre al mes siguiente', async () => {
    const r = await en((tx) =>
      guardarRecurrente(tx, null, {
        terceroId: cliente,
        nombre: 'Abono mantenimiento',
        cadaMeses: 1,
        proxima: '2026-10-01',
        hasta: '2026-11-30',
        puntoVenta: 3,
        concepto: 2,
        diasVencimiento: 10,
        renglones: [{ descripcion: 'Abono {periodo}', cantidad: '1', precioUnitario: '100000', alicuotaIva: 5 }],
        autorizar: true,
        enviar: true,
      }),
    )
    expect(r.ok).toBe(true)

    expect(await facturarRecurrentes(empresa, crearCliente, '2026-09-30')).toEqual({ emitidas: 0, errores: 0 })
    expect(await facturarRecurrentes(empresa, crearCliente, '2026-10-01')).toEqual({ emitidas: 1, errores: 0 })
    // Misma fecha otra vez: no se repite.
    expect(await facturarRecurrentes(empresa, crearCliente, '2026-10-01')).toEqual({ emitidas: 0, errores: 0 })

    const [f] = await en((tx) => tx.select().from(comprobantes))
    expect(f).toMatchObject({
      estado: 'autorizado',
      total: '121000.00',
      concepto: 2,
      servicioDesde: '2026-10-01',
      servicioHasta: '2026-10-31',
      vencimiento: '2026-10-11',
    })
    const [item] = await en((tx) => tx.select().from(comprobantesItems))
    expect(item.descripcion).toBe('Abono octubre 2026')
    const [correo] = await en((tx) => tx.select().from(correos))
    expect(correo.para).toBe('pagos@clinica.com.ar')
    expect(correo.texto).toContain('/comprobante/')

    const [rec] = await en((tx) => tx.select().from(facturasRecurrentes))
    expect(rec).toMatchObject({ proxima: '2026-11-01', emitidas: 1, activa: true, ultimaFacturaId: f.id })

    // Noviembre es la última: después queda inactiva.
    expect(await facturarRecurrentes(empresa, crearCliente, '2026-11-02')).toEqual({ emitidas: 1, errores: 0 })
    const [fin] = await en((tx) => tx.select().from(facturasRecurrentes))
    expect(fin).toMatchObject({ proxima: '2026-12-01', activa: false, emitidas: 2 })
  })

  it('el cliente se busca por documento; si no está, se da de alta con el padrón', async () => {
    const existente = await en((tx) => clientePorDocumento(tx, null, { documento: '30-99917652-2' }))
    expect(existente).toEqual({ ok: true, id: cliente })
    const sinNombre = await en((tx) => clientePorDocumento(tx, null, { documento: '20111111112' }))
    expect(sinNombre.ok).toBe(false)
    const nuevo = await en((tx) =>
      clientePorDocumento(tx, null, { documento: '20111111112' }, async () => ({
        razonSocial: 'Gómez Ana',
        condicionIva: 6,
        domicilio: 'Mitre 10',
        localidad: 'Rosario',
      })),
    )
    expect(nuevo.ok).toBe(true)
    const [t] = await en((tx) => tx.select().from(terceros).where(eq(terceros.numeroDocumento, '20111111112')))
    expect(t).toMatchObject({ razonSocial: 'Gómez Ana', condicionIva: 6, tipoDocumento: 80 })
  })

  it('un lote arma las facturas que puede, informa las que no y las autoriza de a tandas', async () => {
    const r = await en((tx) =>
      crearLote(
        tx,
        null,
        {
          nombre: 'planilla.xlsx',
          autorizar: true,
          enviar: false,
          facturas: [
            {
              cliente: { documento: '30999176522' },
              renglones: [{ descripcion: 'Curso', cantidad: '1', precioUnitario: '1000', alicuotaIva: 5 }],
            },
            {
              cliente: { documento: '27333444', razonSocial: 'Lucía Pérez', condicionIva: 5 },
              renglones: [{ descripcion: 'Curso', cantidad: '2', precioUnitario: '1000', alicuotaIva: 5 }],
            },
            {
              cliente: { documento: '30999176523' },
              renglones: [{ descripcion: 'Curso', cantidad: '1', precioUnitario: '1', alicuotaIva: 5 }],
            },
          ],
        },
        '2026-11-05',
      ),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.armadas).toBe(2)
    expect(r.errores).toEqual([{ orden: 3, error: 'El CUIT 30999176523 no es válido.' }])

    const a = await avanzarLote(empresa, r.id, crearCliente, 1, '2026-11-05')
    expect(a).toMatchObject({ ok: true, procesadas: 1, quedan: 1 })
    const b = await avanzarLote(empresa, r.id, crearCliente, 10, '2026-11-05')
    expect(b).toMatchObject({ ok: true, procesadas: 1, quedan: 0 })
    const d = await en((tx) => detalleLote(tx, r.id))
    expect(d).toMatchObject({ autorizadas: 2, borradores: 0, total: 3630 })
    expect(d!.lote.estado).toBe('terminado')
  })
})

describe('Vektra se factura los pagos de las suscripciones', () => {
  it('cada pago deja la factura pendiente y la tarea la emite desde la empresa de Vektra', async () => {
    const db = await baseDePrueba()
    const [vektra, cliente] = await db
      .insert(empresas)
      .values([
        { razonSocial: 'Vektra Digital Solutions S.A.S.', cuit: '30718000005', condicionIva: 1 },
        { razonSocial: 'Taller Norte S.R.L.', cuit: '30712345671', condicionIva: 1, domicilioFiscal: 'Belgrano 100' },
      ])
      .returning()
    await conEmpresa(vektra.id, (tx) =>
      tx.insert(puntosVenta).values({ numero: 5, nombre: 'Suscripciones', tipo: 'electronico' }),
    )
    await db.insert(suscripciones).values({ empresaId: cliente.id, plan: 'pyme', estado: 'activa' })
    const [u] = await db.insert(usuarios).values({ email: 'duena@tallernorte.com', nombre: 'Dueña', hashClave: 'x' }).returning()
    const [rol] = await db.select().from(roles).limit(1)
    await db.insert(membresias).values({ usuarioId: u.id, empresaId: cliente.id, rolId: rol.id })

    process.env.VEKTRA_EMPRESA_ID = vektra.id
    try {
      const p = await registrarPago(
        null,
        cliente.id,
        { importe: '72479', medio: 'Mercado Pago', referencia: 'mp:1' },
        '2026-10-03',
      )
      expect(p.ok).toBe(true)
      const [pend] = await comoPlataforma((tx) => tx.select().from(facturasSuscripcion))
      expect(pend).toMatchObject({ estado: 'pendiente', importe: '72479.00', desde: '2026-10-03', hasta: '2026-11-02' })

      expect(await emitirFacturasSuscripcion(crearCliente, '2026-10-03')).toEqual({ emitidas: 1, errores: 0 })
      const [hecha] = await comoPlataforma((tx) => tx.select().from(facturasSuscripcion))
      expect(hecha.estado).toBe('emitida')
      expect(hecha.numero).toMatch(/^A 0005-/)

      const [f] = await conEmpresa(vektra.id, (tx) => tx.select().from(comprobantes))
      expect(f).toMatchObject({ estado: 'autorizado', letra: 'A', receptorDocNumero: '30712345671', total: '72479.00' })
      const [correo] = await conEmpresa(vektra.id, (tx) => tx.select().from(correos))
      expect(correo.para).toBe('duena@tallernorte.com')

      // No se emite dos veces.
      expect(await emitirFacturasSuscripcion(crearCliente, '2026-10-03')).toEqual({ emitidas: 0, errores: 0 })
    } finally {
      delete process.env.VEKTRA_EMPRESA_ID
    }
  })
})
