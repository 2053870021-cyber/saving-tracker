/* 省钱记 Service Worker — 本地缓存优先，首次联网加载后可离线使用 */
const CACHE = 'savetracker-v1.1.1';
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
  './growth-space/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(hit => {
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
        return caches.match(url.pathname.startsWith(GROWTH_SPACE_PATH) ? './growth-space/index.html' : './index.html');
      }
      return new Response('离线且无缓存', { status: 504, statusText: 'Offline' });
    })
  );
});

