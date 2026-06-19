// Release rule: when deploying, keep this cache name aligned with the
// CSS/JS query versions in index.html.
const CACHE_NAME = 'somthingreat-v8-39-rest-option-cleanup';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=v8-39-rest-option-cleanup',
  './welcome.css?v=v8-39-rest-option-cleanup',
  './auth.css?v=v8-39-rest-option-cleanup',
  './workout.css?v=v8-39-rest-option-cleanup',
  './account.css?v=v8-39-rest-option-cleanup',
  './auth.js?v=v8-39-rest-option-cleanup',
  './workouts.js?v=v8-39-rest-option-cleanup',
  './state.js?v=v8-39-rest-option-cleanup',
  './account.js?v=v8-39-rest-option-cleanup',
  './admin.js?v=v8-39-rest-option-cleanup',
  './render.js?v=v8-39-rest-option-cleanup',
  './app.js?v=v8-39-rest-option-cleanup',
  './version.json',
  './manifest.json',
  './supabase-config.js',
  './somthingreat.svg',
  './apple-touch-icon.png',
  './192x192-PWA.png',
  './512x512-regular.png',
  './512x512-maskable.png',
  './Assets/Animations/start1.png',
  './Assets/Animations/start2.png',
  './Assets/Animations/start3.png',
  './Assets/Energy/great-icon.png',
  './Assets/Energy/normal-icon.png',
  './Assets/Energy/tired-icon.png',
  './Assets/Energy/exhaustive-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cacheAppShell(cache))
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
  const isCoreFile = /\/(index\.html|app\.js|auth\.js|workouts\.js|state\.js|account\.js|admin\.js|render\.js|style\.css|supabase-config\.js|manifest\.json|version\.json)$/.test(url.pathname);

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

async function cacheAppShell(cache) {
  await Promise.all(APP_SHELL.map(async asset => {
    try {
      const response = await fetch(asset, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(asset, response);
      } else {
        console.warn('Skipped app shell asset:', asset, response.status);
      }
    } catch (error) {
      console.warn('Skipped app shell asset:', asset, error);
    }
  }));
}
