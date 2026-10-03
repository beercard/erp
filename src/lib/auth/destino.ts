/**
 * Solo rutas internas: evita que ?volver= mande a otro sitio. Se rechazan
 * "//otro.com" y "/\\otro.com" (los navegadores toman la barra invertida
 * como "/") y cualquier control.
 *
 * Vive fuera de `acciones.ts` porque es un helper puro: un export de un archivo
 * `'use server'` queda publicado como acción del servidor.
 */
export function destinoSeguro(volver: string | undefined): string {
  if (!volver || !/^\/(?![/\\])/.test(volver) || /[\\\s]/.test(volver)) return '/'
  try {
    const u = new URL(volver, 'http://local.invalido')
    return u.origin === 'http://local.invalido' ? `${u.pathname}${u.search}${u.hash}` : '/'
  } catch {
    return '/'
  }
}
