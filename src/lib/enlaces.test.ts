import { describe, expect, it } from 'vitest'

import { firmarEnlace, leerEnlace } from './enlaces'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-de-prueba-de-32-caracteres-o-mas'

describe('Enlaces públicos firmados', () => {
  it('se leen solo si la firma, el tipo y el vencimiento están bien', () => {
    const t = firmarEnlace('factura', 'e1', 'c1', 1, 0)
    expect(leerEnlace(t, 'factura', 1000)).toEqual({ empresaId: 'e1', id: 'c1' })
    expect(leerEnlace(t, 'recibo', 1000)).toBeNull()
    expect(leerEnlace(t, 'factura', 2 * 86_400_000)).toBeNull()
    const [cuerpo, firma] = t.split('.')
    const otro = Buffer.from(JSON.stringify(['factura', 'e2', 'c1', 9_999_999_999])).toString('base64url')
    expect(leerEnlace(`${otro}.${firma}`, 'factura')).toBeNull()
    expect(leerEnlace(`${cuerpo}.x${firma.slice(1)}`, 'factura', 1000)).toBeNull()
  })
})
