// Service worker: mindig a hálózatról kéri a friss oldalt (új eredmények), és ha nincs net,
// a legutóbb letöltött változatot mutatja.
const CACHE = 'hatvan-u14';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !isFont) return;

  // Képek és betűk: elég a gyorsítótárból (nem változnak), az oldal és az adatok: előbb a hálózat
  const cacheFirst = isFont || /\.(png|jpe?g|gif|webp)$/i.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (cacheFirst) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('./')) || (await cache.match('index.html')) || Response.error();
      throw err;
    }
  })());
});
