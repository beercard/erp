import { cookies } from 'next/headers'

import { leerFlujo } from '@/modulos/tiendas/flujo'
import { canjearCodigo, registrarAvisos } from '@/modulos/tiendas/tiendanube'

import { base, COOKIE_TN, darDeAlta, quienConecta, volver, volverConError } from '../../_lib/comun'

/** Vuelta de Tienda Nube con el código. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const tarro = await cookies()
  const enUrl = q.get('state')
  const enCookie = tarro.get(COOKIE_TN)?.value
  tarro.delete(COOKIE_TN)
  // Si llegan los dos, tienen que ser el mismo: un enlace armado por otro no puede usar la cookie de esta sesión.
  if (enUrl && enCookie && enUrl !== enCookie)
    return volverConError('La conexión no coincide con la que iniciaste. Probá de nuevo.')
  const flujo = leerFlujo(enUrl ?? enCookie)
  const s = await quienConecta()
  if (!flujo || flujo.tipo !== 'tiendanube' || !s || s.empresa.id !== flujo.empresaId || s.usuario.id !== flujo.usuarioId) {
    return volverConError('La conexión venció o no es de esta sesión. Probá de nuevo desde Tiendas online.')
  }
  const codigo = q.get('code')
  if (!codigo) return volverConError('Tienda Nube no devolvió el código de autorización.')
  try {
    const credenciales = await canjearCodigo(fetch, codigo)
    const r = await darDeAlta(
      { empresaId: flujo.empresaId, usuarioId: flujo.usuarioId },
      { tipo: 'tiendanube', nombre: `Tienda Nube · ${credenciales.tienda}`, cuenta: credenciales.tienda, credenciales },
      () => registrarAvisos(fetch, credenciales, `${base()}/api/tiendas/tiendanube/avisos`),
    )
    return r.ok ? volver(`/tiendas/${r.id}?conectado=1`) : volverConError(r.error)
  } catch (e) {
    console.error('[tiendas] vuelta TN', e instanceof Error ? e.message : e)
    return volverConError('No se pudo conectar con Tienda Nube. Probá de nuevo en un momento.')
  }
}
