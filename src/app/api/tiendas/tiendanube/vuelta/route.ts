import { cookies } from 'next/headers'

import { leerFlujo } from '@/modulos/tiendas/flujo'
import { canjearCodigo, registrarAvisos } from '@/modulos/tiendas/tiendanube'

import { base, COOKIE_TN, darDeAlta, quienConecta, volver, volverConError } from '../../_lib/comun'

/** Vuelta de Tienda Nube con el código. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const tarro = await cookies()
  const flujo = leerFlujo(q.get('state') ?? tarro.get(COOKIE_TN)?.value)
  tarro.delete(COOKIE_TN)
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
    return volverConError(`No se pudo conectar: ${e instanceof Error ? e.message : 'error desconocido'}`)
  }
}
