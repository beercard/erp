import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'
import { PERIODO } from '@/modulos/impuestos/presentaciones'
import { baseIibb, percepcionesPracticadas, percepcionesSufridas, retencionesSufridas } from '@/modulos/impuestos/retenciones'

export async function GET(request: Request) {
  const periodo = new URL(request.url).searchParams.get('periodo') ?? ''
  if (!PERIODO.test(periodo)) return new Response('Período inválido.', { status: 400 })
  try {
    const d = await enLaEmpresa('impuestos.libros', async (tx) => ({
      base: await baseIibb(tx, periodo),
      percepciones: await percepcionesPracticadas(tx, periodo),
      sufridas: (await percepcionesSufridas(tx, periodo)).filter((p) => p.tipo === 'percepcion_iibb'),
      retenidas: (await retencionesSufridas(tx, periodo)).filter((r) => r.impuesto === 'iibb'),
    }))
    const xlsx = escribirXlsx([
      {
        nombre: 'Base por provincia',
        filas: [
          ['Provincia', 'Comprobantes', 'Ventas netas', '%'],
          ...d.base.lista.map((f) => [f.jurisdiccion ?? 'Sin provincia', f.cantidad, f.neto, f.porcentaje]),
        ],
      },
      {
        nombre: 'Percepciones cobradas',
        filas: [
          ['Fecha', 'Comprobante', 'Cliente', 'CUIT', 'Jurisdicción', 'Base', 'Alícuota', 'Percibido'],
          ...d.percepciones.map((p) => [
            p.fecha,
            p.comprobante,
            p.cliente,
            p.cuit,
            p.jurisdiccion,
            p.base,
            p.alicuota,
            p.importe,
          ]),
        ],
      },
      {
        nombre: 'Percepciones sufridas',
        filas: [
          ['Jurisdicción', 'Comprobantes', 'Importe'],
          ...d.sufridas.map((s) => [s.jurisdiccion ?? 'Sin jurisdicción', s.cantidad, s.importe]),
        ],
      },
      {
        nombre: 'Retenciones sufridas',
        filas: [
          ['Fecha', 'Recibo', 'Cliente', 'CUIT', 'Certificado', 'Importe'],
          ...d.retenidas.map((r) => [r.fecha, r.recibo, r.cliente, r.cuit, r.certificado, r.importe]),
        ],
      },
    ])
    return new Response(new Uint8Array(xlsx), {
      headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="iibb-${periodo}.xlsx"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
