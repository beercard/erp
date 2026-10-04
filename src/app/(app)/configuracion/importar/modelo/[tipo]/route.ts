import { exigirPermiso } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'

import { esTipoImportacion, IMPORTACIONES } from '../../tipos'

/** GET /configuracion/importar/modelo/<tipo>: la planilla modelo, con una hoja que explica cada columna. */
export async function GET(_: Request, { params }: RouteContext<'/configuracion/importar/modelo/[tipo]'>) {
  const { tipo } = await params
  if (!esTipoImportacion(tipo)) return new Response('No existe.', { status: 404 })
  const imp = IMPORTACIONES[tipo]
  await exigirPermiso(imp.permiso)
  const xlsx = escribirXlsx([
    { nombre: imp.titulo.slice(0, 31), filas: imp.modelo.map((f) => [...f]) },
    { nombre: 'Cómo completarla', filas: [['Columna', 'Qué va'], ...imp.columnas.map((c) => [...c])] },
  ])
  return new Response(Buffer.from(xlsx), {
    headers: { 'content-type': TIPO_XLSX, 'content-disposition': `attachment; filename="importar-${tipo}.xlsx"` },
  })
}
