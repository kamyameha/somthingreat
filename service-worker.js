const CACHE_NAME = 'somthingreat-v8-7-password-account-fix';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './supabase-config.js',
  './somthingreat.svg',
  './apple-touch-icon.png',
  './192x192-PWA.png',
  './512x512-regular.png',
  './512x512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache Supabase/API calls or browser-extension requests.
  if (url.origin !== self.location.origin || request.method !== 'GET') {
    return;
  }

  // Always try the network first for pages and core app files.
  // This prevents users from staying stuck on an old app.js/index.html.
  const isNavigation = request.mode === 'navigate';
  const isCoreFile = /\/(index\.html|app\.js|style\.css|supabase-config\.js|manifest\.json)$/.test(url.pathname);

  if (isNavigation || isCoreFile) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static images/icons can be cache-first, with a network fallback.
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const freshResponse = await fetch(request, { cache: 'no-store' });
    await cache.put(request, freshResponse.clone());
    return freshResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  const freshResponse = await fetch(request);
  await cache.put(request, freshResponse.clone());
  return freshResponse;
}
