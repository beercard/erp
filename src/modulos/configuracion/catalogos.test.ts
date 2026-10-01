import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas } from '../../db/schema'
import { cambiarEstadoCatalogo, catalogo, guardarCatalogo, listarCatalogo } from './catalogos'

let empresa: string
const USUARIO = '00000000-0000-4000-8000-000000000001'
const def = (clave: string) => {
  const d = catalogo(clave)
  if (!d) throw new Error(clave)
  return d
}

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db.insert(empresas).values({ razonSocial: 'Prueba S.A.', cuit: '30111111118', condicionIva: 1 }).returning()
  empresa = e.id
})

describe('maestros simples', () => {
  it('valida requeridos y números, y avisa duplicados con un mensaje claro', async () => {
    const sinNombre = await conEmpresa(empresa, (tx) => guardarCatalogo(tx, USUARIO, def('depositos'), { codigo: '001' }))
    expect(sinNombre).toMatchObject({ ok: false, errores: { nombre: 'Completá nombre.' } })

    const ok = await conEmpresa(empresa, (tx) => guardarCatalogo(tx, USUARIO, def('depositos'), { codigo: '001', nombre: 'Central' }))
    expect(ok.ok).toBe(true)
    const repetido = await conEmpresa(empresa, (tx) => guardarCatalogo(tx, USUARIO, def('depositos'), { codigo: '001', nombre: 'Otro' }))
    expect(repetido).toMatchObject({ ok: false, mensaje: 'Ya hay un depósito con ese código.' })

    const malNumero = await conEmpresa(empresa, (tx) =>
      guardarCatalogo(tx, USUARIO, def('condiciones-pago'), { nombre: 'Rara', dias: 'treinta', cuotas: '1' }),
    )
    expect(malNumero).toMatchObject({ ok: false, errores: { dias: 'Escribí un número.' } })
  })

  it('una lista derivada exige porcentaje y no puede calcularse sobre sí misma', async () => {
    const base = await conEmpresa(empresa, (tx) =>
      guardarCatalogo(tx, USUARIO, def('listas-precios'), { codigo: '001', nombre: 'General', moneda: 'PES' }),
    )
    if (!base.ok) throw new Error('no grabó la base')
    const sinPorcentaje = await conEmpresa(empresa, (tx) =>
      guardarCatalogo(tx, USUARIO, def('listas-precios'), { codigo: '002', nombre: 'Tarjeta', moneda: 'PES', listaBaseId: base.id }),
    )
    expect(sinPorcentaje).toMatchObject({ ok: false, errores: { porcentaje: expect.any(String) } })
    const consigo = await conEmpresa(empresa, (tx) =>
      guardarCatalogo(tx, USUARIO, def('listas-precios'), { codigo: '001', nombre: 'General', moneda: 'PES', listaBaseId: base.id, porcentaje: '5' }, base.id),
    )
    expect(consigo.ok).toBe(false)
    const derivada = await conEmpresa(empresa, (tx) =>
      guardarCatalogo(tx, USUARIO, def('listas-precios'), { codigo: '002', nombre: 'Tarjeta', moneda: 'PES', listaBaseId: base.id, porcentaje: '30,5' }),
    )
    expect(derivada.ok).toBe(true)
  })

  it('valida el CUIT del transporte y da de baja sin borrar', async () => {
    const malo = await conEmpresa(empresa, (tx) => guardarCatalogo(tx, USUARIO, def('transportes'), { nombre: 'Flete', cuit: '20-12345678-9' }))
    expect(malo.ok).toBe(false)
    const bueno = await conEmpresa(empresa, (tx) => guardarCatalogo(tx, USUARIO, def('transportes'), { nombre: 'Flete', cuit: '20-12345678-6' }))
    if (!bueno.ok) throw new Error('no grabó')
    await conEmpresa(empresa, (tx) => cambiarEstadoCatalogo(tx, USUARIO, def('transportes'), bueno.id, false))
    const filas = await conEmpresa(empresa, (tx) => listarCatalogo(tx, def('transportes')))
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ activo: false, cuit: '20123456786' })
  })
})
