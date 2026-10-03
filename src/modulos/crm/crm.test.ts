import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { crmOportunidades, empresas, presupuestos, terceros, usuarios } from '../../db/schema'
import { asignarGruposUsuario, guardarGrupo } from '../maestros/grupos'
import {
  agendarActividad,
  agregarNota,
  asegurarEtapas,
  borrarEtapa,
  completarActividad,
  crearPresupuestoDesde,
  ganarOportunidad,
  guardarEtapa,
  guardarOportunidad,
  listarMotivos,
  listarOportunidades,
  moverOportunidad,
  obtenerOportunidad,
  perderOportunidad,
  posiblesDuplicados,
  pronostico,
  reabrirOportunidad,
  tablero,
  vincularCliente,
} from './crm'

describe('CRM', () => {
  let empresa: string
  let admin: string
  let vendedor: string
  const ids: Record<string, string> = {}
  const comoAdmin = <T>(f: Parameters<typeof conEmpresa<T>>[1]) =>
    conEmpresa({ empresa: { id: empresa }, usuario: { id: admin } }, f)
  const comoVendedor = <T>(f: Parameters<typeof conEmpresa<T>>[1]) =>
    conEmpresa({ empresa: { id: empresa }, usuario: { id: vendedor } }, f)
  const ok = <T extends { ok: boolean }>(r: T) => {
    if (!r.ok) throw new Error(JSON.stringify(r))
    return r as Extract<T, { ok: true }>
  }

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Ventas S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[admin, vendedor] = (
      await db
        .insert(usuarios)
        .values([
          { email: 'ana@ventas.com', nombre: 'Ana', hashClave: 'x' },
          { email: 'beto@ventas.com', nombre: 'Beto', hashClave: 'x' },
        ])
        .returning()
    ).map((u) => u.id)
    await comoAdmin(async (tx) => {
      ids.norte = ok(await guardarGrupo(tx, admin, 'Norte')).id
      ids.sur = ok(await guardarGrupo(tx, admin, 'Sur')).id
      const [c1, c2] = await tx
        .insert(terceros)
        .values([
          { codigo: '1', razonSocial: 'Librería Norte', tipoDocumento: 99, condicionIva: 5, grupoClienteId: ids.norte },
          {
            codigo: '2',
            razonSocial: 'Kiosco Sur',
            tipoDocumento: 99,
            condicionIva: 5,
            grupoClienteId: ids.sur,
            email: 'compras@kioscosur.com',
          },
        ])
        .returning()
      ids.clienteNorte = c1.id
      ids.clienteSur = c2.id
    })
  })

  it('crea las etapas y los motivos de fábrica la primera vez', async () => {
    const etapas = await comoAdmin((tx) => asegurarEtapas(tx))
    expect(etapas.map((e) => e.nombre)).toEqual(['Nueva', 'Calificada', 'Propuesta enviada', 'Negociación', 'Ganada'])
    expect(etapas.at(-1)!.ganada).toBe(true)
    expect(await comoAdmin((tx) => asegurarEtapas(tx))).toHaveLength(5)
    expect((await comoAdmin((tx) => listarMotivos(tx))).map((m) => m.nombre)).toContain('Otro')
    etapas.forEach((e) => (ids[e.nombre] = e.id))
  })

  it('valida la oportunidad y toma la probabilidad de la etapa', async () => {
    const sinNadie = await comoAdmin((tx) => guardarOportunidad(tx, admin, { titulo: 'Toner' }))
    expect(sinNadie).toEqual({ ok: false, error: 'Elegí un cliente o escribí la empresa o el contacto del prospecto.' })
    const mal = await comoAdmin((tx) =>
      guardarOportunidad(tx, admin, { titulo: 'Toner', contacto: 'Juan', ingresoEsperado: '12abc' }),
    )
    expect(mal.ok).toBe(false)

    ids.prospecto = ok(
      await comoAdmin((tx) =>
        guardarOportunidad(tx, admin, {
          titulo: 'Fotocopiadoras para la sede',
          empresaProspecto: 'Estudio Pérez',
          contacto: 'Laura Pérez',
          email: 'laura@estudioperez.com',
          telefono: '011 4555-1234',
          ingresoEsperado: '1.500.000,50',
          etiquetas: 'alquiler, urgente',
          origen: 'Web',
        }),
      ),
    ).id
    const o = await comoAdmin((tx) => obtenerOportunidad(tx, ids.prospecto))
    expect(o).toMatchObject({
      etapa: 'Nueva',
      probabilidad: 10,
      ingresoEsperado: '1500000.50',
      responsableId: admin,
      etiquetas: ['alquiler', 'urgente'],
      esProspecto: true,
      sinActividad: true,
    })
    expect(o!.historial.map((h) => h.texto)).toEqual(['Creó la oportunidad.'])
  })

  it('mover de etapa actualiza probabilidad, historial y tiempo en etapa; llegar a "Ganada" la gana', async () => {
    await comoAdmin((tx) =>
      tx
        .update(crmOportunidades)
        .set({ etapaDesde: sql`now() - interval '5 days'` })
        .where(eq(crmOportunidades.id, ids.prospecto)),
    )
    let o = await comoAdmin((tx) => obtenerOportunidad(tx, ids.prospecto))
    expect(o).toMatchObject({ diasEnEtapa: 5, estancada: true })

    ok(await comoAdmin((tx) => moverOportunidad(tx, admin, ids.prospecto, ids.Calificada)))
    o = await comoAdmin((tx) => obtenerOportunidad(tx, ids.prospecto))
    expect(o).toMatchObject({ etapa: 'Calificada', probabilidad: 30, estado: 'abierta', diasEnEtapa: 0, estancada: false })
    expect(o!.historial[0].texto).toBe('Pasó a la etapa "Calificada".')

    ids.otra = ok(
      await comoAdmin((tx) =>
        guardarOportunidad(tx, admin, { titulo: 'Insumos', terceroId: ids.clienteNorte, ingresoEsperado: 200000 }),
      ),
    ).id
    ok(await comoAdmin((tx) => moverOportunidad(tx, admin, ids.otra, ids.Ganada)))
    expect(await comoAdmin((tx) => obtenerOportunidad(tx, ids.otra))).toMatchObject({ estado: 'ganada', probabilidad: 100 })
  })

  it('perder exige motivo (y nota si es "Otro"), conserva la etapa y se puede reabrir', async () => {
    const motivos = await comoAdmin((tx) => listarMotivos(tx))
    const otro = motivos.find((m) => m.nombre === 'Otro')!
    const precio = motivos.find((m) => m.nombre === 'Precio')!
    ids.perdible = ok(
      await comoAdmin((tx) =>
        guardarOportunidad(tx, admin, { titulo: 'Servicio anual', contacto: 'Pedro', etapaId: ids.Calificada }),
      ),
    ).id
    expect((await comoAdmin((tx) => perderOportunidad(tx, admin, ids.perdible, {}))).ok).toBe(false)
    expect(await comoAdmin((tx) => perderOportunidad(tx, admin, ids.perdible, { motivoId: otro.id }))).toEqual({
      ok: false,
      error: 'Contá en una línea por qué se perdió.',
    })
    ok(await comoAdmin((tx) => perderOportunidad(tx, admin, ids.perdible, { motivoId: precio.id, nota: 'Muy caro' })))
    expect(await comoAdmin((tx) => obtenerOportunidad(tx, ids.perdible))).toMatchObject({
      estado: 'perdida',
      etapa: 'Calificada',
      motivoPerdida: 'Precio',
      probabilidad: 0,
    })
    // Una perdida no se arrastra en el embudo ni aparece en él.
    expect((await comoAdmin((tx) => moverOportunidad(tx, admin, ids.perdible, ids.Nueva))).ok).toBe(false)
    const cols = await comoAdmin((tx) => tablero(tx))
    expect(cols.flatMap((c) => c.oportunidades.map((o) => o.id))).not.toContain(ids.perdible)

    ok(await comoAdmin((tx) => reabrirOportunidad(tx, admin, ids.perdible)))
    expect(await comoAdmin((tx) => obtenerOportunidad(tx, ids.perdible))).toMatchObject({
      estado: 'abierta',
      etapa: 'Calificada',
      probabilidad: 30,
      motivoPerdida: null,
    })
  })

  it('actividades: se agendan, marcan la próxima en el embudo y quedan en el historial al hacerse', async () => {
    const r = await comoAdmin((tx) =>
      agendarActividad(tx, admin, ids.prospecto, { tipo: 'llamada', resumen: 'Llamar a Laura', vence: '2026-01-01' }),
    )
    const actividad = ok(r).id
    expect(
      (await comoAdmin((tx) => agendarActividad(tx, admin, ids.prospecto, { tipo: 'fax', resumen: 'x', vence: '2026-01-01' })))
        .ok,
    ).toBe(false)
    const fila = (await comoAdmin((tx) => listarOportunidades(tx, { estado: 'todas' }))).find((o) => o.id === ids.prospecto)!
    expect(fila.proxima).toMatchObject({ tipo: 'llamada', estado: 'vencida' })
    expect(fila.sinActividad).toBe(false)

    ok(await comoAdmin((tx) => completarActividad(tx, admin, actividad, 'Pide propuesta por email')))
    expect((await comoAdmin((tx) => completarActividad(tx, admin, actividad))).ok).toBe(false)
    ok(await comoAdmin((tx) => agregarNota(tx, admin, ids.prospecto, 'Tienen 3 sucursales')))
    const o = await comoAdmin((tx) => obtenerOportunidad(tx, ids.prospecto))
    expect(o!.historial.slice(0, 2).map((h) => h.texto)).toEqual([
      'Tienen 3 sucursales',
      'Llamada hecha: Llamar a Laura — Pide propuesta por email.',
    ])
    expect(o!.actividades[0]).toMatchObject({ hecha: true, estado: null })
  })

  it('el tablero suma por columna el ingreso esperado y el ponderado por probabilidad', async () => {
    const cols = await comoAdmin((tx) => tablero(tx))
    const calificada = cols.find((c) => c.nombre === 'Calificada')!
    expect(calificada.oportunidades).toHaveLength(2)
    expect(calificada.total).toBeCloseTo(1_500_000.5)
    expect(calificada.ponderado).toBeCloseTo(450_000.15)
    expect(cols.find((c) => c.nombre === 'Ganada')!.total).toBe(200_000)
  })

  it('avisa posibles duplicados y vincula con el cliente existente', async () => {
    ids.dup = ok(
      await comoAdmin((tx) =>
        guardarOportunidad(tx, admin, { titulo: 'Resmas', empresaProspecto: 'Kiosco', email: 'COMPRAS@kioscosur.com' }),
      ),
    ).id
    const d = await comoAdmin((tx) => posiblesDuplicados(tx, ids.dup))
    expect(d.clientes.map((c) => c.razonSocial)).toEqual(['Kiosco Sur'])
    ok(await comoAdmin((tx) => vincularCliente(tx, admin, ids.dup, ids.clienteSur)))
    expect(await comoAdmin((tx) => obtenerOportunidad(tx, ids.dup))).toMatchObject({ cliente: 'Kiosco Sur', esProspecto: false })
  })

  it('pasar a presupuesto da de alta al prospecto, arma el presupuesto y avanza a la etapa de propuesta', async () => {
    const r = ok(await comoAdmin((tx) => crearPresupuestoDesde(tx, admin, ids.prospecto)))
    const o = await comoAdmin((tx) => obtenerOportunidad(tx, ids.prospecto))
    expect(o).toMatchObject({ presupuestoId: r.id, etapa: 'Propuesta enviada', probabilidad: 60, esProspecto: false })
    const [p] = await comoAdmin((tx) => tx.select().from(presupuestos).where(eq(presupuestos.id, r.id)))
    expect(p).toMatchObject({ neto: '1500000.50', terceroId: o!.terceroId })
    const [cliente] = await comoAdmin((tx) => tx.select().from(terceros).where(eq(terceros.id, o!.terceroId!)))
    expect(cliente).toMatchObject({ razonSocial: 'Estudio Pérez', email: 'laura@estudioperez.com', esCliente: true })
    // Volver a pedirlo no duplica.
    expect(ok(await comoAdmin((tx) => crearPresupuestoDesde(tx, admin, ids.prospecto))).id).toBe(r.id)
  })

  it('pronóstico: embudo, ponderado, ganadas, tasa y motivos', async () => {
    const motivos = await comoAdmin((tx) => listarMotivos(tx))
    ok(
      await comoAdmin((tx) =>
        perderOportunidad(tx, admin, ids.perdible, { motivoId: motivos.find((m) => m.nombre === 'Precio')!.id }),
      ),
    )
    const p = await comoAdmin((tx) => pronostico(tx, '2020-01-01'))
    expect(p).toMatchObject({ ganadas: 1, ganado: 200_000, perdidas: 1, tasa: 0.5 })
    expect(p.motivos).toEqual([{ nombre: 'Precio', cantidad: 1 }])
    expect(p.perdidasPorEtapa).toEqual([{ nombre: 'Calificada', cantidad: 1 }])
    expect(p.embudo).toBeCloseTo(1_500_000.5)
    expect(p.ponderado).toBeCloseTo(900_000.3)
  })

  it('etapas: no se borra una con oportunidades; se agregan con alerta de días', async () => {
    expect((await comoAdmin((tx) => borrarEtapa(tx, admin, ids.Calificada))).ok).toBe(false)
    const nueva = ok(
      await comoAdmin((tx) => guardarEtapa(tx, admin, { nombre: 'En espera', probabilidad: 20, diasAlerta: '30' })),
    )
    expect((await comoAdmin((tx) => asegurarEtapas(tx))).at(-1)).toMatchObject({ id: nueva.id, diasAlerta: 30 })
    expect((await comoAdmin((tx) => guardarEtapa(tx, admin, { nombre: 'X', probabilidad: 150 }))).ok).toBe(false)
    ok(await comoAdmin((tx) => borrarEtapa(tx, admin, nueva.id)))
  })

  it('un vendedor con grupos ve los prospectos y las oportunidades de sus clientes, no las de otros grupos', async () => {
    await comoAdmin((tx) => asignarGruposUsuario(tx, admin, vendedor, [ids.norte]))
    const visibles = await comoVendedor((tx) => listarOportunidades(tx, { estado: 'todas' }))
    const titulos = visibles.map((o) => o.titulo).sort()
    expect(titulos).toContain('Insumos') // cliente del grupo Norte
    expect(titulos).toContain('Servicio anual') // prospecto sin cliente
    expect(titulos).not.toContain('Resmas') // cliente del grupo Sur
    const ajena = await comoVendedor((tx) => obtenerOportunidad(tx, ids.dup))
    expect(ajena).toBeNull()
  })
})
