import { codigoDelHost, dominioEmpresas, esDominioBase } from '@/lib/subdominio'
import { empresaPorCodigo } from '@/modulos/plataforma/codigos'

/**
 * Lo consulta Caddy antes de sacar un certificado HTTPS para un subdominio
 * (on_demand_tls / ask): solo responde 200 para el dominio base y los
 * subdominios de empresas que existen. Así nadie puede hacerle pedir
 * certificados para nombres inventados.
 */
export async function GET(request: Request) {
  const dominio = new URL(request.url).searchParams.get('domain') ?? ''
  if (!dominioEmpresas()) return new Response('Sin subdominios.', { status: 404 })
  if (esDominioBase(dominio)) return new Response('ok')
  const codigo = codigoDelHost(dominio)
  if (codigo && (await empresaPorCodigo(codigo))) return new Response('ok')
  return new Response('No existe.', { status: 404 })
}
