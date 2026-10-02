import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'
import { informeGestion } from '@/modulos/informes/gestion'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const u = new URL(request.url)
  const hasta = FECHA.test(u.searchParams.get('hasta') ?? '') ? u.searchParams.get('hasta')! : hoyArgentina()
  const pedido = u.searchParams.get('desde') ?? ''
  const desde = FECHA.test(pedido) && pedido <= hasta ? pedido : `${hasta.slice(0, 7)}-01`
  try {
    const d = await enLaEmpresa('informes.ver', (tx) => informeGestion(tx, { desde, hasta }))
    const xlsx = escribirXlsx([
      { nombre: 'Por mes', filas: [['Mes', 'Ventas netas'], ...d.meses.map((m) => [m.mes, m.neto])] },
      {
        nombre: 'Clientes',
        filas: [
          ['Código', 'Cliente', 'Comprobantes', 'Ventas netas'],
          ...d.clientes.map((c) => [c.codigo, c.nombre, c.comprobantes, c.neto]),
        ],
      },
      {
        nombre: 'Artículos',
        filas: [
          ['Código', 'Artículo', 'Cantidad', 'Ventas netas'],
          ...d.articulos.map((a) => [a.codigo, a.nombre, a.cantidad, a.neto]),
        ],
      },
      {
        nombre: 'Vendedores',
        filas: [['Vendedor', 'Comprobantes', 'Ventas netas'], ...d.vendedores.map((v) => [v.nombre, v.comprobantes, v.neto])],
      },
      {
        nombre: 'Proveedores',
        filas: [
          ['Código', 'Proveedor', 'Comprobantes', 'Compras netas'],
          ...d.proveedores.map((p) => [p.codigo, p.nombre, p.comprobantes, p.neto]),
        ],
      },
    ])
    return new Response(new Uint8Array(xlsx), {
      headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="informe-${desde}-a-${hasta}.xlsx"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
