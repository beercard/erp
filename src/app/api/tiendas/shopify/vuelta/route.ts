import { leerFlujo } from '@/modulos/tiendas/flujo'
import { canjearCodigoShopify, normalizarTiendaShopify, registrarAvisosShopify, vueltaValida } from '@/modulos/tiendas/shopify'

import { base, darDeAlta, quienConecta, volver, volverConError } from '../../_lib/comun'

/** Vuelta de Shopify con el código: se verifica la firma, el state y que sea la tienda pedida. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  if (!vueltaValida(q)) return volverConError('Shopify devolvió una respuesta sin firma válida. Probá de nuevo.')
  const flujo = leerFlujo(q.get('state'))
  const s = await quienConecta()
  if (!flujo || flujo.tipo !== 'shopify' || !s || s.empresa.id !== flujo.empresaId || s.usuario.id !== flujo.usuarioId) {
    return volverConError('La conexión venció o no es de esta sesión. Probá de nuevo desde Tiendas online.')
  }
  const tienda = normalizarTiendaShopify(q.get('shop') ?? '')
  if (!tienda || tienda !== flujo.tienda) return volverConError('Shopify devolvió otra tienda distinta de la que escribiste.')
  const codigo = q.get('code')
  if (!codigo) return volverConError('Shopify no devolvió el código de autorización.')
  try {
    const credenciales = await canjearCodigoShopify(fetch, tienda, codigo)
    const r = await darDeAlta(
      { empresaId: flujo.empresaId, usuarioId: flujo.usuarioId },
      { tipo: 'shopify', nombre: `Shopify · ${tienda.replace('.myshopify.com', '')}`, cuenta: tienda, credenciales },
      () => registrarAvisosShopify(fetch, credenciales, `${base()}/api/tiendas/shopify/avisos`),
    )
    return r.ok ? volver(`/tiendas/${r.id}?conectado=1`) : volverConError(r.error)
  } catch (e) {
    console.error('[tiendas] vuelta Shopify', e instanceof Error ? e.message : e)
    return volverConError('No se pudo conectar con Shopify. Probá de nuevo en un momento.')
  }
}
