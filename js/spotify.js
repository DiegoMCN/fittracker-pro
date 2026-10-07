// ═══════════════════════════════════════════
// SPOTIFY — burbuja flotante de control durante la sesión
//
// Autorización con PKCE (Proof Key for Code Exchange): NO necesita
// client secret, y por eso se puede hacer desde una app estática en
// GitHub Pages sin servidor propio. El secret NUNCA debe vivir aquí —
// cualquiera puede leer este archivo.
//
// Requiere Spotify Premium (los endpoints de control de reproducción
// solo funcionan con Premium). Diego lo tiene.
//
// Lo que hace:
//   · Burbuja flotante arrastrable durante sesiones de fuerza y cardio
//   · Portada, canción, artista, barra de progreso en vivo
//   · Play / pausa / anterior / siguiente / volumen
//   · Si no hay dispositivo activo, ofrece la lista para "mandar" la
//     música a este teléfono, a la compu o a la bocina
//   · Deja de consultar a Spotify cuando la app está en segundo plano
//     (no tiene caso gastar batería ni cuota)
//   · Guarda qué canción sonó en cada momento (local) para poder
//     cruzarlo después con el rendimiento en Patrones
// ═══════════════════════════════════════════

const Spotify = (() => {

  const AUTH_URL  = 'https://accounts.spotify.com/authorize';
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const API_BASE  = 'https://api.spotify.com/v1';

  const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
  ].join(' ');

  const K_TOKENS   = 'fittracker_spotify_tokens';
  const K_VERIFIER = 'fittracker_spotify_verifier';
  const K_STATE    = 'fittracker_spotify_state';
  const K_POS      = 'fittracker_spotify_bubble_pos';
  const K_OPEN     = 'fittracker_spotify_bubble_open';
  const K_LOG      = 'fittracker_spotify_track_log';
  const K_ENABLED  = 'fittracker_spotify_bubble_enabled';

  let _tokens   = null;   // { access_token, refresh_token, expires_at }
  let _player   = null;   // último estado de reproducción recibido
  let _devices  = [];
  let _poll     = null;   // intervalo de consulta al servidor
  let _render   = null;   // intervalo local de 1s que mueve la barra sin consultar
  let _open     = false;  // burbuja expandida o colapsada
  let _busy     = false;  // hay una acción en vuelo (evita doble tap)
  let _lastErr  = null;
  let _dragging = false;
  let _refreshing = null; // promesa compartida: si llegan 3 llamadas con el token vencido, solo se renueva una vez
  let _loggedId = null;   // último track ya anotado en la bitácora local
  // "No hay nada sonando en ningún lado" NO es un error, y por eso vive
  // en su propia bandera y no en _lastErr: refresh() pide el reproductor
  // y los dispositivos al mismo tiempo, y la respuesta buena de
  // dispositivos limpiaba _lastErr — el panel se quedaba en blanco en
  // vez de ofrecer "manda la música a este teléfono".
  let _idle = false;

  // ── 1. ALMACENAMIENTO ────────────────────────────────────────────────

  function _readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function _writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function _loadTokens() { _tokens = _readJSON(K_TOKENS, null); return _tokens; }
  function _saveTokens(t) { _tokens = t; _writeJSON(K_TOKENS, t); }
  function _clearTokens() { _tokens = null; try { localStorage.removeItem(K_TOKENS); } catch (e) {} }

  function isConnected() { return !!(_tokens || _loadTokens()); }

  // ── 2. PKCE ──────────────────────────────────────────────────────────
  // El "code verifier" es una cadena aleatoria que se queda guardada en
  // este teléfono. A Spotify solo le mandamos su hash (el "challenge").
  // Cuando regresa el código de autorización, le enseñamos el verifier
  // original — así Spotify comprueba que quien pide el token es el
  // mismo que inició el flujo, sin que haya un secreto en el código.

  function _randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => chars[b % chars.length]).join('');
  }

  function _base64url(buffer) {
    let s = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function _challengeFor(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return _base64url(digest);
  }

  async function connect() {
    const cfg = CONFIG.SPOTIFY || {};
    if (!cfg.CLIENT_ID) {
      Toast.error('Falta el Client ID de Spotify en config.js');
      return;
    }
    // crypto.subtle solo existe en contextos seguros (https o
    // localhost). En GitHub Pages siempre es https, pero si alguna vez
    // se abre el archivo con file:// esto truena sin explicación.
    if (!window.crypto?.subtle) {
      Toast.error('La conexión con Spotify necesita https — ábrela desde la dirección de la app, no desde el archivo.');
      return;
    }

    const verifier = _randomString(64);
    const challenge = await _challengeFor(verifier);
    const state = _randomString(16);

    try {
      localStorage.setItem(K_VERIFIER, verifier);
      localStorage.setItem(K_STATE, state);
    } catch (e) {
      Toast.error('No se pudo guardar la sesión de Spotify en este navegador');
      return;
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.CLIENT_ID,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      redirect_uri: cfg.REDIRECT_URI,
      state,
    });
    location.href = `${AUTH_URL}?${params}`;
  }

  // Se llama al arrancar la app. Si venimos de vuelta de Spotify, la
  // URL trae ?code=...&state=... — se canjea por el token y se limpia
  // la URL para que un refresh no vuelva a intentar canjear un código
  // ya gastado (Spotify solo lo acepta una vez).
  async function handleRedirect() {
    const params = new URLSearchParams(location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (!code && !error) return false;

    let saved = null;
    try { saved = localStorage.getItem(K_STATE); } catch (e) {}
    const verifier = (() => { try { return localStorage.getItem(K_VERIFIER); } catch (e) { return null; } })();

    // Limpia la URL pase lo que pase — si no, el código quemado se
    // queda pegado en la barra de direcciones.
    const clean = location.pathname + (params.get('page') ? `?page=${params.get('page')}` : '');
    history.replaceState({}, '', clean);
    try { localStorage.removeItem(K_STATE); localStorage.removeItem(K_VERIFIER); } catch (e) {}

    if (error) {
      Toast.error(error === 'access_denied'
        ? 'No autorizaste el acceso a Spotify'
        : `Spotify rechazó la autorización (${error})`);
      return false;
    }
    if (!state || state !== saved) {
      Toast.error('La respuesta de Spotify no coincide con esta sesión — intenta conectar de nuevo');
      return false;
    }
    if (!verifier) {
      Toast.error('Se perdió la clave de esta sesión de Spotify — intenta conectar de nuevo');
      return false;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CONFIG.SPOTIFY.REDIRECT_URI,
        client_id: CONFIG.SPOTIFY.CLIENT_ID,
        code_verifier: verifier,
      });
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error_description || json.error || 'error al canjear el código');

      _saveTokens({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: Date.now() + (json.expires_in || 3600) * 1000,
      });
      Toast.success('Spotify conectado 🎧');
      return true;
    } catch (e) {
      Toast.error(`No se pudo conectar Spotify: ${e.message}`);
      return false;
    }
  }

  // El access_token dura una hora. Lo renovamos 60s antes de que venza
  // para no quedarnos a medias en plena serie.
  async function _freshToken() {
    if (!_tokens) _loadTokens();
    if (!_tokens) return null;
    if (Date.now() < _tokens.expires_at - 60000) return _tokens.access_token;
    if (_refreshing) return _refreshing;

    _refreshing = (async () => {
      try {
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: _tokens.refresh_token,
          client_id: CONFIG.SPOTIFY.CLIENT_ID,
        });
        const res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error_description || json.error || 'no se pudo renovar');
        _saveTokens({
          access_token: json.access_token,
          // Spotify a veces manda un refresh_token nuevo y a veces no —
          // si no viene, el viejo sigue siendo válido.
          refresh_token: json.refresh_token || _tokens.refresh_token,
          expires_at: Date.now() + (json.expires_in || 3600) * 1000,
        });
        return _tokens.access_token;
      } catch (e) {
        // Si el refresh_token murió (contraseña cambiada, permiso
        // revocado), hay que volver a conectar desde cero.
        _clearTokens();
        _lastErr = 'sesion';
        return null;
      } finally {
        _refreshing = null;
      }
    })();
    return _refreshing;
  }

  function disconnect() {
    _clearTokens();
    _player = null; _devices = []; _open = false;
    _stopPolling();
    _paint();
    Toast.warning('Spotify desconectado de la app');
  }

  // ── 3. LLAMADAS A LA API ─────────────────────────────────────────────

  async function _call(path, { method = 'GET', body = null, retry = true } = {}) {
    const token = await _freshToken();
    if (!token) return { ok: false, status: 401 };

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      _lastErr = 'red';
      return { ok: false, status: 0 };
    }

    // 401 con token que creíamos bueno: forzamos renovación y
    // reintentamos una sola vez.
    if (res.status === 401 && retry) {
      if (_tokens) _tokens.expires_at = 0;
      return _call(path, { method, body, retry: false });
    }
    // 204 = todo bien, sin contenido (es lo normal en play/pause/next).
    if (res.status === 204) return { ok: true, status: 204, data: null };
    if (res.status === 429) { _lastErr = 'limite'; return { ok: false, status: 429 }; }
    if (res.status === 403) { _lastErr = 'premium'; return { ok: false, status: 403 }; }
    if (res.status === 404) { _lastErr = 'dispositivo'; return { ok: false, status: 404 }; }

    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) { _lastErr = 'api'; return { ok: false, status: res.status, data }; }
    _lastErr = null;
    return { ok: true, status: res.status, data };
  }

  async function _fetchPlayer() {
    const r = await _call('/me/player');
    if (r.ok && r.data) {
      _player = r.data;
      _idle = false;
      _logTrack(r.data);
    } else if ((r.ok && r.status === 204) || r.status === 404) {
      // 204 aquí significa: no hay nada reproduciéndose en ningún
      // dispositivo. 404 es lo mismo visto desde otro endpoint. No es
      // un error — es el estado normal antes de darle play.
      _player = null;
      _idle = true;
    }
    return r;
  }

  async function _fetchDevices() {
    const r = await _call('/me/player/devices');
    if (r.ok && r.data) _devices = r.data.devices || [];
    return r;
  }

  // ── 4. BITÁCORA LOCAL DE CANCIONES ───────────────────────────────────
  // Se guarda qué sonaba y cuándo, solo en este teléfono. Todavía no se
  // sube a ningún lado — la idea es poder cruzarlo más adelante en
  // Patrones ("¿rindes distinto según lo que escuchas?"), pero para eso
  // hacen falta varias semanas de datos primero.

  function _logTrack(p) {
    const t = p?.item;
    if (!t || !p.is_playing) return;
    if (t.id === _loggedId) return;
    if (!(Workout?.hasActiveSession?.() || Cardio?.hasActiveSession?.())) return;
    _loggedId = t.id;

    const log = _readJSON(K_LOG, []);
    log.push({
      ts: Date.now(),
      id: t.id,
      name: t.name,
      artist: (t.artists || []).map(a => a.name).join(', '),
      ms: t.duration_ms,
      kind: Workout?.hasActiveSession?.() ? 'fuerza' : 'cardio',
    });
    // Tope de 500 entradas — suficiente para meses de sesiones y no
    // llena el almacenamiento del navegador.
    _writeJSON(K_LOG, log.slice(-500));
  }

  function getTrackLog() { return _readJSON(K_LOG, []); }
  function clearTrackLog() { try { localStorage.removeItem(K_LOG); } catch (e) {} }

  // ── 5. CONTROLES ─────────────────────────────────────────────────────

  async function _act(fn, optimistic) {
    if (_busy) return;
    _busy = true;
    if (optimistic) { optimistic(); _paint(); }
    Haptics?.light?.();
    const r = await fn();
    _busy = false;

    if (!r.ok) {
      if (r.status === 404) { await _fetchDevices(); _open = true; _paint(); _toastNoDevice(); }
      else if (r.status === 403) Toast.error('Spotify necesita Premium para controlar la reproducción');
      else if (r.status === 429) Toast.warning('Spotify pidió esperar un momento — intenta en unos segundos');
      else Toast.error('No se pudo mandar la orden a Spotify');
    }
    // Spotify tarda un momento en reflejar el cambio; esperamos un
    // poco antes de volver a preguntar o vemos el estado viejo.
    setTimeout(async () => { await _fetchPlayer(); _paint(); }, 450);
  }

  function _toastNoDevice() {
    Toast.warning('No hay nada sonando — abre Spotify y dale play, o elige un dispositivo aquí abajo');
  }

  function toggle() {
    const playing = _player?.is_playing;
    _act(
      () => _call(playing ? '/me/player/pause' : '/me/player/play', { method: 'PUT' }),
      () => { if (_player) _player.is_playing = !playing; }
    );
  }
  function next()  { _act(() => _call('/me/player/next',     { method: 'POST' })); }
  function prev()  { _act(() => _call('/me/player/previous', { method: 'POST' })); }

  function setVolume(pct) {
    const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    if (_player?.device) _player.device.volume_percent = v;
    clearTimeout(setVolume._t);
    // Al arrastrar el deslizador se disparan decenas de eventos; solo
    // mandamos el último para no toparnos con el límite de Spotify.
    setVolume._t = setTimeout(() => {
      _call(`/me/player/volume?volume_percent=${v}`, { method: 'PUT' });
    }, 260);
  }

  async function useDevice(id) {
    _busy = true;
    const r = await _call('/me/player', { method: 'PUT', body: { device_ids: [id], play: true } });
    _busy = false;
    if (!r.ok) {
      Toast.error('No se pudo cambiar de dispositivo');
      return;
    }
    Toast.success('Música enviada a ese dispositivo 🎧');
    setTimeout(async () => { await _fetchPlayer(); _paint(); }, 700);
  }

  async function refresh() {
    await Promise.all([_fetchPlayer(), _fetchDevices()]);
    _paint();
  }

  // ── 6. CICLO DE CONSULTA ─────────────────────────────────────────────
  // Dos relojes distintos, a propósito:
  //   · _poll pregunta a Spotify (3s abierta, 10s colapsada)
  //   · _render solo mueve la barra de progreso localmente cada segundo,
  //     sin gastar una llamada — así se ve fluida sin castigar la cuota
  // Ambos se apagan cuando la pantalla se bloquea o la app pasa a
  // segundo plano.

  function _pollMs() { return _open ? 3000 : 10000; }

  function _startPolling() {
    _stopPolling();
    if (!isConnected()) return;
    refresh();
    _poll = setInterval(() => {
      if (document.hidden) return;
      _fetchPlayer().then(_paint);
    }, _pollMs());
    _render = setInterval(() => {
      if (document.hidden || !_player?.is_playing) return;
      _player.progress_ms = Math.min((_player.progress_ms || 0) + 1000, _player.item?.duration_ms || 0);
      _paintProgress();
    }, 1000);
  }

  function _stopPolling() {
    if (_poll) clearInterval(_poll); _poll = null;
    if (_render) clearInterval(_render); _render = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Al volver de la pantalla bloqueada, el estado que teníamos está
    // viejo — se pide fresco de inmediato en vez de esperar al tick.
    if (_poll) refresh();
  });

  // ── 7. ¿SE DEBE VER LA BURBUJA? ──────────────────────────────────────

  function enabled() {
    const v = (() => { try { return localStorage.getItem(K_ENABLED); } catch (e) { return null; } })();
    return v === null ? true : v === '1';
  }
  function setEnabled(on) {
    try { localStorage.setItem(K_ENABLED, on ? '1' : '0'); } catch (e) {}
    sync();
  }

  function _inSession() {
    return !!(
      (typeof Workout !== 'undefined' && Workout.hasActiveSession?.()) ||
      (typeof Cardio  !== 'undefined' && Cardio.hasActiveSession?.()) ||
      // El cronómetro de recuperación cuenta como sesión: técnicamente
      // el protocolo ya terminó, pero Diego sigue sobre la caminadora
      // esos dos minutos y es justo cuando quiere bajarle a la música.
      document.getElementById('rt-clock')
    );
  }

  function _shouldShow() { return isConnected() && enabled() && _inSession(); }

  // Se llama al iniciar/terminar sesión y en cada cambio de página.
  function sync() {
    const show = _shouldShow();
    const el = document.getElementById('spotify-bubble');

    if (!show) {
      _stopPolling();
      if (el) {
        gsap.to(el, { opacity: 0, scale: 0.8, duration: 0.2, ease: 'power2.in',
          onComplete: () => el.remove() });
      }
      return;
    }
    if (!el) {
      _open = (() => { try { return localStorage.getItem(K_OPEN) === '1'; } catch (e) { return false; } })();
      _mount();
      _startPolling();
    }
  }

  // ── 8. MONTAJE Y ARRASTRE ────────────────────────────────────────────

  function _defaultPos() {
    return { x: window.innerWidth - 88, y: Math.round(window.innerHeight * 0.55) };
  }

  function _loadPos() {
    const p = _readJSON(K_POS, null);
    if (!p || typeof p.x !== 'number') return _defaultPos();
    // Si cambió el tamaño de pantalla (rotación, otro teléfono), la
    // posición guardada puede quedar fuera de la vista.
    return {
      x: Math.max(8, Math.min(p.x, window.innerWidth - 80)),
      y: Math.max(8, Math.min(p.y, window.innerHeight - 100)),
    };
  }

  function _mount() {
    const el = document.createElement('div');
    el.id = 'spotify-bubble';
    el.className = _open ? 'sp-bubble sp-open' : 'sp-bubble';
    const pos = _loadPos();
    el.style.left = pos.x + 'px';
    el.style.top  = pos.y + 'px';
    document.body.appendChild(el);
    _paint();

    gsap.fromTo(el,
      { opacity: 0, scale: 0.6 },
      { opacity: 1, scale: 1, duration: 0.45, ease: 'fittrackerSpring' });

    _attachDrag(el);
  }

  // Arrastre con Pointer Events (funciona igual con dedo y con mouse).
  // El truco está en distinguir un toque de un arrastre: hasta que no
  // se mueve más de 6px no se considera arrastre, así un tap limpio
  // sigue abriendo/cerrando la burbuja.
  function _attachDrag(el) {
    let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, id = null;

    el.addEventListener('pointerdown', e => {
      // Los controles de adentro (botones, deslizador) manejan su
      // propio toque — no deben arrastrar la burbuja.
      if (e.target.closest('[data-no-drag]')) return;
      id = e.pointerId;
      sx = e.clientX; sy = e.clientY;
      ox = parseFloat(el.style.left) || 0;
      oy = parseFloat(el.style.top) || 0;
      moved = false; _dragging = false;
      try { el.setPointerCapture(id); } catch (err) {}
    });

    el.addEventListener('pointermove', e => {
      if (id === null || e.pointerId !== id) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true; _dragging = true;
      el.classList.add('sp-dragging');
      el.style.left = Math.max(8, Math.min(ox + dx, window.innerWidth  - el.offsetWidth  - 8)) + 'px';
      el.style.top  = Math.max(8, Math.min(oy + dy, window.innerHeight - el.offsetHeight - 8)) + 'px';
    });

    const end = e => {
      if (id === null || (e.pointerId !== undefined && e.pointerId !== id)) return;
      try { el.releasePointerCapture(id); } catch (err) {}
      id = null;
      el.classList.remove('sp-dragging');

      if (!moved) { _tap(); return; }

      // Se pega al borde más cercano, como las burbujas de chat —
      // así nunca queda a medias tapando el contenido.
      const cx = parseFloat(el.style.left) + el.offsetWidth / 2;
      const left = cx < window.innerWidth / 2;
      const target = left ? 12 : window.innerWidth - el.offsetWidth - 12;
      gsap.to(el, { left: target, duration: 0.35, ease: 'fittrackerSpring',
        onComplete: () => _writeJSON(K_POS, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) }) });
      setTimeout(() => { _dragging = false; }, 60);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function _tap() {
    if (_dragging) return;
    _open = !_open;
    try { localStorage.setItem(K_OPEN, _open ? '1' : '0'); } catch (e) {}
    Haptics?.light?.();

    const el = document.getElementById('spotify-bubble');
    if (!el) return;
    el.classList.toggle('sp-open', _open);
    _paint();

    // Al expandirse puede salirse de la pantalla por el lado derecho —
    // se reacomoda sola.
    requestAnimationFrame(() => {
      const maxX = window.innerWidth - el.offsetWidth - 12;
      if (parseFloat(el.style.left) > maxX) gsap.to(el, { left: maxX, duration: 0.3, ease: 'fittrackerFast' });
      gsap.fromTo(el.querySelector('.sp-panel') || el,
        { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'fittrackerFast' });
    });

    _stopPolling(); _startPolling(); // el ritmo de consulta cambia según esté abierta o cerrada
  }

  function close() { if (_open) _tap(); }

  // ── 9. PINTADO ───────────────────────────────────────────────────────

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _mmss(ms) {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function _cover(p) {
    const imgs = p?.item?.album?.images || [];
    // El arreglo viene de mayor a menor; la mediana se ve bien y pesa
    // una fracción de la grande.
    return imgs[1]?.url || imgs[0]?.url || imgs[imgs.length - 1]?.url || null;
  }

  function _pct() {
    const d = _player?.item?.duration_ms;
    if (!d) return 0;
    return Math.max(0, Math.min(100, ((_player.progress_ms || 0) / d) * 100));
  }

  // Solo mueve la barra y el reloj, sin repintar todo — así el DOM no
  // parpadea cada segundo ni se pierde el foco del deslizador.
  function _paintProgress() {
    const fill = document.getElementById('sp-progress-fill');
    const ring = document.getElementById('sp-ring');
    const cur  = document.getElementById('sp-elapsed');
    const pct  = _pct();
    if (fill) fill.style.width = pct + '%';
    if (ring) ring.style.background =
      `conic-gradient(var(--accent) ${pct * 3.6}deg, rgba(255,255,255,0.10) 0deg)`;
    if (cur) cur.textContent = _mmss(_player?.progress_ms);
  }

  function _paint() {
    const el = document.getElementById('spotify-bubble');
    if (!el) return;

    const t = _player?.item;
    const playing = !!_player?.is_playing;
    const cover = _cover(_player);
    const pct = _pct();

    const art = cover
      ? `<img src="${_esc(cover)}" alt="" class="sp-art-img">`
      : `<div class="sp-art-img sp-art-empty">🎧</div>`;

    if (!_open) {
      el.innerHTML = `
        <div class="sp-ring" id="sp-ring"
             style="background:conic-gradient(var(--accent) ${pct * 3.6}deg, rgba(255,255,255,0.10) 0deg)">
          <div class="sp-art ${playing ? 'sp-spin' : ''}">${art}</div>
        </div>
        ${playing ? `<div class="sp-eq"><i></i><i></i><i></i></div>` : ''}`;
      return;
    }

    // ── Panel expandido ──
    const noDevice = !_player && (_idle || _lastErr === 'dispositivo');

    el.innerHTML = `
      <div class="sp-panel">
        <div class="sp-head">
          <span class="sp-logo">🎧 Spotify</span>
          <button class="sp-x" data-no-drag onclick="Spotify.close()" aria-label="Cerrar">✕</button>
        </div>

        ${noDevice ? `
          <div class="sp-empty">
            <div class="sp-empty-title">Nada sonando ahorita</div>
            <div class="sp-empty-sub">Elige dónde quieres que suene:</div>
            ${_devices.length ? _devices.map(d => `
              <button class="sp-device" data-no-drag onclick="Spotify.useDevice('${_esc(d.id)}')">
                <span>${d.type === 'Smartphone' ? '📱' : d.type === 'Computer' ? '💻' : d.type === 'Speaker' ? '🔊' : '🎵'}</span>
                <span class="sp-device-name">${_esc(d.name)}</span>
                ${d.is_active ? '<span class="sp-device-on">activo</span>' : ''}
              </button>`).join('')
              : `<div class="sp-empty-sub" style="margin-top:8px">No veo ningún dispositivo. Abre Spotify en tu teléfono o compu y dale play una vez — después ya lo controlas desde aquí.</div>`}
            <button class="sp-refresh" data-no-drag onclick="Spotify.refresh()">↻ Buscar de nuevo</button>
          </div>
        ` : `
          <div class="sp-now">
            <div class="sp-art sp-art-lg ${playing ? 'sp-spin' : ''}">${art}</div>
            <div class="sp-meta">
              <div class="sp-title">${_esc(t?.name || 'Sin canción')}</div>
              <div class="sp-artist">${_esc((t?.artists || []).map(a => a.name).join(', ') || '—')}</div>
            </div>
          </div>

          <div class="sp-progress" data-no-drag>
            <div class="sp-progress-bar"><div class="sp-progress-fill" id="sp-progress-fill" style="width:${pct}%"></div></div>
            <div class="sp-times">
              <span id="sp-elapsed">${_mmss(_player?.progress_ms)}</span>
              <span>${_mmss(t?.duration_ms)}</span>
            </div>
          </div>

          <div class="sp-controls" data-no-drag>
            <button class="sp-btn" onclick="Spotify.prev()" aria-label="Anterior">⏮</button>
            <button class="sp-btn sp-btn-main" onclick="Spotify.toggle()" aria-label="${playing ? 'Pausar' : 'Reproducir'}">
              ${playing ? '⏸' : '▶'}
            </button>
            <button class="sp-btn" onclick="Spotify.next()" aria-label="Siguiente">⏭</button>
          </div>

          <div class="sp-vol" data-no-drag>
            <span class="sp-vol-ico">🔈</span>
            <input type="range" min="0" max="100" value="${_player?.device?.volume_percent ?? 50}"
                   oninput="Spotify.setVolume(this.value)">
          </div>

          ${_player?.device ? `
            <button class="sp-dev-line" data-no-drag onclick="Spotify.refresh()">
              Sonando en <strong>${_esc(_player.device.name)}</strong>
            </button>` : ''}
        `}
      </div>`;
  }

  // ── 10. ESTADO PARA CONFIGURACIÓN ────────────────────────────────────

  function status() {
    return {
      connected: isConnected(),
      enabled: enabled(),
      tracks: getTrackLog().length,
      device: _player?.device?.name || null,
      redirectUri: CONFIG.SPOTIFY?.REDIRECT_URI || '',
      clientId: CONFIG.SPOTIFY?.CLIENT_ID || '',
    };
  }

  return {
    connect, disconnect, handleRedirect, isConnected, status,
    toggle, next, prev, setVolume, useDevice, refresh, close,
    sync, enabled, setEnabled,
    getTrackLog, clearTrackLog,
  };
})();
