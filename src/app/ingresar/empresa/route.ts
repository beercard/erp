import { ipDe } from '@/lib/auth/servidor'
import { anotar, claveIp, superado } from '@/lib/frenos'
import { urlDeEmpresa, validarCodigo } from '@/lib/subdominio'
import { empresaPorCodigo } from '@/modulos/plataforma/codigos'

/**
 * Ingreso desde el dominio base: el código de empresa lleva a su dirección.
 * Es un GET común (no una acción): el navegador sigue la redirección a otro
 * subdominio sin problemas.
 */
export async function GET(request: Request) {
  const u = new URL(request.url)
  const codigo = (u.searchParams.get('codigo') ?? '').trim().toLowerCase().slice(0, 60)
  const volver = (motivo: string) =>
    Response.redirect(new URL(`/ingresar?codigo=${encodeURIComponent(codigo)}&error=${motivo}`, request.url), 303)
  // Freno a quien prueba códigos al azar para ver qué empresas usan el sistema.
  const porIp = claveIp('codigo-empresa', ipDe(request.headers))
  if (await superado([porIp], 30, 15 * 60_000)) return volver('intentos')
  const v = validarCodigo(codigo)
  const empresa = v.ok ? await empresaPorCodigo(v.codigo) : null
  if (!empresa?.codigo) {
    await anotar([porIp])
    return volver('codigo')
  }
  return Response.redirect(urlDeEmpresa(empresa.codigo, '/ingresar'), 303)
}
