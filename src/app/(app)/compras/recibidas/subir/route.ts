import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { guardarRecibida, marcarSinLectura, procesarRecibida, tipoDeArchivo } from '@/modulos/compras/recibidas'
import { iaConfigurada } from '@/modulos/ia/claude'

/**
 * Sube una foto o un PDF de una factura desde la computadora (además de
 * WhatsApp) y la lee. Es una ruta y no una acción porque las acciones del
 * servidor aceptan hasta 1 MB y una foto puede pesar más.
 */
const MAXIMO = 10 * 1024 * 1024
const base = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const volver = (ruta: string) => Response.redirect(`${base()}${ruta}`, 303)

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > MAXIMO + 50_000)
    return volver('/compras/recibidas?error=El+archivo+es+muy+grande+(hasta+10+MB).')
  const fd = await request.formData().catch(() => null)
  const archivo = fd?.get('archivo')
  if (!(archivo instanceof File) || !archivo.size) return volver('/compras/recibidas?error=Eleg%C3%AD+la+foto+o+el+PDF.')
  if (archivo.size > MAXIMO) return volver('/compras/recibidas?error=El+archivo+es+muy+grande+(hasta+10+MB).')
  const datos = Buffer.from(await archivo.arrayBuffer())
  const tipo = tipoDeArchivo(datos)
  if (!tipo) return volver('/compras/recibidas?error=Tiene+que+ser+una+foto+(JPG,+PNG,+WebP)+o+un+PDF.')
  try {
    const r = await enLaEmpresa('compras.cargar', async (tx, s) => {
      const id = await guardarRecibida(tx, { usuarioId: s.usuario.id, archivo: datos, tipo, nombre: archivo.name.slice(0, 200) })
      if (!iaConfigurada()) await marcarSinLectura(tx, id)
      return { id, empresaId: s.empresa.id, cuit: s.empresa.cuit }
    })
    if (iaConfigurada()) await procesarRecibida(r.empresaId, r.id, r.cuit)
    return volver(`/compras/recibidas/${r.id}`)
  } catch (e) {
    if (e instanceof SinPermiso) return volver(`/compras/recibidas?error=${encodeURIComponent(e.message)}`)
    throw e
  }
}
