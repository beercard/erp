/*
 * Service worker de la app del técnico: guarda en el celular lo que ya se vio
 * (la agenda, cada orden, sus fotos y los archivos de la aplicación) para
 * poder abrirlo sin señal. Lo que se carga sin señal lo guarda la página y lo
 * manda cuando vuelve (ver src/components/servicio/sinSenal.ts).
 *
 * Solo GET del mismo origen. Las acciones (POST) nunca pasan por la caché.
 */
const VERSION = 'tecnico-v1'
const ESTATICOS = `${VERSION}-estaticos`
const PAGINAS = `${VERSION}-paginas`

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

const esPagina = (url) => url.pathname === '/tecnico' || url.pathname.startsWith('/tecnico/')
const esArchivo = (url) => url.pathname.startsWith('/servicio/archivo/')
const esEstatico = (url) => url.pathname.startsWith('/_next/static/') || url.pathname === '/icono-tecnico.svg'

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (esEstatico(url) || esArchivo(url)) {
    // No cambian nunca (llevan hash o son inmutables): primero la caché.
    e.respondWith(
      caches.open(ESTATICOS).then(async (c) => {
        const guardado = await c.match(req)
        if (guardado) return guardado
        const r = await fetch(req)
        if (r.ok) c.put(req, r.clone())
        return r
      }),
    )
    return
  }

  if (esPagina(url)) {
    // Primero la red (datos al día); sin señal, lo último que se vio.
    e.respondWith(
      (async () => {
        const c = await caches.open(PAGINAS)
        try {
          const r = await fetch(req)
          if (r.ok && !r.redirected) c.put(req, r.clone())
          return r
        } catch {
          return (
            (await c.match(req)) ??
            (await c.match('/tecnico')) ??
            new Response('Sin señal y sin copia guardada de esta página.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        }
      })(),
    )
  }
})
