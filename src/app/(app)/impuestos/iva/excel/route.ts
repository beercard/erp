import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'
import { hojasSubdiarios } from '@/modulos/impuestos/planillas'
import { PERIODO } from '@/modulos/impuestos/presentaciones'

/** Subdiarios de IVA ventas y compras del mes (en pesos; las notas de crédito en negativo). */
export async function GET(request: Request) {
  const periodo = new URL(request.url).searchParams.get('periodo') ?? ''
  if (!PERIODO.test(periodo)) return new Response('Período inválido.', { status: 400 })
  try {
    const xlsx = escribirXlsx(await enLaEmpresa('impuestos.libros', (tx) => hojasSubdiarios(tx, periodo)))
    return new Response(new Uint8Array(xlsx), {
      headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="subdiarios-iva-${periodo}.xlsx"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
