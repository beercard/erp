import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { archivoCotDeRemito } from '@/modulos/comercial/cot'

/** El archivo del COT del remito, para presentarlo a mano en la web de ARBA. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado.', { status: 404 })
  const q = new URL(request.url).searchParams
  try {
    const empresaId = await enLaEmpresa('ventas.remitos', async (_, s) => s.empresa.id)
    const r = await archivoCotDeRemito(
      empresaId,
      id,
      { patente: q.get('patente') ?? '', salida: q.get('salida') ?? '', hora: q.get('hora') ?? '' },
      hoyArgentina(),
    )
    if ('error' in r) return new Response(r.error, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    return new Response(Buffer.from(r.contenido, 'latin1'), {
      headers: {
        'Content-Type': 'text/plain; charset=iso-8859-1',
        'Content-Disposition': `attachment; filename="${r.nombre}"`,
      },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response(e.message, { status: 403 })
    throw e
  }
}
