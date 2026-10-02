import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'
import { PERIODO } from '@/modulos/impuestos/presentaciones'
import { retencionesPracticadas, retencionesSufridas } from '@/modulos/impuestos/retenciones'

export async function GET(request: Request) {
  const periodo = new URL(request.url).searchParams.get('periodo') ?? ''
  if (!PERIODO.test(periodo)) return new Response('Período inválido.', { status: 400 })
  try {
    const [p, s] = await enLaEmpresa('impuestos.libros', (tx) =>
      Promise.all([retencionesPracticadas(tx, periodo), retencionesSufridas(tx, periodo)]),
    )
    const xlsx = escribirXlsx([
      {
        nombre: 'Practicadas',
        filas: [
          ['Fecha', 'Impuesto', 'Régimen', 'Certificado', 'Orden de pago', 'Proveedor', 'CUIT', 'Base', 'Alícuota', 'Retenido'],
          ...p.map((r) => [
            r.fecha,
            r.impuesto,
            r.regimen,
            r.certificado,
            r.pago,
            r.proveedor,
            r.cuit,
            Number(r.base),
            r.alicuota === null ? null : Number(r.alicuota),
            Number(r.importe),
          ]),
        ],
      },
      {
        nombre: 'Sufridas',
        filas: [
          ['Fecha', 'Impuesto', 'Recibo', 'Cliente', 'CUIT', 'Certificado', 'Importe'],
          ...s.map((r) => [r.fecha, r.impuesto, r.recibo, r.cliente, r.cuit, r.certificado, r.importe]),
        ],
      },
    ])
    return new Response(new Uint8Array(xlsx), {
      headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="retenciones-${periodo}.xlsx"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
