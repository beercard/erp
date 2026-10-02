import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'
import { sumarDias } from '@/modulos/servicio/agenda'
import { reporteFormulario, reporteTipoOrden } from '@/modulos/servicio/reportes'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Reporte por formulario en Excel: /servicio/reportes/tipo/{id} (órdenes) o /servicio/reportes/formulario/{id} (envíos). */
export async function GET(request: Request, { params }: RouteContext<'/servicio/reportes/[clase]/[id]'>) {
  const { clase, id } = await params
  if ((clase !== 'tipo' && clase !== 'formulario') || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response('No existe.', { status: 404 })
  const u = new URL(request.url)
  const hasta = FECHA.test(u.searchParams.get('hasta') ?? '') ? u.searchParams.get('hasta')! : hoyArgentina()
  const pedido = u.searchParams.get('desde') ?? ''
  const desde = FECHA.test(pedido) && pedido <= hasta ? pedido : sumarDias(hasta, -30)
  try {
    const hoja = await enLaEmpresa('servicio.cargar', (tx) =>
      clase === 'tipo' ? reporteTipoOrden(tx, id, desde, hasta) : reporteFormulario(tx, id, desde, hasta),
    )
    if (!hoja) return new Response('No existe.', { status: 404 })
    const archivo = `${hoja.nombre
      .normalize('NFD')
      .replace(/[^\w-]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase()}-${desde}-a-${hasta}.xlsx`
    return new Response(new Uint8Array(escribirXlsx([hoja])), {
      headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${archivo}"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
