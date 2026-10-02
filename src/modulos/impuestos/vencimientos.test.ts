import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { correos, empresas, vencimientos } from '../../db/schema'
import { leerZip } from '../../lib/zip'
import { alPresentarIva, armarPaquete, enviarPaquete } from './paquete'
import { guardarGenerada, marcarPresentada } from './presentaciones'
import {
  avisarVencimientos,
  calendario,
  diasSugeridos,
  fechaVencimiento,
  generarVencimientos,
  guardarConfiguracion,
  marcarCumplida,
  obligacionesDeLaEmpresa,
} from './vencimientos'

const U = '00000000-0000-4000-8000-000000000001'

describe('fechas de vencimiento', () => {
  it('día del mes siguiente, corrido al lunes si cae en fin de semana', () => {
    expect(fechaVencimiento('2026-09', 20)).toBe('2026-10-20') // martes
    expect(fechaVencimiento('2026-09', 17)).toBe('2026-10-19') // sábado 17 → lunes 19
    expect(fechaVencimiento('2026-09', 18)).toBe('2026-10-19') // domingo 18 → lunes 19
    expect(fechaVencimiento('2026-01', 31)).toBe('2026-03-02') // 28/2 es sábado → lunes 2/3
    expect(diasSugeridos('30-71597482-3').iva).toBe(19)
  })
})

describe('vencimientos, avisos y paquete del contador', () => {
  let empresa: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Vence S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
  })

  it('arranca con IVA, SICORE e IIBB según el CUIT y genera los vencimientos', async () => {
    const o = await en((tx) => obligacionesDeLaEmpresa(tx, empresa))
    expect(o.map((x) => x.impuesto).sort()).toEqual(['iibb', 'iva_digital', 'sicore'])
    await en((tx) => generarVencimientos(tx, empresa, '2026-10-02'))
    await en((tx) => generarVencimientos(tx, empresa, '2026-10-02')) // no duplica
    const v = await en((tx) => tx.select().from(vencimientos))
    expect(v).toHaveLength(12) // 3 obligaciones × 4 períodos
  })

  it('avisa una sola vez antes de vencer y otra si se pasó; lo presentado no avisa', async () => {
    // Sin email configurado no manda nada.
    expect(await en((tx) => avisarVencimientos(tx, empresa, '2026-10-16'))).toEqual({ avisos: 0 })
    expect(
      await en((tx) =>
        guardarConfiguracion(tx, U, {
          emailContador: 'estudio@contadores.test',
          emailAvisos: '',
          avisarDias: 3,
          paqueteAlPresentar: true,
        }),
      ),
    ).toEqual({ ok: true })

    // 16/10: vence pronto el IVA de septiembre (19/10) y SICORE (14/10) ya venció.
    const r = await en((tx) => avisarVencimientos(tx, empresa, '2026-10-16'))
    expect(r.avisos).toBeGreaterThanOrEqual(2)
    const asuntos = (await en((tx) => tx.select().from(correos))).map((c) => c.asunto)
    expect(asuntos.some((a) => a.startsWith('Vence el 19/10/2026: IVA'))).toBe(true)
    expect(asuntos.some((a) => a.startsWith('Vencido: SICORE'))).toBe(true)
    expect(await en((tx) => avisarVencimientos(tx, empresa, '2026-10-16'))).toEqual({ avisos: 0 })

    // IIBB se marca a mano; IVA se da por presentado con la presentación.
    const cal = await en((tx) => calendario(tx, '2026-10-01', '2026-10-31', '2026-10-16'))
    const iibb = cal.find((x) => x.impuesto === 'iibb' && x.periodo === '2026-09')!
    await en((tx) => marcarCumplida(tx, U, iibb.id, true))
    const g = await en((tx) =>
      guardarGenerada(tx, U, {
        impuesto: 'iva_digital',
        periodo: '2026-09',
        archivo: new Uint8Array([1]),
        nombreArchivo: 'libro.zip',
        resumen: {},
      }),
    )
    await en((tx) => marcarPresentada(tx, U, g.id, { transaccion: '555' }))
    const despues = await en((tx) => calendario(tx, '2026-10-01', '2026-10-31', '2026-10-25'))
    expect(despues.find((x) => x.impuesto === 'iibb' && x.periodo === '2026-09')!.estado).toBe('cumplido')
    expect(despues.find((x) => x.impuesto === 'iva_digital' && x.periodo === '2026-09')!.estado).toBe('cumplido')
    expect(despues.find((x) => x.impuesto === 'sicore' && x.periodo === '2026-09')!.estado).toBe('vencido')
  })

  it('arma el paquete del mes y lo manda al contador con el adjunto', async () => {
    const p = await en((tx) => armarPaquete(tx, empresa, '2026-09'))
    const archivos = await leerZip(p.zip)
    const nombres = [...archivos.keys()]
    expect(nombres).toEqual(
      expect.arrayContaining([
        'LEEME.txt',
        'presentado/libro.zip',
        'subdiarios-iva-2026-09.xlsx',
        'iibb-2026-09.xlsx',
        'retenciones-2026-09.xlsx',
      ]),
    )
    const leeme = new TextDecoder().decode(archivos.get('LEEME.txt'))
    expect(leeme).toContain('Libro IVA presentado (transacción 555)')
    expect(leeme).toContain('POSICIÓN DE IVA')

    const r = await en((tx) => enviarPaquete(tx, empresa, U, '2026-09'))
    expect(r).toEqual({ ok: true, para: 'estudio@contadores.test' })
    const [c] = await en((tx) => tx.select().from(correos).where(eq(correos.entidad, 'paquete_contador')))
    expect(c.asunto).toBe('Vence S.A.: impuestos de 09/2026')
    expect((c.adjuntos as { nombre: string }[])[0].nombre).toBe('paquete-contador-2026-09.zip')
    // Al presentar, sale solo (está configurado).
    expect(await en((tx) => alPresentarIva(tx, empresa, U, '2026-09'))).toMatchObject({ ok: true })
  })
})
