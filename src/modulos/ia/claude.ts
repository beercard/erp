/**
 * Cliente mínimo de la API de mensajes de Claude (Anthropic), con fetch.
 * Lo usan la lectura de facturas y el agente de atención por WhatsApp.
 *
 * Variables del servidor: ANTHROPIC_API_KEY y IA_MODELO (el identificador
 * del modelo a usar). Sin las dos, las funciones con IA quedan apagadas.
 */

export type Fetch = typeof fetch

export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY && process.env.IA_MODELO)

export type Bloque =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export type Mensaje = { role: 'user' | 'assistant'; content: string | Bloque[] }

export type Herramienta = { name: string; description: string; input_schema: Record<string, unknown> }

export type Respuesta = {
  content: Bloque[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'refusal' | string
  usage?: { input_tokens: number; output_tokens: number }
}

export class ErrorIa extends Error {}

export async function preguntar(
  f: Fetch,
  p: {
    sistema: string
    mensajes: Mensaje[]
    herramientas?: Herramienta[]
    /** Obliga a usar esa herramienta (para respuestas estructuradas). */
    forzar?: string
    maximo?: number
  },
): Promise<Respuesta> {
  if (!iaConfigurada()) throw new ErrorIa('La IA no está configurada en el servidor (ANTHROPIC_API_KEY e IA_MODELO).')
  let r: Response
  try {
    r = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.IA_MODELO,
        max_tokens: p.maximo ?? 1500,
        system: p.sistema,
        messages: p.mensajes,
        ...(p.herramientas?.length ? { tools: p.herramientas } : {}),
        ...(p.forzar ? { tool_choice: { type: 'tool', name: p.forzar } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    throw new ErrorIa(`No se pudo conectar con la IA (${e instanceof Error ? e.message : 'sin respuesta'}).`)
  }
  const texto = await r.text()
  if (!r.ok) {
    let detalle = texto.slice(0, 200)
    try {
      detalle = (JSON.parse(texto) as { error?: { message?: string } }).error?.message ?? detalle
    } catch {
      // No era JSON.
    }
    throw new ErrorIa(`La IA respondió ${r.status}: ${detalle}`)
  }
  return JSON.parse(texto) as Respuesta
}

/** El texto de una respuesta (sin las llamadas a herramientas). */
export const textoDe = (r: Respuesta) =>
  r.content
    .filter((b): b is Extract<Bloque, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
