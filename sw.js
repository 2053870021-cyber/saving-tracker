/* 省钱记 Service Worker — 本地缓存优先，首次联网加载后可离线使用 */
const CACHE = 'savetracker-v1.2.0-release';
const GROWTH_SPACE_PATH = new URL('./growth-space/', self.registration.scope).pathname;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './growth-space/',
  './growth-space/index.html',
  './growth-space/style.css',
  './growth-space/app.js',
  './growth-space/assets/puff-shroom.png',
  './growth-space/assets/fume-shroom.png',
  './growth-space/assets/sunflower.png',
  './growth-space/assets/twin-sunflower.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('savetracker-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      let hit = await cache.match(req);
      if (!hit && req.mode === 'navigate' && (url.pathname === GROWTH_SPACE_PATH || url.pathname === GROWTH_SPACE_PATH + 'index.html')) hit = await cache.match('./growth-space/index.html');
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }).catch(() => {
      if (req.mode === 'navigate') {
        return caches.open(CACHE).then(cache => cache.match(url.pathname.startsWith(GROWTH_SPACE_PATH) ? './growth-space/index.html' : './index.html'));
      }
      return new Response('离线且无缓存', { status: 504, statusText: 'Offline' });
    })
  );
});

