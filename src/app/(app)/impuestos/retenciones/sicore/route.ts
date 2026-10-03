import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { archivoTxt } from '@/modulos/impuestos/libroIva'
import { guardarGenerada, periodoCerrado, PERIODO } from '@/modulos/impuestos/presentaciones'
import { lineasSicore, retencionesPracticadas } from '@/modulos/impuestos/retenciones'

/** Archivo de importación de SICORE con las retenciones de Ganancias del mes. */
export async function GET(request: Request) {
  const periodo = new URL(request.url).searchParams.get('periodo') ?? ''
  if (!PERIODO.test(periodo)) return new Response('Período inválido.', { status: 400 })
  try {
    const r = await enLaEmpresa('impuestos.libros', async (tx, s) => {
      if (await periodoCerrado(tx, 'sicore', periodo)) return null
      const lista = await retencionesPracticadas(tx, periodo)
      const lineas = lineasSicore(lista)
      const archivo = archivoTxt(lineas)
      const nombreArchivo = `sicore-retenciones-${periodo}.txt`
      const ganancias = lista.filter((x) => x.impuesto === 'ganancias')
      await guardarGenerada(tx, s.usuario.id, {
        impuesto: 'sicore',
        periodo,
        archivo,
        nombreArchivo,
        resumen: { cantidad: lineas.length, total: Math.round(ganancias.reduce((t, x) => t + Number(x.importe), 0) * 100) / 100 },
      })
      return { archivo, nombreArchivo }
    })
    if (!r) return new Response('El período ya está presentado en SICORE.', { status: 409 })
    return new Response(new Uint8Array(r.archivo), {
      headers: {
        'Content-Type': 'text/plain; charset=us-ascii',
        'Content-Disposition': `attachment; filename="${r.nombreArchivo}"`,
      },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
