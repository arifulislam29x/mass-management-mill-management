/* MessLedger PWA cache. Never cache API responses or private financial data. */
const CACHE_NAME = 'messledger-shell-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/app-icon.svg', '/app-icon-192.png', '/app-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('messledger-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Network-first for HTML so users receive the latest deployed app; cached shell is offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
        }
        return response;
      }).catch(async () => (await caches.match('/')) || Response.error())
    );
    return;
  }

  // Cache-first for versioned Vite assets and app icons; update cache in the background on misses.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/app-icon') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      }))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
