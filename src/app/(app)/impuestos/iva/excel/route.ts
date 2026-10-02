import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX, type Hoja } from '@/lib/xlsx'
import { libroCompras, libroVentas, type FilaSubdiario } from '@/modulos/impuestos/libroIva'
import { PERIODO } from '@/modulos/impuestos/presentaciones'

const hoja = (nombre: string, filas: FilaSubdiario[], tercero: string): Hoja => {
  const suma = (k: keyof FilaSubdiario) => Math.round(filas.reduce((s, f) => s + (f[k] as number), 0) * 100) / 100
  return {
    nombre,
    filas: [
      [
        'Fecha',
        'Comprobante',
        tercero,
        'Documento',
        'Neto gravado',
        'No gravado',
        'Exento',
        'IVA',
        'Percepciones y otros',
        'Total',
      ],
      ...filas.map((f) => [
        f.fecha,
        f.comprobante,
        f.tercero,
        f.documento,
        f.neto,
        f.noGravado,
        f.exento,
        f.iva,
        f.percepciones,
        f.total,
      ]),
      [
        null,
        'Total',
        null,
        null,
        suma('neto'),
        suma('noGravado'),
        suma('exento'),
        suma('iva'),
        suma('percepciones'),
        suma('total'),
      ],
    ],
  }
}

/** Subdiarios de IVA ventas y compras del mes (en pesos; las notas de crédito en negativo). */
export async function GET(request: Request) {
  const periodo = new URL(request.url).searchParams.get('periodo') ?? ''
  if (!PERIODO.test(periodo)) return new Response('Período inválido.', { status: 400 })
  try {
    const [v, c] = await enLaEmpresa('impuestos.libros', (tx) =>
      Promise.all([libroVentas(tx, periodo), libroCompras(tx, periodo)]),
    )
    const xlsx = escribirXlsx([hoja('IVA Ventas', v.filas, 'Cliente'), hoja('IVA Compras', c.filas, 'Proveedor')])
    return new Response(new Uint8Array(xlsx), {
      headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="subdiarios-iva-${periodo}.xlsx"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
