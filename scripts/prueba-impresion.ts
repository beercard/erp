/**
 * Solo para desarrollo: crea en la EMPRESA DEMO una factura A y una B
 * "autorizadas" con un ARCA simulado (CAE inventado), para revisar la ficha y
 * la impresión sin certificado. Nunca correr contra producción.
 */
import { eq } from 'drizzle-orm'

import { db } from '../src/db/conexion'
import { conEmpresa } from '../src/db/empresa'
import { migrar } from '../src/db/migrar'
import { empresas, puntosVenta, terceros } from '../src/db/schema'
import { emitirComprobante, guardarComprobante } from '../src/modulos/facturacion/comprobantes'
import { hoyArgentina } from '../src/lib/fechas'

if (process.env.DATABASE_URL) throw new Error('Este script es solo para la base local.')
await migrar(db())
const [demo] = await db().select().from(empresas).where(eq(empresas.razonSocial, 'Empresa Demo S.A.'))
if (!demo) throw new Error('No está la empresa demo (npm run db:semilla).')
let ultimo = 0
const falso = {
  ambiente: 'homologacion' as const,
  ultimoAutorizado: async () => ultimo,
  solicitarCae: async (s: { numero: number }) => {
    ultimo = s.numero
    return {
      resultado: 'A' as const,
      cae: `7640000000${String(s.numero).padStart(4, '0')}`,
      caeVence: hoyArgentina(),
      observaciones: [],
      errores: [],
    }
  },
  consultar: async () => null,
}
const usuario = '00000000-0000-4000-8000-000000000001'
const ids = await conEmpresa(demo.id, async (tx) => {
  await tx.insert(puntosVenta).values({ numero: 99, nombre: 'Prueba de impresión', tipo: 'electronico' }).onConflictDoNothing()
  const clientes = await tx.select().from(terceros)
  const ri = clientes.find((c) => c.condicionIva === 1 && c.numeroDocumento)!
  const cf = clientes.find((c) => c.condicionIva === 5)!
  const items = [
    { descripcion: 'Tóner Ricoh MP 2014 (PRUEBA)', cantidad: '2', precioUnitario: '45000', alicuotaIva: 5 },
    { descripcion: 'Servicio técnico (PRUEBA)', cantidad: '1', precioUnitario: '30000', alicuotaIva: 4, descuento: '10' },
  ]
  const base = {
    clase: 'factura',
    puntoVenta: 99,
    fecha: hoyArgentina(),
    moneda: 'PES',
    cotizacion: '1',
    observaciones: 'PRUEBA DE IMPRESIÓN: CAE inventado.',
  }
  const a = await guardarComprobante(tx, usuario, { ...base, terceroId: ri.id, items })
  const b = await guardarComprobante(tx, usuario, { ...base, terceroId: cf.id, items })
  if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]))
  return [a.id, b.id]
})
for (const id of ids) {
  ultimo = 0
  const r = await emitirComprobante(demo.id, usuario, id, async () => falso as never)
  console.log(id, r)
}
process.exit(0)
