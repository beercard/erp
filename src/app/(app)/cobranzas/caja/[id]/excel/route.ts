import { enLaEmpresa } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX, type Celda } from '@/lib/xlsx'
import { listarCierres, obtenerCierre } from '@/modulos/tesoreria/cierres'

const fecha = (d: Date) =>
  d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
const n = (v: string) => Number(v)

/** Un cierre (resumen, medios, cajeros y movimientos) o, con ?todos=1, la lista de cierres de esa caja. */
export async function GET(request: Request, { params }: RouteContext<'/cobranzas/caja/[id]/excel'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 })
  const todos = new URL(request.url).searchParams.get('todos') === '1'
  const hojas = await enLaEmpresa('ventas.ver', async (tx) => {
    const c = await obtenerCierre(tx, id)
    if (!c) return null
    if (todos) {
      const lista = await listarCierres(tx, { cuentaId: c.cuentaId })
      return [
        {
          nombre: 'Cierres',
          filas: [
            ['Desde', 'Hasta', 'Cerró', 'Esperado', 'Contado', 'Diferencia'],
            ...lista.map((x): Celda[] => [
              fecha(x.desde),
              fecha(x.hasta),
              x.usuario ?? '',
              n(x.esperado),
              n(x.contado),
              n(x.diferencia),
            ]),
          ],
        },
      ]
    }
    const r = c.resumen
    return [
      {
        nombre: 'Resumen',
        filas: [
          ['Concepto', 'Importe'],
          ['Caja', c.caja],
          ['Desde', fecha(new Date(c.desde))],
          ['Hasta', fecha(new Date(c.hasta))],
          ['Saldo inicial', n(c.saldoInicial)],
          ['Ingresos', n(c.ingresos)],
          ['Egresos', n(c.egresos)],
          ['Esperado', n(c.esperado)],
          ['Contado', n(c.contado)],
          ['Diferencia', n(c.diferencia)],
          ['Cobrado (todos los medios)', n(r.cobrado)],
          ['Recibos', r.recibos],
          ['Ventas facturadas', n(r.ventas.total)],
          ['Observaciones', c.observaciones ?? ''],
        ] as Celda[][],
      },
      {
        nombre: 'Por medio',
        filas: [['Medio', 'Recibos', 'Total'], ...r.porMedio.map((m): Celda[] => [m.nombre, m.recibos, n(m.total)])],
      },
      {
        nombre: 'Por cajero',
        filas: [['Cajero', 'Recibos', 'Total'], ...r.porCajero.map((m): Celda[] => [m.usuario, m.recibos, n(m.total)])],
      },
      {
        nombre: 'Movimientos',
        filas: [
          ['Hora', 'Detalle', 'Importe'],
          ...r.otrosMovimientos.map((m): Celda[] => [fecha(new Date(m.creado)), m.descripcion || m.tipo, n(m.importe)]),
        ],
      },
    ]
  })
  if (!hojas) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(escribirXlsx(hojas)), {
    headers: {
      'content-type': TIPO_XLSX,
      'content-disposition': `attachment; filename="${todos ? 'cierres-de-caja' : `cierre-de-caja-${id.slice(0, 8)}`}.xlsx"`,
    },
  })
}
