import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GET as getOrden } from '../../app/api/v1/ordenes/[id]/route'
import { GET as getClientes } from '../../app/api/v1/clientes/route'
import { POST as postLecturas } from '../../app/api/v1/lecturas/route'
import { GET as getOrdenes, POST as postOrdenes } from '../../app/api/v1/ordenes/route'
import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, lecturas, suscripciones, terceros, webhookEntregas } from '../../db/schema'
import { guardarEquipo } from '../contratos/contratos'
import { cerrarOrden } from '../servicio/servicio'
import { crearModelos } from '../servicio/tiposOrden'
import { crearClave, revocarClave } from './claves'
import { direccionPermitida, entregarPendientes, guardarWebhook } from './webhooks'

const U = '00000000-0000-4000-8000-000000000001'

describe('API y webhooks', () => {
  let empresa: string
  let total: string
  let lectura: string
  let receptor: Server
  let puerto = 0
  const recibidos: { evento: string; firma: string; cuerpo: string }[] = []
  let responder = 200
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const pedido = (ruta: string, clave: string, init: RequestInit = {}) =>
    new Request(`http://erp.test${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    })

  beforeAll(async () => {
    process.env.WEBHOOKS_PERMITIR_LOCAL = '1'
    receptor = createServer((req, res) => {
      let cuerpo = ''
      req.on('data', (d) => (cuerpo += d))
      req.on('end', () => {
        recibidos.push({ evento: String(req.headers['x-erp-evento']), firma: String(req.headers['x-erp-firma']), cuerpo })
        res.writeHead(responder).end('ok')
      })
    })
    await new Promise<void>((ok) => receptor.listen(0, '127.0.0.1', () => ok()))
    puerto = (receptor.address() as { port: number }).port

    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await db.insert(suscripciones).values({ empresaId: empresa, plan: 'empresa', estado: 'activa', aplicaciones: ['contratos'] })
    await en(async (tx) => {
      await tx.insert(terceros).values({ codigo: 'C1', razonSocial: 'Estudio', tipoDocumento: 99, condicionIva: 5 })
      await crearModelos(tx, U)
    })
    const [cli] = await en((tx) => tx.select().from(terceros))
    await en((tx) => guardarEquipo(tx, U, { serie: 'EQ1', terceroId: cli.id, comercializacion: 'venta' }))
    const t = await en((tx) => crearClave(tx, U, empresa, { nombre: 'Integración', acceso: 'total' }))
    const l = await en((tx) => crearClave(tx, U, empresa, { nombre: 'Solo leer', acceso: 'lectura' }))
    if (!t.ok || !l.ok) throw new Error('claves')
    total = t.clave
    lectura = l.clave
  })
  afterAll(() => {
    receptor.close()
    delete process.env.WEBHOOKS_PERMITIR_LOCAL
  })

  it('autentica con la clave, pagina, y la de lectura no escribe', async () => {
    expect((await getClientes(new Request('http://erp.test/api/v1/clientes'))).status).toBe(401)
    expect((await getClientes(pedido('/api/v1/clientes', `${total}x`))).status).toBe(401)
    const r = await getClientes(pedido('/api/v1/clientes?limit=500', lectura))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ paging: { offset: 0, limit: 100, total: 1 }, resultados: [{ codigo: 'C1' }] })
    const escribir = await postOrdenes(pedido('/api/v1/ordenes', lectura, { method: 'POST', body: '{}' }))
    expect(escribir.status).toBe(403)
  })

  it('webhooks: abre una orden por la API, avisa firmado, reintenta si el receptor falla', async () => {
    expect(await direccionPermitida('http://169.254.169.254/x')).toBeNull() // permitido solo por la variable de pruebas
    delete process.env.WEBHOOKS_PERMITIR_LOCAL
    expect(await direccionPermitida('https://127.0.0.1/x')).toContain('interna')
    expect(await direccionPermitida('http://ejemplo.com/x')).toContain('https')
    process.env.WEBHOOKS_PERMITIR_LOCAL = '1'

    const w = await en((tx) =>
      guardarWebhook(tx, U, { url: `http://127.0.0.1:${puerto}/erp`, eventos: ['orden.creada', 'orden.cerrada'] }),
    )
    if (!w.ok || !w.secreto) throw new Error('webhook')

    const r = await postOrdenes(
      pedido('/api/v1/ordenes', total, {
        method: 'POST',
        body: JSON.stringify({
          cliente: 'C1',
          equipo: 'eq1',
          tipo: 'corr',
          falla: 'No imprime',
          instrucciones: { falla_reportada: 'Atasca' },
        }),
      }),
    )
    expect(r.status).toBe(201)
    const orden = (await r.json()) as { id: string; numero: number; origen: string; estado: string }
    expect(orden).toMatchObject({ numero: 1, origen: 'api', estado: 'pendiente' })
    // Faltan instrucciones obligatorias: 422 con el motivo.
    const mal = await postOrdenes(
      pedido('/api/v1/ordenes', total, { method: 'POST', body: JSON.stringify({ cliente: 'C1', tipo: 'CORR', falla: 'x y z' }) }),
    )
    expect(mal.status).toBe(422)

    // El receptor falla: queda pendiente para más tarde.
    responder = 500
    expect(await entregarPendientes(empresa)).toEqual({ entregados: 0, fallidos: 1 })
    let [e] = await en((tx) => tx.select().from(webhookEntregas))
    expect(e).toMatchObject({ estado: 'pendiente', intentos: 1 })
    expect(await entregarPendientes(empresa)).toEqual({ entregados: 0, fallidos: 0 }) // todavía no toca
    await en((tx) => tx.update(webhookEntregas).set({ proximoIntento: new Date(0) }))
    responder = 200
    expect(await entregarPendientes(empresa)).toEqual({ entregados: 1, fallidos: 0 })
    ;[e] = await en((tx) => tx.select().from(webhookEntregas))
    expect(e.estado).toBe('entregado')

    // La firma se puede verificar con el secreto.
    const ultimo = recibidos.at(-1)!
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(ultimo.firma)!
    expect(createHmac('sha256', w.secreto).update(`${t}.${ultimo.cuerpo}`).digest('hex')).toBe(v1)
    expect(JSON.parse(ultimo.cuerpo)).toMatchObject({ evento: 'orden.creada', datos: { numero: 1, cliente: { codigo: 'C1' } } })

    // Cerrarla dispara orden.cerrada; la consulta por la API la devuelve con el informe.
    await en((tx) => cerrarOrden(tx, U, orden.id, { fecha: '2026-10-05', cierre: 'ok', nota: 'Resuelto por teléfono' }))
    await entregarPendientes(empresa)
    expect(recibidos.at(-1)!.evento).toBe('orden.cerrada')
    const d = await getOrden(pedido(`/api/v1/ordenes/${orden.id}`, lectura), { params: Promise.resolve({ id: orden.id }) })
    expect(await d.json()).toMatchObject({ estado: 'cerrada_ok', solucion: 'Resuelto por teléfono', visitas: [], items: [] })
    const lista = await getOrdenes(pedido('/api/v1/ordenes?estado=cerrada_ok', lectura))
    expect(((await lista.json()) as { paging: { total: number } }).paging.total).toBe(1)
  })

  it('lecturas por la API, con el problema de cada una', async () => {
    const r = await postLecturas(
      pedido('/api/v1/lecturas', total, {
        method: 'POST',
        body: JSON.stringify({
          lecturas: [
            { serie: 'eq1', contador: 1500, fecha: '2026-10-05' },
            { serie: 'NOEXISTE', contador: 1 },
          ],
        }),
      }),
    )
    expect(await r.json()).toMatchObject({ cargadas: 1, errores: [{ serie: 'NOEXISTE' }] })
    const [l] = await en((tx) => tx.select().from(lecturas).where(eq(lecturas.origen, 'api')))
    expect(l.contador).toBe(1500)
  })

  it('una clave revocada deja de servir', async () => {
    const c = await en((tx) => crearClave(tx, U, empresa, { nombre: 'Temporal', acceso: 'lectura' }))
    if (!c.ok) throw new Error(c.error)
    expect((await getClientes(pedido('/api/v1/clientes', c.clave))).status).toBe(200)
    await en((tx) => revocarClave(tx, U, c.id))
    expect((await getClientes(pedido('/api/v1/clientes', c.clave))).status).toBe(401)
  })
})
