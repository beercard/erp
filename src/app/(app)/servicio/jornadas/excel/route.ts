import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'
import { sumarDias } from '@/modulos/servicio/agenda'
import { jornadas } from '@/modulos/servicio/jornada'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const hora = (d: Date | null) =>
  d
    ? d.toLocaleTimeString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : ''

/** Las jornadas en Excel. */
export async function GET(request: Request) {
  const u = new URL(request.url)
  const hasta = FECHA.test(u.searchParams.get('hasta') ?? '') ? u.searchParams.get('hasta')! : hoyArgentina()
  const pedido = u.searchParams.get('desde') ?? ''
  const desde = FECHA.test(pedido) && pedido <= hasta ? pedido : sumarDias(hasta, -6)
  try {
    const filas = await enLaEmpresa('servicio.cargar', (tx) =>
      jornadas(tx, desde, sumarDias(desde, 366) < hasta ? sumarDias(desde, 366) : hasta),
    )
    const xlsx = escribirXlsx([
      {
        nombre: 'Jornadas',
        filas: [
          ['Día', 'Técnico', 'Entrada', 'Salida', 'Horas', 'Km (GPS)', 'Visitas', 'Hechas', 'Minutos en clientes'],
          ...filas.map((f) => [
            f.fecha,
            f.tecnico,
            hora(f.entrada),
            hora(f.salida),
            f.minutos === null ? null : Math.round((f.minutos / 60) * 100) / 100,
            f.km,
            f.visitas,
            f.hechas,
            f.minutosEnClientes,
          ]),
        ],
      },
    ])
    return new Response(new Uint8Array(xlsx), {
      headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="jornadas-${desde}-a-${hasta}.xlsx"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
