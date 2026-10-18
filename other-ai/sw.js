/**
 * AlterNative Percent / Other AI
 * Кэш этого приложения изолирован от главной страницы и версии ChatGPT.
 */
const CACHE_PREFIX = 'alternative-other-ai-';
const CACHE_NAME = CACHE_PREFIX + 'v1.0.2';
const PREVIOUS_PREFIX = 'alternative-percent-cache-';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js',
  './manifest.json', './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map((file) =>
      new Request(new URL(file, self.registration.scope), { cache: 'reload' })
    ));
    // Первый запуск не должен оставлять установку в ожидании.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) =>
      name !== CACHE_NAME &&
      (name.startsWith(CACHE_PREFIX) || name.startsWith(PREVIOUS_PREFIX))
    ).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(cache.put('./index.html', response.clone()));
        }
        return response;
      } catch (_) {
        return await cache.match('./index.html') || await cache.match('./') || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  })());
});
