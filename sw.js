importScripts('./version.js');

const CACHE_PREFIX = 'alternative-percent-managed-';
const CACHE_NAME = `${CACHE_PREFIX}${self.APP_VERSION || '27.9'}`;
const LEGACY_PREFIX = 'alternative-percent-';

const APP_SHELL = [
  './',
  './index.html',
  './version.js',
  './style.css',
  './enhancements.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-512.png'
];

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const requests = APP_SHELL.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' }));
  await cache.addAll(requests);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const existing = await caches.keys();
    const upgradingFromLegacy = !existing.some((key) => key.startsWith(CACHE_PREFIX));
    await precache();

    // One-time bridge from the old 27.8 updater. Future releases wait for
    // the in-app “Обновить” button instead of replacing themselves silently.
    if (upgradingFromLegacy) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_PREFIX)))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', response.clone());
        }
        return response;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  })());
});
