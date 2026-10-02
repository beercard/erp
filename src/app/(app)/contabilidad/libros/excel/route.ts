import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'
import { hojasLibros } from '@/modulos/contabilidad/libros'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Diario, sumas y saldos, resultados y situación patrimonial del rango, en una planilla. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const desde = q.get('desde') ?? ''
  const hasta = q.get('hasta') ?? ''
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return new Response('Fechas inválidas.', { status: 400 })
  try {
    const xlsx = escribirXlsx(await enLaEmpresa('contabilidad.ver', (tx) => hojasLibros(tx, desde, hasta)))
    return new Response(new Uint8Array(xlsx), {
      headers: {
        'Content-Type': TIPO_XLSX,
        'Content-Disposition': `attachment; filename="contabilidad-${desde}-a-${hasta}.xlsx"`,
      },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
