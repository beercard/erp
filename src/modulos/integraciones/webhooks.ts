import { createHmac, randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { and, asc, desc, eq, lte, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { webhookEntregas, webhooks } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { primerError } from '../comercial/documentos'

/**
 * Webhooks: cuando pasa algo (se abre, programa, informa o cierra una orden,
 * un cliente responde la encuesta), se le avisa por POST a las direcciones
 * que la empresa configuró. Como los correos: el aviso se encola en la misma
 * transacción y se manda después, con reintentos (1, 2, 4… minutos; hasta 8).
 *
 * Cada envío va firmado: encabezado X-ERP-Firma: t=<segundos>,v1=<hex>, con
 * v1 = HMAC-SHA256(secreto, "<t>.<cuerpo>"). El receptor recalcula y compara
 * (y descarta los de hace más de 5 minutos).
 */

export { EVENTOS, type Evento }
import { EVENTOS, type Evento } from './eventos'

const MAXIMO_INTENTOS = 8

/** Encola el evento para cada webhook activo suscripto. No hace red: eso es entregarPendientes. */
export async function emitir(tx: Transaccion, evento: Evento, datos: Record<string, unknown>) {
  const destinos = await tx
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.activo, true), sql`${evento} = any(${webhooks.eventos})`))
  if (destinos.length) {
    await tx.insert(webhookEntregas).values(destinos.map((d) => ({ webhookId: d.id, evento, datos })))
  }
  return destinos.length
}

// --------------------------------------------------------- Configuración

/** No se aceptan direcciones internas (la red del servidor): solo con WEBHOOKS_PERMITIR_LOCAL, para desarrollo. */
const PRIVADA =
  /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd]|fe80:)/i
export async function direccionPermitida(url: string): Promise<string | null> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'La dirección no es válida.'
  }
  if (!['http:', 'https:'].includes(u.protocol)) return 'La dirección tiene que empezar con https://.'
  if (process.env.WEBHOOKS_PERMITIR_LOCAL) return null
  if (u.protocol !== 'https:') return 'La dirección tiene que ser https://.'
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal'))
    return 'No se puede apuntar a la red interna.'
  try {
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
    if (ips.some((ip) => PRIVADA.test(ip))) return 'No se puede apuntar a la red interna.'
  } catch {
    return 'No se encuentra esa dirección.'
  }
  return null
}

const Esquema = z.object({
  url: z.string().trim().max(500),
  eventos: z.array(z.enum(Object.keys(EVENTOS) as [Evento, ...Evento[]])).min(1, { error: 'Elegí al menos un evento.' }),
  descripcion: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => v || null),
  activo: z.boolean().default(true),
})

export async function guardarWebhook(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const problema = await direccionPermitida(p.data.url)
  if (problema) return { ok: false as const, error: problema }
  if (id) {
    const [w] = await tx.update(webhooks).set(p.data).where(eq(webhooks.id, id)).returning({ id: webhooks.id })
    if (!w) return { ok: false as const, error: 'Ese webhook ya no existe.' }
    await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'webhook', entidadId: id, despues: p.data })
    return { ok: true as const, id, secreto: null }
  }
  const secreto = `whsec_${randomBytes(24).toString('base64url')}`
  const [w] = await tx
    .insert(webhooks)
    .values({ ...p.data, secreto })
    .returning({ id: webhooks.id })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'webhook', entidadId: w.id, despues: p.data })
  return { ok: true as const, id: w.id, secreto }
}

export async function borrarWebhook(tx: Transaccion, usuarioId: string, id: string) {
  await tx.delete(webhooks).where(eq(webhooks.id, id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'webhook', entidadId: id })
  return { ok: true as const }
}

export async function listarWebhooks(tx: Transaccion) {
  const lista = await tx.select().from(webhooks).orderBy(asc(webhooks.creado))
  const ultimas = await tx.select().from(webhookEntregas).orderBy(desc(webhookEntregas.creado)).limit(30)
  return { lista: lista.map(({ secreto, ...w }) => ({ ...w, secretoFinal: secreto.slice(-6) })), ultimas }
}

/** Reintento manual (por ejemplo, después de arreglar el receptor). */
export async function reintentarEntrega(tx: Transaccion, id: string) {
  await tx.update(webhookEntregas).set({ estado: 'pendiente', proximoIntento: new Date() }).where(eq(webhookEntregas.id, id))
}

// ----------------------------------------------------------------- Envío

export function firmar(secreto: string, cuerpo: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')}`
}

/** Manda los envíos pendientes de una empresa que ya tocan. Cada resultado se guarda en su propia transacción. */
export async function entregarPendientes(empresaId: string, limite = 50) {
  const ahora = new Date()
  const lote = await conEmpresa(empresaId, (tx) =>
    tx
      .select({ e: webhookEntregas, url: webhooks.url, secreto: webhooks.secreto })
      .from(webhookEntregas)
      .innerJoin(webhooks, eq(webhooks.id, webhookEntregas.webhookId))
      .where(and(eq(webhookEntregas.estado, 'pendiente'), lte(webhookEntregas.proximoIntento, ahora), eq(webhooks.activo, true)))
      .orderBy(asc(webhookEntregas.creado))
      .limit(limite),
  )
  let entregados = 0
  let fallidos = 0
  for (const { e, url, secreto } of lote) {
    const cuerpo = JSON.stringify({ id: e.id, evento: e.evento, fecha: e.creado.toISOString(), datos: e.datos })
    let ok = false
    let respuesta = ''
    try {
      const problema = await direccionPermitida(url)
      if (problema) throw new Error(problema)
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ERP-Webhooks/1',
          'X-ERP-Evento': e.evento,
          'X-ERP-Entrega': e.id,
          'X-ERP-Firma': firmar(secreto, cuerpo),
        },
        body: cuerpo,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      ok = r.status >= 200 && r.status < 300
      respuesta = `${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`.trim()
    } catch (err) {
      respuesta = String((err as Error).message ?? err).slice(0, 200)
    }
    const intentos = e.intentos + 1
    await conEmpresa(empresaId, (tx) =>
      tx
        .update(webhookEntregas)
        .set(
          ok
            ? { estado: 'entregado', intentos, respuesta, entregado: new Date() }
            : {
                estado: intentos >= MAXIMO_INTENTOS ? 'fallido' : 'pendiente',
                intentos,
                respuesta,
                proximoIntento: new Date(Date.now() + 2 ** (intentos - 1) * 60_000),
              },
        )
        .where(eq(webhookEntregas.id, e.id)),
    )
    if (ok) entregados++
    else fallidos++
  }
  return { entregados, fallidos }
}
