import { leerFlujo } from '@/modulos/tiendas/flujo'
import { canjearCodigo, nombreDeCuenta } from '@/modulos/tiendas/mercadolibre'

import { base, darDeAlta, quienConecta, volver, volverConError } from '../../_lib/comun'

/** Vuelta de Mercado Libre con el código de autorización. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  if (q.get('error')) return volverConError('Mercado Libre no autorizó la conexión.')
  const flujo = leerFlujo(q.get('state'))
  const s = await quienConecta()
  // El pedido tiene que volver a quien lo inició, en la misma empresa.
  if (!flujo || flujo.tipo !== 'mercadolibre' || !s || s.empresa.id !== flujo.empresaId || s.usuario.id !== flujo.usuarioId) {
    return volverConError('La conexión venció o no es de esta sesión. Probá de nuevo.')
  }
  const codigo = q.get('code')
  if (!codigo || !flujo.verificador) return volverConError('Mercado Libre no devolvió el código de autorización.')
  try {
    const credenciales = await canjearCodigo(fetch, codigo, flujo.verificador, `${base()}/api/tiendas/mercadolibre/vuelta`)
    const nombre = await nombreDeCuenta(fetch, credenciales).catch(() => `Usuario ${credenciales.usuario}`)
    const r = await darDeAlta(
      { empresaId: flujo.empresaId, usuarioId: flujo.usuarioId },
      { tipo: 'mercadolibre', nombre: `Mercado Libre · ${nombre}`, cuenta: credenciales.usuario, credenciales },
    )
    return r.ok ? volver(`/tiendas/${r.id}?conectado=1`) : volverConError(r.error)
  } catch (e) {
    console.error('[tiendas] vuelta ML', e instanceof Error ? e.message : e)
    return volverConError('No se pudo conectar con Mercado Libre. Probá de nuevo en un momento.')
  }
}
