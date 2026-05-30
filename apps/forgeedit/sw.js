/* ============================================================
   ForgeEdit Pro — sw.js
   Service Worker untuk PWA offline support, caching, dan update

   HOSTING DI SUBDIRECTORY (GitHub Pages):
   - App di-host di: dazep01.github.io/experimentals/apps/forgeedit/
   - SW scope: ./ (relative, resolves ke subdirectory yang benar)
   - Hanya precache file lokal (bukan CDN) agar install cepat & reliable
   - CDN assets di-cache secara runtime (stale-while-revalidate)

   KRITERIA CHROME INSTALLABILITY:
   - HTTPS ✅ (GitHub Pages = HTTPS)
   - SW dengan fetch handler ✅
   - Manifest valid dengan id dalam scope ✅
   - Icons 192x192 + 512x512 accessible ✅
   - SW controlling page saat load ✅ (perlu refresh setelah first install)
   ============================================================ */

const CACHE_NAME = 'forgeedit-pro-v3';
const STATIC_CACHE = 'forgeedit-static-v3';
const RUNTIME_CACHE = 'forgeedit-runtime-v3';

// Asset versions untuk cache-busting
const CACHE_VERSION = '20260531b';

// Base path — PENTING untuk subdirectory hosting!
// SW.location.pathname = /experimentals/apps/forgeedit/sw.js
// Kita butuh: /experimentals/apps/forgeedit/
const BASE_PATH = self.location.pathname.replace(/sw\.js$/, '');

// Daftar file lokal yang perlu di-precache
// PENTING: Hanya file lokal! CDN di-cache runtime agar SW install cepat.
const LOCAL_ASSETS = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'style.css',
  BASE_PATH + 'script.js',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'icons/icon.svg',
  BASE_PATH + 'icons/icon-72x72.png',
  BASE_PATH + 'icons/icon-96x96.png',
  BASE_PATH + 'icons/icon-128x128.png',
  BASE_PATH + 'icons/icon-144x144.png',
  BASE_PATH + 'icons/icon-152x152.png',
  BASE_PATH + 'icons/icon-192x192.png',
  BASE_PATH + 'icons/icon-384x384.png',
  BASE_PATH + 'icons/icon-512x512.png',
];

console.log('[ForgeEdit SW] Base path:', BASE_PATH);
console.log('[ForgeEdit SW] Precaching', LOCAL_ASSETS.length, 'assets');

/* ───────────── Install Event ───────────── */
self.addEventListener('install', (event) => {
  console.log('[ForgeEdit SW] Installing...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[ForgeEdit SW] Pre-caching local assets with absolute paths...');
        return cache.addAll(LOCAL_ASSETS);
      })
      .then(() => {
        console.log('[ForgeEdit SW] All local assets cached. Skipping waiting...');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[ForgeEdit SW] Pre-cache FAILED:', err);
        // Tetap skipWaiting meski ada error agar SW tetap aktif
        return self.skipWaiting();
      })
  );
});

/* ───────────── Activate Event ───────────── */
self.addEventListener('activate', (event) => {
  console.log('[ForgeEdit SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[ForgeEdit SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of ALL clients immediately — CRITICAL for installability
      console.log('[ForgeEdit SW] Claiming all clients...');
      return self.clients.claim();
    })
  );
});

/* ───────────── Fetch Event ───────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension dan non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Strategy berdasarkan tipe asset
  if (isLocalAsset(url)) {
    // Local assets: Cache First (sudah di-precache)
    event.respondWith(cacheFirst(request));
  } else if (isCDNAsset(url)) {
    // CDN assets: Stale-While-Revalidate (cache di runtime)
    event.respondWith(staleWhileRevalidate(request));
  } else {
    // Lainnya: Network First
    event.respondWith(networkFirst(request));
  }
});

/* ───────────── Cache Strategies ───────────── */

// Cache First: prioritaskan cache, fallback ke network
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Jika request HTML dan tidak ada di cache, return halaman utama
    if (request.headers.get('Accept')?.includes('text/html')) {
      const fallback = await caches.match(BASE_PATH + 'index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Stale While Revalidate: tampilkan cache, update di background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// Network First: prioritaskan network, fallback ke cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.headers.get('Accept')?.includes('text/html')) {
      const fallback = await caches.match(BASE_PATH + 'index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/* ───────────── Helper Functions ───────────── */
function isLocalAsset(url) {
  // File lokal = same-origin DAN path dimulai dengan BASE_PATH
  return url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH);
}

function isCDNAsset(url) {
  // CDN assets (CodeMirror, libraries, fonts)
  return (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

/* ───────────── Message Handler ───────────── */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION, basePath: BASE_PATH });
  }
  // Diagnostic: return cache status
  if (event.data && event.data.type === 'DIAG_CACHE') {
    caches.keys().then((names) => {
      const result = {};
      Promise.all(names.map(name =>
        caches.open(name).then(cache => cache.keys().then(keys => {
          result[name] = keys.length;
        }))
      )).then(() => {
        event.ports[0].postMessage({ caches: result, basePath: BASE_PATH });
      });
    });
  }
});

/* ───────────── Background Sync (jika didukung) ───────────── */
if ('sync' in self) {
  self.addEventListener('sync', (event) => {
    if (event.tag === 'forgeedit-sync') {
      console.log('[ForgeEdit SW] Background sync triggered');
    }
  });
}

/* ───────────── Push Notification (jika didukung) ───────────── */
if ('push' in self) {
  self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'ForgeEdit Pro';
    const options = {
      body: data.body || 'Notifikasi baru',
      icon: BASE_PATH + 'icons/icon-192x192.png',
      badge: BASE_PATH + 'icons/icon-96x96.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || BASE_PATH },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || BASE_PATH;
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('forgeedit') && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
    );
  });
}

console.log('[ForgeEdit SW] Service Worker loaded, version:', CACHE_VERSION, 'basePath:', BASE_PATH);
