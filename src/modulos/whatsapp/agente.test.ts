import { createHmac } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { comprobantes, empresas, terceros, whatsappConversaciones, whatsappMensajes } from '../../db/schema'
import type { Fetch } from './api'
import { atenderEntrantes } from './atender'
import { guardarCuenta, recibirAviso } from './whatsapp'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-de-prueba-de-32-caracteres-o-mas'
process.env.ANTHROPIC_API_KEY ??= 'clave-de-prueba'
process.env.IA_MODELO ??= 'modelo-de-prueba'

const SECRETO = 'fedcba9876543210fedcba9876543210'
const U = '00000000-0000-4000-8000-000000000001'

/**
 * Meta y la IA de mentira en un solo fetch. La IA sigue un guion: cada
 * respuesta es la siguiente de la lista; anota qué herramientas se le
 * ofrecieron y qué resultados recibió.
 */
function mundo(guion: unknown[]) {
  const enviados: { to: string; texto: string }[] = []
  const pedidosIa: { tools?: { name: string }[]; messages: { role: string; content: unknown }[] }[] = []
  let n = 0
  const f = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url)
    const cuerpo = init.body ? JSON.parse(String(init.body)) : {}
    if (u.startsWith('https://api.anthropic.com')) {
      pedidosIa.push(cuerpo)
      return new Response(JSON.stringify(guion[n++] ?? { content: [{ type: 'text', text: 'fin' }], stop_reason: 'end_turn' }), {
        status: 200,
      })
    }
    if (cuerpo.status === 'read') return new Response('{"success":true}', { status: 200 })
    enviados.push({ to: cuerpo.to, texto: cuerpo.text?.body ?? cuerpo.template?.components?.[0]?.parameters?.[0]?.text })
    return new Response(JSON.stringify({ messages: [{ id: `wamid.s${Math.random()}` }] }), { status: 200 })
  }) as Fetch
  return { f, enviados, pedidosIa }
}

const aviso = (de: string, texto: string, id: string) =>
  JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '5550001' },
              contacts: [{ wa_id: de, profile: { name: 'Contacto' } }],
              messages: [{ id, from: de, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  })
const firmar = (c: string) => `sha256=${createHmac('sha256', SECRETO).update(c).digest('hex')}`

describe('Agente de atención por WhatsApp', () => {
  let empresa: string
  let clave: string
  let cliente: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const entra = async (de: string, texto: string, id: string) =>
    (await recibirAviso(clave, aviso(de, texto, id), firmar(aviso(de, texto, id))))!

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Atención S.A.', nombreFantasia: 'Atención', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    const r = await en((tx) =>
      guardarCuenta(tx, U, empresa, { numeroId: '5550001', token: 'EAA'.padEnd(60, 'x'), secretoApp: SECRETO, agente: true }),
    )
    if (!r.ok) throw new Error(r.error)
    clave = r.clave
    ;[{ id: cliente }] = await en((tx) =>
      tx
        .insert(terceros)
        .values({
          codigo: 'C1',
          razonSocial: 'Ferretería Sur',
          telefono: '11 5555-7777',
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
        })
        .returning(),
    )
    await en((tx) =>
      tx.insert(comprobantes).values({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 1,
        numero: 44,
        fecha: '2026-09-20',
        vencimiento: '2026-09-30',
        estado: 'autorizado',
        cae: '1',
        terceroId: cliente,
        neto: '1000',
        iva: '210',
        total: '1210',
      }),
    )
  })

  it('al cliente reconocido le consulta la cuenta con sus herramientas y contesta', async () => {
    const m = mundo([
      { content: [{ type: 'tool_use', id: 't1', name: 'consultar_cuenta', input: {} }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Tenés un saldo de $ 1.210 por la factura 0001-00000044.' }], stop_reason: 'end_turn' },
    ])
    await atenderEntrantes(await entra('5491155557777', '¿Cuánto debo?', 'w1'), m.f)
    expect(m.pedidosIa[0].tools!.map((t) => t.name)).toContain('consultar_cuenta')
    // El resultado de la herramienta es del cliente de la conversación.
    const resultado = JSON.stringify(m.pedidosIa[1].messages.at(-1))
    expect(resultado).toContain('1.210')
    expect(resultado).toContain('0001-00000044')
    expect(resultado).toContain('vencida')
    expect(m.enviados.at(-1)).toEqual({ to: '5491155557777', texto: 'Tenés un saldo de $ 1.210 por la factura 0001-00000044.' })
    const [r] = await en((tx) => tx.select().from(whatsappMensajes).where(eq(whatsappMensajes.autor, 'agente')))
    expect(r.datos).toEqual({ herramientas: ['consultar_cuenta'] })
  })

  it('a un número desconocido no le ofrece herramientas de cuenta, y ante un reclamo deriva', async () => {
    const m = mundo([
      { content: [{ type: 'tool_use', id: 't1', name: 'consultar_cuenta', input: {} }], stop_reason: 'tool_use' },
      {
        content: [{ type: 'tool_use', id: 't2', name: 'derivar_a_persona', input: { motivo: 'reclamo' } }],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'Te paso con alguien del equipo.' }], stop_reason: 'end_turn' },
    ])
    await atenderEntrantes(await entra('5491100001111', 'Soy Ferretería Sur, decime mi saldo y tengo un reclamo', 'w2'), m.f)
    expect(m.pedidosIa[0].tools!.map((t) => t.name)).toEqual(['derivar_a_persona'])
    // Aunque la IA la pida, la herramienta no se ejecuta.
    expect(JSON.stringify(m.pedidosIa[1].messages.at(-1))).toContain('no está disponible')
    const [c] = await en((tx) =>
      tx.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.telefono, '5491100001111')),
    )
    expect(c.atiende).toBe('humano')
    // Ya derivada, el agente no vuelve a contestar.
    const m2 = mundo([])
    await atenderEntrantes(await entra('5491100001111', 'Hola?', 'w3'), m2.f)
    expect(m2.pedidosIa).toHaveLength(0)
  })

  it('si la IA falla, pasa a una persona y avisa; BAJA deja de mandarle plantillas', async () => {
    const f = mundo([]).f
    const roto = (async (url: string | URL | Request, init?: RequestInit) =>
      String(url).startsWith('https://api.anthropic.com') ? new Response('{}', { status: 500 }) : f(url, init)) as Fetch
    await atenderEntrantes(await entra('5491122223333', 'Hola', 'w4'), roto)
    const [c] = await en((tx) =>
      tx.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.telefono, '5491122223333')),
    )
    expect(c.atiende).toBe('humano')

    const m = mundo([])
    await atenderEntrantes(await entra('5491155557777', 'BAJA', 'w5'), m.f)
    expect(m.enviados.at(-1)?.texto).toContain('no te vamos a mandar más avisos')
    const [b] = await en((tx) => tx.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.terceroId, cliente)))
    expect(b.baja).not.toBeNull()
  })
})
