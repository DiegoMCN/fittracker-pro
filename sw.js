// ═══════════════════════════════════════════
// SERVICE WORKER — FitTracker Pro
// Los archivos propios (js/css) ahora se piden con RED PRIMERO — ya no
// depende de subir CACHE_VERSION a mano para ver cambios nuevos, eso
// causó bugs fantasma más de una vez. Solo súbelo si agregas o quitas
// un archivo del APP_SHELL (para que se precachee desde cero), no por
// cada cambio de contenido dentro de un archivo que ya existía.
// ═══════════════════════════════════════════

const CACHE_VERSION = 'fittracker-v14';

// El Cache API solo acepta esquemas http/https — una extensión de
// Chrome instalada puede disparar solicitudes con esquema
// "chrome-extension://" que terminan pasando por este fetch handler,
// y cache.put() truena con esas ("Request scheme ... is unsupported").
// No es nada que rompa la app — solo un intento de cachear algo que
// nunca debió intentarse cachear.
function _cachePut(req, res) {
  if (!req.url.startsWith('http')) return;
  caches.open(CACHE_VERSION).then(c => c.put(req, res)).catch(() => {});
}

const APP_SHELL = [
  './',
  './index.html',
  './css/main.css',
  './js/config.js',
  './js/api.js',
  './js/utils.js',
  './js/offline.js',
  './js/motion.js',
  './js/gestures.js',
  './js/recovery-timer.js',
  './js/session-share.js',
  './js/modules/celebration.js',
  './js/modules/dashboard.js',
  './js/modules/workout.js',
  './js/modules/cardio.js',
  './js/modules/forma.js',
  './js/modules/patrones.js',
  './js/modules/plan.js',
  './js/modules/history.js',
  './js/modules/exercises.js',
  './js/vendor/body-muscles-1.0.0.umd.min.js',
  './js/muscle-map.js',
  './js/modules/metrics.js',
  './js/modules/profile.js',
  './js/modules/configuracion.js',
  './js/modules/import.js',
  './js/modules/coach.js',
  './js/modules/nutricion.js',
  './js/modules/calendario.js',
  './js/modules/wrapped.js',
  './js/spotify.js',
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

  // Solo esquemas http/https — una extensión de Chrome puede disparar
  // solicitudes "chrome-extension://" que este handler ve pasar; no
  // hay nada que cachear ahí, mejor ni intentar manejarlas.
  if (!req.url.startsWith('http')) return;

  const url = new URL(req.url);

  // Spotify: NI TOCARLO. El estado de reproducción cambia cada segundo,
  // y la regla de "recursos externos" de más abajo es caché primero —
  // si la dejáramos aplicar aquí, la burbuja se quedaría mostrando para
  // siempre la primera canción que sonó. Tampoco tiene caso guardar una
  // respuesta que viaja con un token que caduca en una hora.
  if (url.hostname.endsWith('spotify.com') || url.hostname.endsWith('scdn.co')) return;

  // Apps Script (datos del Sheet): red primero, cae a la última copia
  // cacheada si no hay conexión — así Dashboard/Bitácora muestran algo
  // en vez de romperse.
  if (url.hostname.includes('script.google.com')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          // Solo se guarda una respuesta BUENA. Antes se guardaba
          // cualquier cosa: si Google alguna vez contestaba con una
          // página de error (sesión caducada, script tronado, un
          // mantenimiento de 10 segundos), esa página quedaba
          // archivada como si fuera el dato del Sheet, y la siguiente
          // vez sin señal se servía tal cual — la app recibía HTML
          // donde esperaba JSON y reportaba un error que no tenía
          // nada que ver con lo que estaba pasando.
          if (res.ok && !res.redirected) _cachePut(req, res.clone());
          return res;
        })
        .catch(err =>
          // Y aquí estaba el engaño: si la red fallaba y NO había nada
          // guardado, caches.match() devuelve undefined, y responder
          // con undefined hace que el navegador le reporte a la página
          // un fallo genérico — que Chrome rotula como error de CORS
          // aunque el problema real haya sido otro completamente.
          // Ahora, si no hay copia, se deja pasar el error de verdad
          // para que api.js lo pueda clasificar y decir qué pasó.
          caches.match(req).then(cached => {
            if (cached) return cached;
            throw err;
          })
        )
    );
    return;
  }

  // Recursos externos (Chart.js CDN, fuentes): caché primero
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const clone = res.clone();
        _cachePut(req, clone);
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
      _cachePut(req, clone);
      return res;
    }).catch(() => caches.match(req))
  );
});
