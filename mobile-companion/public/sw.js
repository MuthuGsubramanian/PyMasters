const CACHE_NAME = 'pymasters-pocket-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/download/')) return;

  if (/^\/(icon-|apple-touch-icon|favicon\.|manifest\.webmanifest)/.test(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || /\.(css|js)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/')));
  }
});
