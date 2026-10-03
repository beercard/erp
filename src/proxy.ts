import { NextResponse, type NextRequest } from 'next/server'

/**
 * Chequeo optimista: sin cookie de sesión no hay nada que mostrar, así que
 * se manda a ingresar sin tocar la base. La verificación real (token válido,
 * vencimiento, empresa y permisos) la hace cada página en el servidor.
 */
export function proxy(request: NextRequest) {
  const ruta = request.nextUrl.pathname
  // La portada del sitio comercial vive en /sitio pero se ve en "/".
  if (ruta === '/sitio') return NextResponse.redirect(new URL('/', request.url), 308)
  if (!request.cookies.has('erp_sesion')) {
    // Sin sesión, "/" es el sitio comercial (con sesión, el inicio del sistema).
    if (ruta === '/') return NextResponse.rewrite(new URL('/sitio', request.url))
    const destino = new URL('/ingresar', request.url)
    if (request.nextUrl.pathname !== '/') destino.searchParams.set('volver', request.nextUrl.pathname)
    return NextResponse.redirect(destino)
  }
  return NextResponse.next()
}

export const config = {
  // Todo menos la pantalla de ingreso, los archivos estáticos y los internos de Next.
  matcher: [
    '/((?!ingresar|invitacion|registro|precios|funciones|integraciones|soluciones|contacto|legal|robots.txt|sitemap.xml|opengraph-image|icon.svg|encuesta|seguimiento|portal|api/cron|api/v1|api/salud|api/pagos/mercadopago|api/tiendas/mercadolibre/avisos|api/tiendas/tiendanube/avisos|api/tiendas/woocommerce/claves|api/tiendas/woocommerce/avisos|manifest.webmanifest|sw.js|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)',
  ],
}
