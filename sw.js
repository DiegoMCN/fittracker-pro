// ═══════════════════════════════════════════
// SERVICE WORKER — FitTracker Pro
// Los archivos propios (js/css) ahora se piden con RED PRIMERO — ya no
// depende de subir CACHE_VERSION a mano para ver cambios nuevos, eso
// causó bugs fantasma más de una vez. Solo súbelo si agregas o quitas
// un archivo del APP_SHELL (para que se precachee desde cero), no por
// cada cambio de contenido dentro de un archivo que ya existía.
// ═══════════════════════════════════════════

const CACHE_VERSION = 'fittracker-v7';

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

  // App shell propio: RED PRIMERO. Antes era "caché primero, actualiza
  // en segundo plano" (stale-while-revalidate) — eso significa que
  // siempre se ve la versión VIEJA de inmediato, y solo se actualiza
  // hasta la siguiente vez, y encima requería que yo subiera
  // CACHE_VERSION a mano en cada deploy para forzar el refresco. Ya se
  // me olvidó dos veces y causó horas de debugging persiguiendo "bugs"
  // que en realidad eran solo caché vieja. Con red primero, mientras
  // haya conexión SIEMPRE se ve el código más reciente — el caché
  // aquí es nada más el respaldo para cuando no hay señal.
  e.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
