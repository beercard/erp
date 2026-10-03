import { createHmac } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  empresas,
  membresias,
  roles,
  terceros,
  usuarios,
  whatsappConversaciones,
  whatsappCuentas,
  whatsappMensajes,
} from '../../db/schema'
import { mismoTelefono, normalizarTelefono, type Fetch } from './api'
import {
  autorizar,
  enviarAConversacion,
  enviarATelefono,
  guardarCuenta,
  obtenerConversacion,
  recibirAviso,
  verificarSuscripcion,
} from './whatsapp'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-de-prueba-de-32-caracteres-o-mas'

const SECRETO = '0123456789abcdef0123456789abcdef'

/** Graph de mentira: anota lo que se manda y contesta un wamid. */
function metaFalsa(prefijo = Math.random().toString(36).slice(2, 8)) {
  const enviados: Record<string, unknown>[] = []
  const f = (async (_url: string | URL | Request, init: RequestInit = {}) => {
    const cuerpo = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
    enviados.push(cuerpo)
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${prefijo}${enviados.length}` }] }), { status: 200 })
  }) as Fetch
  return { f, enviados }
}

const aviso = (mensajes: unknown[], statuses: unknown[] = []) =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '1234567890' },
              contacts: [{ wa_id: '5491155550000', profile: { name: 'Lucía' } }],
              messages: mensajes,
              statuses,
            },
          },
        ],
      },
    ],
  })
const firmar = (c: string) => `sha256=${createHmac('sha256', SECRETO).update(c).digest('hex')}`

describe('WhatsApp', () => {
  let empresa: string
  let ana: string
  let clave: string
  let cliente: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa({ empresa: { id: empresa }, usuario: { id: ana } }, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Mensajes S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    ;[{ id: ana }] = await db.insert(usuarios).values({ email: 'ana@m.com', nombre: 'Ana', hashClave: 'x' }).returning()
    const [rol] = await db.select().from(roles).where(eq(roles.nombre, 'Administración'))
    await db.insert(membresias).values({ usuarioId: ana, empresaId: empresa, rolId: rol.id })
    ;[{ id: cliente }] = await en((tx) =>
      tx
        .insert(terceros)
        .values({
          codigo: 'C1',
          razonSocial: 'Lucía Pérez',
          telefono: '011 15 5555-0000',
          tipoDocumento: 96,
          numeroDocumento: '30111222',
          condicionIva: 5,
        })
        .returning(),
    )
  })

  it('normaliza teléfonos argentinos', () => {
    expect(normalizarTelefono('011 15 5555-0000')).toBe('5491155550000')
    expect(normalizarTelefono('+54 9 11 5555-0000')).toBe('5491155550000')
    expect(mismoTelefono('541155550000', '5491155550000')).toBe(true)
  })

  it('conecta el número (validando el app secret) y verifica la suscripción', async () => {
    expect(
      (await en((tx) => guardarCuenta(tx, ana, empresa, { numeroId: '1234567890', token: 'x'.repeat(40), secretoApp: 'corto' })))
        .ok,
    ).toBe(false)
    const r = await en((tx) =>
      guardarCuenta(tx, ana, empresa, {
        numeroId: '1234567890',
        token: 'EAA'.padEnd(60, 'x'),
        secretoApp: SECRETO,
        plantilla: 'aviso_general',
      }),
    )
    if (!r.ok) throw new Error(r.error)
    clave = r.clave
    const token = await en(async (tx) => (await tx.select().from(whatsappCuentas))[0].tokenVerificacion)
    const q = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '42' })
    expect(await verificarSuscripcion(clave, q)).toBe('42')
    q.set('hub.verify_token', 'otro')
    expect(await verificarSuscripcion(clave, q)).toBeNull()
  })

  it('recibe mensajes firmados una sola vez, reconoce al cliente y actualiza estados', async () => {
    const cuerpo = aviso([
      {
        id: 'wamid.A',
        from: '5491155550000',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'Hola, ¿cuánto debo?' },
      },
    ])
    expect(await recibirAviso(clave, cuerpo, 'sha256=mal')).toBeNull()
    const nuevos = await recibirAviso(clave, cuerpo, firmar(cuerpo))
    expect(nuevos).toHaveLength(1)
    expect(await recibirAviso(clave, cuerpo, firmar(cuerpo))).toEqual([])
    const [conv] = await en((tx) => tx.select().from(whatsappConversaciones))
    expect(conv).toMatchObject({ telefono: '5491155550000', nombre: 'Lucía', terceroId: cliente, atiende: 'agente', noLeidos: 1 })

    const meta = metaFalsa('')
    const r = await enviarAConversacion(
      empresa,
      conv.id,
      'Hola Lucía, te paso el saldo.',
      { tipo: 'usuario', usuarioId: ana },
      meta.f,
    )
    expect(r.ok).toBe(true)
    expect(meta.enviados[0]).toMatchObject({ to: '5491155550000', type: 'text', text: { body: 'Hola Lucía, te paso el saldo.' } })
    const estado = aviso([], [{ id: 'wamid.1', status: 'read' }])
    await recibirAviso(clave, estado, firmar(estado))
    const c = await en((tx) => obtenerConversacion(tx, conv.id))
    expect(c!.mensajes.map((m) => [m.direccion, m.estado])).toEqual([
      ['entrante', 'recibido'],
      ['saliente', 'leido'],
    ])
    expect(c!.dentroDeVentana).toBe(true)
  })

  it('fuera de las 24 horas usa la plantilla; los autorizados no los atiende el agente', async () => {
    const [conv] = await en((tx) => tx.select().from(whatsappConversaciones))
    await en((tx) =>
      tx
        .update(whatsappConversaciones)
        .set({ ultimoEntrante: new Date(Date.now() - 25 * 3_600_000) })
        .where(eq(whatsappConversaciones.id, conv.id)),
    )
    const meta = metaFalsa()
    expect((await enviarAConversacion(empresa, conv.id, 'Recordatorio de pago', { tipo: 'sistema' }, meta.f)).ok).toBe(true)
    expect(meta.enviados[0]).toMatchObject({ type: 'template', template: { name: 'aviso_general', language: { code: 'es_AR' } } })
    // A un número nuevo (por ejemplo, desde una factura) también va con plantilla.
    expect(
      (await enviarATelefono(empresa, '11 4444-3333', 'Tu factura', { tipo: 'usuario', usuarioId: ana }, null, meta.f)).ok,
    ).toBe(true)

    expect((await en((tx) => autorizar(tx, ana, empresa, { usuarioId: ana, telefono: '11 2222-3333' }))).ok).toBe(true)
    const cuerpo = aviso([
      {
        id: 'wamid.B',
        from: '5491122223333',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'image',
        image: { id: 'MEDIA1', mime_type: 'image/jpeg' },
      },
    ])
    const [n] = (await recibirAviso(clave, cuerpo, firmar(cuerpo)))!
    const [c] = await en((tx) => tx.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.id, n.conversacionId)))
    expect(c).toMatchObject({ usuarioId: ana, atiende: 'humano' })
    const [m] = await en((tx) => tx.select().from(whatsappMensajes).where(eq(whatsappMensajes.id, n.mensajeId)))
    expect(m).toMatchObject({ autor: 'usuario', tipo: 'image', medio: { id: 'MEDIA1', tipo: 'image/jpeg' } })
  })
})
