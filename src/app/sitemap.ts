import type { MetadataRoute } from 'next'

import { SOLUCIONES } from '@/components/sitio/soluciones'
import { URL_SITIO } from '@/lib/marca'

export default function sitemap(): MetadataRoute.Sitemap {
  const pagina = (ruta: string, prioridad: number, frecuencia: 'weekly' | 'monthly' | 'yearly' = 'monthly') => ({
    url: `${URL_SITIO}${ruta}`,
    changeFrequency: frecuencia,
    priority: prioridad,
  })
  return [
    pagina('/', 1, 'weekly'),
    pagina('/precios', 0.9, 'weekly'),
    pagina('/funciones', 0.8),
    pagina('/integraciones', 0.8),
    ...SOLUCIONES.map((s) => pagina(`/soluciones/${s.slug}`, 0.8)),
    pagina('/contacto', 0.6),
    pagina('/registro', 0.6),
    pagina('/legal/terminos', 0.2, 'yearly'),
    pagina('/legal/privacidad', 0.2, 'yearly'),
    pagina('/legal/arrepentimiento', 0.1, 'yearly'),
  ]
}
