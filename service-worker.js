importScripts('./app-version.js');

const APP_VERSION = self.SOMTHINGREAT_VERSION || self.APP_VERSION || 'dev';
const CACHE_NAME = `somthingreat-${APP_VERSION}`;
const versionedAsset = asset => `${asset}?v=${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './privacy/',
  './privacy/index.html',
  versionedAsset('./style.css'),
  versionedAsset('./welcome.css'),
  versionedAsset('./auth.css'),
  versionedAsset('./workout.css'),
  versionedAsset('./account.css'),
  versionedAsset('./app-version.js'),
  versionedAsset('./auth.js'),
  versionedAsset('./workouts.js'),
  versionedAsset('./state.js'),
  versionedAsset('./account.js'),
  versionedAsset('./admin.js'),
  versionedAsset('./render.js'),
  versionedAsset('./app.js'),
  './version.json',
  './manifest.json',
  './supabase-config.js',
  './somthingreat.svg',
  './google-signin.svg',
  './eye.svg',
  './eye-off.svg',
  './plus.svg',
  './x.svg',
  './star.svg',
  './clock.svg',
  './square.svg',
  './check.svg',
  './arrow-left.svg',
  './arrow-right.svg',
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

  const isNavigation = request.mode === 'navigate';
  const isVersionedAppAsset = url.searchParams.get('v') === APP_VERSION &&
    /\.(?:css|js)$/.test(url.pathname);
  const isFreshCoreFile = /\/(?:supabase-config\.js|manifest\.json|version\.json)$/.test(url.pathname);

  if (isNavigation) {
    event.respondWith(appShellFirst(request));
    return;
  }

  // Always revalidate application CSS and JavaScript. The cache remains the
  // offline fallback, but a normal deployment no longer requires manually
  // changing every asset URL just to receive the latest file.
  if (isVersionedAppAsset) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isFreshCoreFile) {
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

async function appShellFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match('./index.html') || await cache.match('./');
  const refresh = fetch(request, { cache: 'no-store' })
    .then(async response => {
      if (response.ok) await cache.put('./index.html', response.clone());
      return response;
    })
    .catch(error => {
      if (!cachedResponse) throw error;
      return null;
    });

  if (cachedResponse) {
    refresh.catch(() => {});
    return cachedResponse;
  }

  return refresh;
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
