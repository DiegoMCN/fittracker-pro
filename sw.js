// ═══════════════════════════════════════════
// SERVICE WORKER — FitTracker Pro
// ⚠️ Sube CACHE_VERSION cada vez que despliegues cambios,
//    o el navegador seguirá sirviendo archivos viejos desde caché.
// ═══════════════════════════════════════════

const CACHE_VERSION = 'fittracker-v6';

const APP_SHELL = [
  './',
  './index.html',
  './css/main.css',
  './js/config.js',
  './js/api.js',
  './js/utils.js',
  './js/offline.js',
  './js/modules/celebration.js',
  './js/modules/dashboard.js',
  './js/modules/workout.js',
  './js/modules/cardio.js',
  './js/modules/plan.js',
  './js/modules/history.js',
  './js/modules/exercises.js',
  './js/modules/metrics.js',
  './js/modules/profile.js',
  './js/modules/import.js',
  './js/modules/coach.js',
  './js/modules/nutricion.js',
  './js/modules/calendario.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

// ── INSTALL: cachea el app shell ─────────────────────────────────────────
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.warn('[SW] Error cacheando app shell:', err))
  );
});

// ── ACTIVATE: limpia versiones viejas de caché ───────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: estrategias distintas según el tipo de recurso ────────────────
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Solo interceptamos GET — los POST (guardar datos) los maneja
  // la cola offline en JavaScript (offline.js), no el Service Worker.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Apps Script (datos del Sheet): red primero, cae a la última copia
  // cacheada si no hay conexión — así Dashboard/Bitácora muestran algo
  // en vez de romperse.
  if (url.hostname.includes('script.google.com')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Recursos externos (Chart.js CDN, fuentes): caché primero
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, clone));
        return res;
      }))
    );
    return;
  }

  // App shell propio: caché primero, actualiza en background (stale-while-revalidate)
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, clone));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
