const CACHE_NAME = 'dapoermuda-pos-v7';
const CACHE_PREFIX = 'dapoermuda-pos-';
const hostName = String(self.location.hostname || '').toLowerCase();
const isEmbeddedNativeShell = (hostName === 'localhost' || hostName === '127.0.0.1')
  && self.location.protocol === 'https:'
  && !self.location.port;
const APP_SHELL = [
  './',
  './app-config.js',
  './index.html',
  './manifest.webmanifest',
  './icons/brand-mark.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

async function clearAppCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => String(key).startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key))
  );
}

async function networkFirst(request, fallbackRequest = request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok && new URL(request.url).origin === self.location.origin) {
      const clonedResponse = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(fallbackRequest, clonedResponse);
    }

    return networkResponse;
  } catch (error) {
    return caches.match(fallbackRequest);
  }
}

self.addEventListener('install', (event) => {
  if (isEmbeddedNativeShell) {
    event.waitUntil(clearAppCaches());
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  if (isEmbeddedNativeShell) {
    event.waitUntil(
      clearAppCaches()
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
    return;
  }

  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (isEmbeddedNativeShell) return;
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (requestUrl.origin === self.location.origin && requestUrl.pathname.endsWith('/app-config.js')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      networkFirst(event.request, './index.html')
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || !networkResponse.ok) {
          return networkResponse;
        }

        if (event.request.url.startsWith(self.location.origin)) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clonedResponse));
        }

        return networkResponse;
      });
    })
  );
});
