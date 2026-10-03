import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { escribirZip } from '@/lib/zip'
import { huella, libroIva } from '@/modulos/impuestos/libroIva'
import { guardarGenerada, periodoCerrado, PERIODO } from '@/modulos/impuestos/presentaciones'

/** Los cuatro archivos del Libro IVA Digital en un .zip. Queda guardado como presentación "generada". */
export async function GET(request: Request) {
  const periodo = new URL(request.url).searchParams.get('periodo') ?? ''
  if (!PERIODO.test(periodo)) return new Response('Período inválido.', { status: 400 })
  try {
    const r = await enLaEmpresa('impuestos.libros', async (tx, s) => {
      if (await periodoCerrado(tx, 'iva_digital', periodo)) return null
      const l = await libroIva(tx, periodo)
      const zip = escribirZip(l.archivos)
      const nombreArchivo = `libro-iva-digital-${periodo}.zip`
      await guardarGenerada(tx, s.usuario.id, {
        impuesto: 'iva_digital',
        periodo,
        archivo: zip,
        nombreArchivo,
        resumen: {
          ventas: l.ventas.resumen,
          compras: l.compras.resumen,
          advertencias: l.ventas.advertencias.length + l.compras.advertencias.length,
          contenido: huella(l.archivos),
        },
      })
      return { zip, nombreArchivo }
    })
    if (!r) return new Response('El período ya está presentado: bajá el archivo guardado o reabrilo.', { status: 409 })
    return new Response(new Uint8Array(r.zip), {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${r.nombreArchivo}"` },
    })
  } catch (e) {
    if (e instanceof SinPermiso) return new Response('Sin permiso.', { status: 403 })
    throw e
  }
}
