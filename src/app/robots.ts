import type { MetadataRoute } from 'next'

import { URL_SITIO } from '@/lib/marca'

/** Se indexa solo el sitio comercial; el sistema, los portales y la API no. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/funciones', '/integraciones', '/precios', '/soluciones/', '/contacto', '/legal/', '/registro'],
        disallow: ['/api/', '/portal', '/plataforma', '/seguimiento/', '/encuesta/', '/invitacion/', '/imprimir/', '/sitio'],
      },
    ],
    sitemap: `${URL_SITIO}/sitemap.xml`,
    host: URL_SITIO,
  }
}
