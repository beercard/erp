import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * WhatsApp Cloud API (Graph de Meta). Solo lo que usa el ERP: mandar texto
 * y plantillas, bajar los archivos que manda el contacto y verificar la
 * firma de los avisos. fetch inyectable para las pruebas.
 */

export type Fetch = typeof fetch
export type CredencialesWA = { numeroId: string; token: string }

export const VERSION_WA = () => process.env.WHATSAPP_API_VERSION || 'v26.0'
const graph = () => `https://graph.facebook.com/${VERSION_WA()}`

/** Tope de los archivos que se bajan (facturas en foto o PDF). */
export const TAMANO_MAXIMO_MEDIO = 15 * 1024 * 1024

export class ErrorWhatsapp extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: number,
  ) {
    super(mensaje)
  }
}

async function pedir<T>(f: Fetch, url: string, token: string, init: RequestInit = {}): Promise<T> {
  let r: Response
  try {
    r = await f(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new ErrorWhatsapp(`No se pudo conectar con WhatsApp (${e instanceof Error ? e.message : 'sin respuesta'}).`)
  }
  const texto = (await r.text()).slice(0, 1_000_000)
  if (!r.ok) {
    let mensaje = texto.slice(0, 300)
    let codigo: number | undefined
    try {
      const j = JSON.parse(texto) as { error?: { message?: string; code?: number; error_data?: { details?: string } } }
      mensaje = j.error?.error_data?.details ?? j.error?.message ?? mensaje
      codigo = j.error?.code
    } catch {
      // No era JSON.
    }
    // 131047: pasaron más de 24 horas desde el último mensaje del contacto.
    if (codigo === 131047)
      mensaje = 'Pasaron más de 24 horas desde el último mensaje del contacto: hay que usar una plantilla aprobada.'
    if (r.status === 401) mensaje = 'WhatsApp rechazó el token: hay que generarlo de nuevo.'
    throw new ErrorWhatsapp(mensaje, codigo)
  }
  return (texto ? JSON.parse(texto) : null) as T
}

/**
 * Número como lo usa WhatsApp: solo dígitos y con código de país. Los
 * argentinos se escriben de mil formas ("011 15 5555-0000", "+54 9 11…"):
 * todos quedan 549 + característica + número (10 dígitos), sin 0 ni 15.
 */
export function normalizarTelefono(t: string) {
  let d = t.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (!d) return ''
  const argentino = d.startsWith('54') || d.startsWith('0') || d.length <= 12
  if (!argentino) return d
  if (d.startsWith('54')) d = d.slice(2).replace(/^9/, '')
  d = d.replace(/^0/, '')
  // El "15" de los celulares va después de la característica (de 2 a 4 dígitos).
  if (d.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (d.slice(largo, largo + 2) === '15') {
        d = d.slice(0, largo) + d.slice(largo + 2)
        break
      }
    }
  }
  return d.length === 10 ? `549${d}` : d
}

/** Mismo número aunque uno tenga el 9 de celular y otro no (Argentina): se comparan los últimos 10 dígitos. */
export const mismoTelefono = (a: string, b: string) => {
  const x = a.replace(/\D/g, '')
  const y = b.replace(/\D/g, '')
  return x.length >= 8 && y.length >= 8 && x.slice(-10) === y.slice(-10)
}

type Envio = { messages?: { id: string }[] }

export async function enviarTexto(f: Fetch, c: CredencialesWA, para: string, texto: string) {
  const r = await pedir<Envio>(f, `${graph()}/${encodeURIComponent(c.numeroId)}/messages`, c.token, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'text',
      text: { body: texto.slice(0, 4096), preview_url: /https?:\/\//.test(texto) },
    }),
  })
  return r.messages?.[0]?.id ?? null
}

/** Plantilla aprobada con un parámetro de texto en el cuerpo: para escribir fuera de las 24 horas. */
export async function enviarPlantilla(
  f: Fetch,
  c: CredencialesWA,
  para: string,
  plantilla: string,
  idioma: string,
  texto: string,
) {
  const r = await pedir<Envio>(f, `${graph()}/${encodeURIComponent(c.numeroId)}/messages`, c.token, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'template',
      template: {
        name: plantilla,
        language: { code: idioma },
        components: [{ type: 'body', parameters: [{ type: 'text', text: texto.slice(0, 1000) }] }],
      },
    }),
  })
  return r.messages?.[0]?.id ?? null
}

/** Marca el mensaje como leído (los dos tildes azules del lado del contacto). */
export async function marcarLeido(f: Fetch, c: CredencialesWA, mensajeId: string) {
  await pedir(f, `${graph()}/${encodeURIComponent(c.numeroId)}/messages`, c.token, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: mensajeId }),
  }).catch(() => null)
}

/** Baja un archivo que mandó el contacto: primero se pide su dirección (dura unos minutos) y después los bytes. */
export async function bajarMedio(f: Fetch, c: CredencialesWA, medioId: string) {
  const info = await pedir<{ url: string; mime_type: string; file_size?: number }>(
    f,
    `${graph()}/${encodeURIComponent(medioId)}`,
    c.token,
  )
  if ((info.file_size ?? 0) > TAMANO_MAXIMO_MEDIO) throw new ErrorWhatsapp('El archivo es muy grande (hasta 15 MB).')
  const u = new URL(info.url)
  // Solo de los servidores de Meta: el token no puede viajar a otro lado.
  if (u.protocol !== 'https:' || !/(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net|fbcdn\.net)$/.test(u.hostname)) {
    throw new ErrorWhatsapp('La dirección del archivo no es de WhatsApp.')
  }
  const r = await f(info.url, { headers: { authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new ErrorWhatsapp(`No se pudo bajar el archivo (${r.status}).`)
  const datos = Buffer.from(await r.arrayBuffer())
  if (datos.length > TAMANO_MAXIMO_MEDIO) throw new ErrorWhatsapp('El archivo es muy grande (hasta 15 MB).')
  return { datos, tipo: info.mime_type }
}

/** Prueba las credenciales: devuelve el número y el nombre verificado. */
export async function probarNumero(f: Fetch, c: CredencialesWA) {
  return pedir<{ display_phone_number?: string; verified_name?: string }>(
    f,
    `${graph()}/${encodeURIComponent(c.numeroId)}?fields=display_phone_number,verified_name`,
    c.token,
  )
}

/** Avisos: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 (hex) del cuerpo crudo con el app secret. */
export function firmaValida(cuerpo: string, firma: string | null, secreto: string) {
  if (!firma?.startsWith('sha256=')) return false
  const esperada = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('hex'))
  const recibida = Buffer.from(firma.slice(7).toLowerCase())
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

// ------------------------------------------------------------------ Avisos entrantes

export type MensajeEntrante = {
  externoId: string
  de: string
  nombre: string | null
  fecha: Date
  tipo: string
  texto: string | null
  medio: { id: string; tipo: string; nombre?: string | null } | null
}

export type EstadoSaliente = { externoId: string; estado: string; error: string | null }

type Aviso = {
  object?: string
  entry?: {
    changes?: {
      field?: string
      value?: {
        metadata?: { phone_number_id?: string }
        contacts?: { wa_id?: string; profile?: { name?: string } }[]
        messages?: {
          id: string
          from: string
          timestamp: string
          type: string
          text?: { body?: string }
          image?: { id: string; mime_type?: string; caption?: string }
          document?: { id: string; mime_type?: string; filename?: string; caption?: string }
          audio?: { id: string; mime_type?: string }
          video?: { id: string; mime_type?: string; caption?: string }
          button?: { text?: string }
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
        }[]
        statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[]
      }
    }[]
  }[]
}

/** Traduce el aviso de Meta: mensajes nuevos y cambios de estado de los enviados, del número indicado. */
export function leerAviso(cuerpo: unknown, numeroId: string) {
  const a = cuerpo as Aviso
  const mensajes: MensajeEntrante[] = []
  const estados: EstadoSaliente[] = []
  for (const e of a.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value
      if (!v || v.metadata?.phone_number_id !== numeroId) continue
      for (const m of v.messages ?? []) {
        const contacto = v.contacts?.find((x) => x.wa_id === m.from) ?? v.contacts?.[0]
        const medio = m.image ?? m.document ?? m.audio ?? m.video
        mensajes.push({
          externoId: m.id,
          de: m.from.replace(/\D/g, ''),
          nombre: contacto?.profile?.name ?? null,
          fecha: new Date(Number(m.timestamp) * 1000),
          tipo: ['text', 'image', 'document', 'audio', 'video', 'button', 'interactive'].includes(m.type) ? m.type : 'otro',
          texto:
            m.text?.body ??
            m.image?.caption ??
            m.document?.caption ??
            m.video?.caption ??
            m.button?.text ??
            m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title ??
            null,
          medio: medio
            ? {
                id: medio.id,
                tipo: medio.mime_type ?? 'application/octet-stream',
                nombre: (medio as { filename?: string }).filename ?? null,
              }
            : null,
        })
      }
      for (const s of v.statuses ?? []) {
        const estado = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' }[s.status]
        if (estado) estados.push({ externoId: s.id, estado, error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null })
      }
    }
  }
  return { mensajes, estados }
}
