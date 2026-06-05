/* ============================================================
   ForgeEdit Pro — sw.js (optimized)
   Fokus:
   - Subdirectory-safe untuk GitHub Pages
   - Offline shell kuat
   - Precaching aset lokal
   - Runtime cache untuk asset eksternal
   - Update bersih dan cache versioning
   - Tanpa dependency eksternal
   ============================================================ */

const APP_NAME = 'forgeedit';
const CACHE_VERSION = '20260531d';

const STATIC_CACHE = `${APP_NAME}-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${APP_NAME}-runtime-${CACHE_VERSION}`;

const BASE_URL = new URL('./', self.location.href);
const BASE_PATH = BASE_URL.pathname;

// Aset inti yang harus ada untuk app bisa hidup offline
const PRECACHE_PATHS = [
  'index.html',
  'preview.html',
  'style.css',
  'script.js',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-72x72.png',
  'icons/icon-96x96.png',
  'icons/icon-128x128.png',
  'icons/icon-144x144.png',
  'icons/icon-152x152.png',
  'icons/icon-192x192.png',
  'icons/icon-384x384.png',
  'icons/icon-512x512.png',
];

const PRECACHE_URLS = PRECACHE_PATHS.map((path) => new URL(path, BASE_URL).href);
const OFFLINE_FALLBACK_URL = new URL('index.html', BASE_URL).href;

const ASSET_EXTENSIONS = /\.(?:html?|css|mjs|js|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|map)$/i;

console.log('[ForgeEdit SW] loaded');
console.log('[ForgeEdit SW] base:', BASE_PATH);
console.log('[ForgeEdit SW] version:', CACHE_VERSION);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);

    const results = await Promise.allSettled(
      PRECACHE_URLS.map(async (url) => {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) {
          throw new Error(`Precache failed: ${url} (${response.status})`);
        }
        await cache.put(url, response);
      })
    );

    const failed = results
      .filter((r) => r.status === 'rejected')
      .map((r) => (r.reason && r.reason.message ? r.reason.message : String(r.reason)));

    const indexReady = await cache.match(OFFLINE_FALLBACK_URL);
    if (!indexReady) {
      throw new Error('[ForgeEdit SW] index.html missing from precache');
    }

    if (failed.length) {
      console.warn('[ForgeEdit SW] Some precache items failed:', failed);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );

    if (self.registration && 'navigationPreload' in self.registration) {
      try {
        await self.registration.navigationPreload.enable();
      } catch (err) {
        console.warn('[ForgeEdit SW] navigationPreload enable failed:', err);
      }
    }

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, event));
    return;
  }

  if (isCDNAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }

  if (isLocalStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function handleNavigation(request, event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;

    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const fallback = await cache.match(OFFLINE_FALLBACK_URL);
    if (fallback) return fallback;

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return offlineFallback(request);
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then(async (response) => {
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  });

  if (cached) {
    event.waitUntil(networkPromise.catch(() => null));
    return cached;
  }

  try {
    return await networkPromise;
  } catch (err) {
    return offlineFallback(request);
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineFallback(request);
  }
}

async function offlineFallback(request) {
  if (request.headers.get('Accept')?.includes('text/html') || request.mode === 'navigate') {
    const cache = await caches.open(STATIC_CACHE);
    const fallback = await cache.match(OFFLINE_FALLBACK_URL);
    if (fallback) return fallback;
  }

  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
  });
}

function isCacheableResponse(response) {
  return response && (response.ok || response.type === 'opaque');
}

function isLocalStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith(BASE_PATH) &&
    ASSET_EXTENSIONS.test(url.pathname)
  );
}

function isCDNAsset(url) {
  return (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

self.addEventListener('message', (event) => {
  const data = event.data;
  const reply = (payload) => {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
    }
  };

  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    reply({ ok: true, type: 'SKIP_WAITING' });
    return;
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      reply({ ok: true, type: 'CLEAR_CACHE' });
    })());
    return;
  }

  if (data.type === 'GET_VERSION') {
    reply({
      ok: true,
      version: CACHE_VERSION,
      basePath: BASE_PATH,
      staticCache: STATIC_CACHE,
      runtimeCache: RUNTIME_CACHE,
    });
    return;
  }

  if (data.type === 'DIAG_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      const report = {};

      await Promise.all(
        keys.map(async (name) => {
          const cache = await caches.open(name);
          const entries = await cache.keys();
          report[name] = entries.length;
        })
      );

      reply({ ok: true, caches: report, basePath: BASE_PATH });
    })());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'forgeedit-sync') {
    event.waitUntil((async () => {
      console.log('[ForgeEdit SW] background sync triggered');
    })());
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'ForgeEdit Pro';
  const options = {
    body: data.body || 'Notifikasi baru',
    icon: new URL('icons/icon-192x192.png', BASE_URL).href,
    badge: new URL('icons/icon-96x96.png', BASE_URL).href,
    vibrate: [100, 50, 100],
    data: {
      url: data.url || BASE_URL.href,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || BASE_URL.href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url || client.url.startsWith(BASE_URL.href)) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
