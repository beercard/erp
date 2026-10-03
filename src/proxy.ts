import { NextResponse, type NextRequest } from 'next/server'

/**
 * Chequeo optimista: sin cookie de sesión no hay nada que mostrar, así que
 * se manda a ingresar sin tocar la base. La verificación real (token válido,
 * vencimiento, empresa y permisos) la hace cada página en el servidor.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has('erp_sesion')) {
    const destino = new URL('/ingresar', request.url)
    if (request.nextUrl.pathname !== '/') destino.searchParams.set('volver', request.nextUrl.pathname)
    return NextResponse.redirect(destino)
  }
  return NextResponse.next()
}

export const config = {
  // Todo menos la pantalla de ingreso, los archivos estáticos y los internos de Next.
  matcher: [
    '/((?!ingresar|invitacion|registro|precios|encuesta|seguimiento|portal|api/cron|api/v1|api/salud|api/tiendas/mercadolibre/avisos|api/tiendas/tiendanube/avisos|api/tiendas/woocommerce/claves|api/tiendas/woocommerce/avisos|manifest.webmanifest|sw.js|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)',
  ],
}
