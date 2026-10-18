const CACHE_NAME = 'alternative-hub-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './apple-touch-icon.png'];
const SCOPE = new URL(self.registration.scope);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('alternative-hub-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin) return;
  const isHome = url.pathname === SCOPE.pathname || url.pathname === new URL('index.html', SCOPE).pathname;
  if (!isHome) return;
  event.respondWith(fetch(req).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
    return response;
  }).catch(() => caches.match('./index.html')));
});
