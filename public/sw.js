const CACHE_NAME = 'jamii-yangu-shell-v1'
const APP_SHELL = ['/index.html', '/jamii-yangu-logo.svg']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const shell = await Promise.all(APP_SHELL.map(async (path) => {
      const response = await fetch(path)
      if (!response.ok) throw new Error(`Could not cache ${path}`)
      await cache.put(path, response.clone())
      return response
    }))
    const html = await shell[0].text()
    const assets = [...html.matchAll(/(?:src|href)="([^\"]*\/assets\/[^\"]+)"/g)].map((match) => match[1])
    await cache.addAll(assets)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    })))
  }
})
