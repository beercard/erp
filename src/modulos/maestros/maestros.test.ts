import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { articulos, auditoria, empresas, listasPrecios, precios } from '../../db/schema'
import { buscarTodo } from '../busqueda'
import { listarArticulos } from './articulos'
import { guardarTercero, listarTerceros } from './terceros'

let empresa: string
const USUARIO = '00000000-0000-4000-8000-000000000001'

const base = {
  razonSocial: 'Ferretería El Tornillo S.R.L.',
  esCliente: true,
  esProveedor: false,
  tipoDocumento: '80',
  numeroDocumento: '20-12345678-6',
  condicionIva: '1',
}

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db.insert(empresas).values({ razonSocial: 'Prueba S.A.', cuit: '30111111118', condicionIva: 1 }).returning()
  empresa = e.id
})

describe('terceros', () => {
  it('da de alta con código automático, CUIT normalizado y auditoría', async () => {
    const r = await conEmpresa(empresa, (tx) => guardarTercero(tx, USUARIO, base))
    expect(r.ok).toBe(true)
    const [t] = await conEmpresa(empresa, (tx) => listarTerceros(tx, { q: 'tornillo' }))
    expect(t.codigo).toBe('00001')
    expect(t.numeroDocumento).toBe('20123456786')
    const registros = await conEmpresa(empresa, (tx) => tx.select().from(auditoria).where(eq(auditoria.entidad, 'tercero')))
    expect(registros).toHaveLength(1)
  })

  it('rechaza un CUIT inválido con el motivo y un documento repetido', async () => {
    const malo = await conEmpresa(empresa, (tx) => guardarTercero(tx, USUARIO, { ...base, numeroDocumento: '20-12345678-9' }))
    expect(malo.ok).toBe(false)
    if (!malo.ok) expect(malo.errores.numeroDocumento).toContain('debería ser 6')
    const repetido = await conEmpresa(empresa, (tx) => guardarTercero(tx, USUARIO, { ...base, razonSocial: 'Otro' }))
    if (!repetido.ok) expect(repetido.errores.numeroDocumento).toContain('El Tornillo')
    expect(repetido.ok).toBe(false)
  })

  it('exige CUIT a un Responsable Inscripto y que sea cliente o proveedor', async () => {
    const r = await conEmpresa(empresa, (tx) =>
      guardarTercero(tx, USUARIO, { ...base, tipoDocumento: '96', numeroDocumento: '30111222', esCliente: false }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores.tipoDocumento).toBeDefined()
      expect(r.errores.esCliente).toBeDefined()
    }
  })

  it('consumidor final sin documento y búsqueda por CUIT', async () => {
    const r = await conEmpresa(empresa, (tx) =>
      guardarTercero(tx, USUARIO, {
        ...base,
        razonSocial: 'Consumidor final',
        tipoDocumento: '99',
        numeroDocumento: '123',
        condicionIva: '5',
      }),
    )
    expect(r.ok).toBe(true)
    const encontrados = await conEmpresa(empresa, (tx) => buscarTodo(tx, '12345678'))
    expect(encontrados.map((x) => x.titulo)).toEqual(['Ferretería El Tornillo S.R.L.'])
  })
})

describe('artículos y listas derivadas', () => {
  it('la lista derivada aplica su porcentaje sobre el precio vigente de la base', async () => {
    const { derivada } = await conEmpresa(empresa, async (tx) => {
      const [general] = await tx.insert(listasPrecios).values({ codigo: '001', nombre: 'General' }).returning()
      const [tarjeta] = await tx
        .insert(listasPrecios)
        .values({ codigo: '002', nombre: 'Tarjeta', listaBaseId: general.id, porcentaje: '30' })
        .returning()
      const [art] = await tx.insert(articulos).values({ codigo: 'A1', nombre: 'Tóner' }).returning()
      await tx.insert(precios).values([
        { listaId: general.id, articuloId: art.id, precio: '1000', vigenteDesde: '2020-01-01' },
        { listaId: general.id, articuloId: art.id, precio: '1100.10', vigenteDesde: '2024-01-01' },
        // Un aumento futuro todavía no rige.
        { listaId: general.id, articuloId: art.id, precio: '9999', vigenteDesde: '2999-01-01' },
      ])
      return { derivada: tarjeta.id }
    })
    const [a] = await conEmpresa(empresa, (tx) => listarArticulos(tx, { listaId: derivada }))
    // 1100,10 × 1,30 = 1430,13
    expect(a.precio).toBe('1430.13')
  })
})
