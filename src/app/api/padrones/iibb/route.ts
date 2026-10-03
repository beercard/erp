import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { FORMATOS_PADRON, importarPadron, renglones, type FormatoPadron } from '@/modulos/impuestos/padronesIibb'

/**
 * Importación de un padrón de IIBB: el archivo llega como cuerpo del pedido
 * y se lee de corrido (puede pesar cientos de MB), sin guardarlo. Está fuera
 * del proxy para que el cuerpo no se copie en memoria; la sesión y el
 * permiso se controlan acá, y solo se aceptan pedidos de la misma página.
 */
export const maxDuration = 300

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request: Request) {
  // Se compara con el Host del pedido: dentro del contenedor request.url es http://localhost:3000.
  const origen = request.headers.get('origin')
  const host = request.headers.get('host')
  let mismo = false
  try {
    mismo = !!origen && !!host && new URL(origen).host === host
  } catch {}
  if (!mismo) return Response.json({ error: 'Origen no permitido.' }, { status: 403 })
  const u = new URL(request.url)
  const formato = u.searchParams.get('formato') as FormatoPadron
  if (!(formato in FORMATOS_PADRON) || !request.body)
    return Response.json({ error: 'Falta el archivo o el formato.' }, { status: 400 })
  const opciones = {
    provincia: u.searchParams.get('provincia')?.slice(0, 2) || undefined,
    desde: FECHA.test(u.searchParams.get('desde') ?? '') ? u.searchParams.get('desde')! : undefined,
    hasta: FECHA.test(u.searchParams.get('hasta') ?? '') ? u.searchParams.get('hasta')! : undefined,
  }
  let empresaId: string
  try {
    empresaId = await enLaEmpresa('empresa.datos', async (_, s) => s.empresa.id)
  } catch (e) {
    if (e instanceof SinPermiso) return Response.json({ error: e.message }, { status: 403 })
    throw e
  }
  // Los padrones vienen en Latin-1 (ISO-8859-1).
  const texto = request.body.pipeThrough(new TextDecoderStream('latin1'))
  const r = await importarPadron(empresaId, formato, renglones(trozos(texto)), opciones)
  return Response.json(r, { status: r.ok ? 200 : 400 })
}

async function* trozos(flujo: ReadableStream<string>) {
  const lector = flujo.getReader()
  for (;;) {
    const { done, value } = await lector.read()
    if (done) return
    yield value
  }
}
