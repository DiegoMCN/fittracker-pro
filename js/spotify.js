// ═══════════════════════════════════════════
// SPOTIFY — bitácora de qué música sonó en cada momento del entrenamiento
//
// Antes esto era un reproductor flotante. Se quitó: controlar la música
// ya lo hace Spotify, y mejor; la burbuja competía con la pantalla de la
// sesión, que es lo que de verdad hay que ver mientras se entrena. Lo
// que SÍ vale es el dato: qué sonaba, en qué minuto, en qué fase.
//
// Por qué ese dato importa más de lo que parece: en noviembre de 2024
// Spotify cerró a las apps nuevas los endpoints de recomendaciones y de
// "audio features" (energía, tempo, bailabilidad). Ya no se le puede
// pedir "dame rolas de 140 BPM intensas". La única fuente posible para
// armar un playlist a la medida es el historial propio — y es justo lo
// que este archivo construye.
//
// Autorización con PKCE: no necesita client secret, por eso funciona en
// GitHub Pages sin servidor. El secret NUNCA debe vivir aquí.
//
// Solo pide permisos de LECTURA. No puede pausar, saltar ni modificar
// nada de la cuenta. Si algún día se arman playlists, ahí se pedirá el
// permiso de escritura y habrá que autorizar una vez más.
// ═══════════════════════════════════════════

const Spotify = (() => {

  const AUTH_URL  = 'https://accounts.spotify.com/authorize';
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const API_BASE  = 'https://api.spotify.com/v1';

  // Solo lectura, a propósito (ver arriba).
  const SCOPES = [
    'user-read-playback-state',
    'user-read-currently-playing',
  ].join(' ');

  const K_TOKENS   = 'fittracker_spotify_tokens';
  const K_VERIFIER = 'fittracker_spotify_verifier';
  const K_STATE    = 'fittracker_spotify_state';
  const K_LOG      = 'fittracker_spotify_track_log';
  const K_ENABLED  = 'fittracker_spotify_logging';

  let _tokens     = null;
  let _poll       = null;
  let _refreshing = null;  // promesa compartida: si llegan varias llamadas con el token vencido, solo se renueva una vez
  let _lastKey    = null;  // última canción ya anotada, para no repetirla en cada vuelta
  let _lastSesId  = null;  // de qué sesión era esa última canción

  // Cada 20 segundos. Una canción dura 3-4 minutos, así que ninguna se
  // escapa, y es ocho veces más barato en batería y en cuota que los 3
  // segundos que necesitaba el reproductor para mover la barrita.
  const POLL_MS = 20000;

  // ── ALMACENAMIENTO ───────────────────────────────────────────────────

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

  // ── PKCE ─────────────────────────────────────────────────────────────
  // El "code verifier" es una cadena aleatoria que se queda en este
  // teléfono. A Spotify solo le mandamos su hash. Cuando regresa el
  // código, le enseñamos el verifier original — así comprueba que quien
  // pide el token es quien inició el flujo, sin que haya ningún secreto
  // escrito en el código.

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
    // crypto.subtle solo existe en contextos seguros (https o localhost).
    // En GitHub Pages siempre es https, pero abierto con file:// truena
    // sin explicación.
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

  // Se llama al arrancar la app. Si venimos de vuelta de Spotify, la URL
  // trae ?code=...&state=... — se canjea y se limpia la URL, porque
  // Spotify solo acepta ese código una vez y un refresh lo reintentaría.
  async function handleRedirect() {
    const params = new URLSearchParams(location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (!code && !error) return false;

    let saved = null;
    try { saved = localStorage.getItem(K_STATE); } catch (e) {}
    const verifier = (() => { try { return localStorage.getItem(K_VERIFIER); } catch (e) { return null; } })();

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

  // El access_token dura una hora. Se renueva 60s antes de vencer.
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
          // si no viene, el viejo sigue sirviendo.
          refresh_token: json.refresh_token || _tokens.refresh_token,
          expires_at: Date.now() + (json.expires_in || 3600) * 1000,
        });
        return _tokens.access_token;
      } catch (e) {
        // Si el refresh_token murió (contraseña cambiada, permiso
        // revocado), hay que volver a conectar desde cero.
        _clearTokens();
        return null;
      } finally {
        _refreshing = null;
      }
    })();
    return _refreshing;
  }

  function disconnect() {
    _clearTokens();
    _stopPolling();
    Toast.warning('Spotify desconectado de la app');
  }

  // ── LLAMADA A LA API ─────────────────────────────────────────────────

  async function _call(path, { retry = true } = {}) {
    const token = await _freshToken();
    if (!token) return { ok: false, status: 401 };

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      return { ok: false, status: 0 };
    }

    // 401 con un token que creíamos bueno: se fuerza la renovación y se
    // reintenta una sola vez.
    if (res.status === 401 && retry) {
      if (_tokens) _tokens.expires_at = 0;
      return _call(path, { retry: false });
    }
    // 204 = no hay nada sonando en ningún lado. No es un error.
    if (res.status === 204) return { ok: true, status: 204, data: null };
    if (!res.ok) return { ok: false, status: res.status };

    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { ok: true, status: res.status, data };
  }

  // ── CONTEXTO DE LA SESIÓN ────────────────────────────────────────────
  // Lo que vuelve útil al registro no es la canción sola, sino qué
  // estabas haciendo cuando sonó. En cardio eso es la fase y la
  // velocidad — justo el dato que haría falta si algún día se arman
  // playlists por intensidad.

  function _sessionContext() {
    try {
      if (typeof Cardio !== 'undefined' && Cardio.hasActiveSession?.()) {
        const c = Cardio.musicContext?.() || {};
        return {
          kind: 'cardio',
          startedAt: c.startedAt || null,
          day: c.day,
          protocol: c.protocol || null,
          phase: c.phase || null,
          speed: c.speed || null,
          effort: c.effort || null,
        };
      }
      if (typeof Workout !== 'undefined' && Workout.hasActiveSession?.()) {
        const w = Workout.musicContext?.() || {};
        return {
          kind: 'fuerza',
          startedAt: w.startedAt || null,
          day: w.day,
          exercise: w.exercise || null,
        };
      }
    } catch (e) {}
    return null;
  }

  // ── BITÁCORA ─────────────────────────────────────────────────────────
  // El teléfono es SOLO el buffer. Lo que se junta aquí se manda al
  // Sheet al terminar la sesión (una llamada con todo el lote, no una
  // por canción) y ahí es donde vive de verdad.
  //
  // Antes esto se quedaba nada más en localStorage, y eso no servía para
  // lo que queremos hacer con el dato: se borra al limpiar los datos del
  // sitio o al reinstalar la app, no existe si abres desde la compu, y
  // el backend no lo puede leer — o sea, ni el Coach ni Patrones podrían
  // usarlo nunca. Para algo que solo vale acumulado durante meses, era
  // justo el lugar equivocado.

  function _logTrack(p, ctx) {
    const t = p?.item;
    if (!t || !p.is_playing || !ctx) return;

    // Clave canción+momento: si la misma rola sigue sonando en la
    // siguiente vuelta no se duplica, pero si vuelve a sonar más tarde
    // en otra fase o en otro ejercicio sí se anota aparte — es otro
    // momento del entrenamiento.
    const key = `${t.id}|${ctx.phase || ctx.exercise || ''}`;
    if (key === _lastKey) return;
    _lastKey = key;

    const log = _readJSON(K_LOG, []);
    const now = new Date();
    log.push({
      ts: Date.now(),
      // Fecha local, no toISOString() — en Cancún (UTC-5) una sesión de
      // las 8 de la noche se guardaría con la fecha del día siguiente.
      date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
      // Segundo de la sesión en que sonó — esto es lo que después
      // permite cruzarla con la serie o el intervalo exacto.
      sec: ctx.startedAt ? Math.round((Date.now() - ctx.startedAt) / 1000) : null,
      id: t.id,
      uri: t.uri || null,          // hace falta si algún día se arma un playlist
      name: t.name,
      artist: (t.artists || []).map(a => a.name).join(', '),
      ms: t.duration_ms,
      kind: ctx.kind,
      day: (typeof ctx.day === 'number') ? ctx.day : new Date().getDay(),
      protocol: ctx.protocol || null,
      phase: ctx.phase || null,
      speed: ctx.speed || null,
      effort: ctx.effort || null,
      exercise: ctx.exercise || null,
    });
    // Tope de 1500 entradas — son meses de sesiones y no llena el
    // almacenamiento del navegador.
    _writeJSON(K_LOG, log.slice(-1500));
  }

  // ── ENVÍO AL SHEET ───────────────────────────────────────────────────
  // Se llama al terminar la sesión. Manda lo pendiente en un solo lote.
  //
  // Lo que se logró enviar se borra del teléfono; lo que no, se queda
  // para el próximo intento. El backend ignora los duplicados por su
  // cuenta (clave Timestamp+Track_ID), así que reintentar nunca ensucia
  // la hoja — por eso se puede ser optimista aquí sin miedo.
  async function flush() {
    const pend = _readJSON(K_LOG, []);
    if (!pend.length) return { saved: 0 };
    try {
      const res = await API.saveMusicLog(pend);
      if (res && (res.success || res.queued)) {
        // Solo se limpia lo que ya estaba cuando empezamos: si entró una
        // canción nueva mientras viajaba la petición, no se pierde.
        const ahora = _readJSON(K_LOG, []);
        const idsEnviados = new Set(pend.map(e => `${e.ts}|${e.id}`));
        _writeJSON(K_LOG, ahora.filter(e => !idsEnviados.has(`${e.ts}|${e.id}`)));
        return { saved: res.saved ?? pend.length, queued: !!res.queued };
      }
    } catch (e) {}
    // Se queda en el teléfono y se reintenta al terminar la próxima sesión.
    return { saved: 0, pending: pend.length };
  }

  function pendingCount() { return _readJSON(K_LOG, []).length; }

  function getTrackLog() { return _readJSON(K_LOG, []); }
  function clearTrackLog() { try { localStorage.removeItem(K_LOG); } catch (e) {} _lastKey = null; }

  // ── RESUMEN PARA EL DASHBOARD ────────────────────────────────────────
  // "Lo que suena en cada día de entrenamiento": agrupa por día de la
  // semana, porque cada día es un entreno distinto (lunes jalón, martes
  // piernas…), y dentro de cada uno cuenta repeticiones.

  // `entries` son las filas del Sheet (la fuente de verdad). Si no se
  // pasan, se usa lo que todavía no se ha subido de este teléfono —
  // sirve para que el Dashboard muestre algo justo después de entrenar,
  // antes de que el envío haya terminado.
  function topByDay({ limit = 3, entries = null } = {}) {
    const log = entries || getTrackLog();
    const byDay = {};
    log.forEach(e => {
      const d = (typeof e.day === 'number') ? e.day : new Date(e.ts).getDay();
      byDay[d] = byDay[d] || {};
      const k = e.id || `${e.name}|${e.artist}`;
      byDay[d][k] = byDay[d][k] || { name: e.name, artist: e.artist, uri: e.uri, count: 0 };
      byDay[d][k].count++;
    });

    // Lunes primero, domingo al final — como se lee un calendario, no
    // como los numera JavaScript (que arranca en domingo).
    const ord = n => (n === 0 ? 7 : n);

    return Object.keys(byDay).map(Number).sort((a, b) => ord(a) - ord(b)).map(d => ({
      day: d,
      label: CONFIG.WEEK_PLAN?.[d]?.name || '',
      icon: CONFIG.WEEK_PLAN?.[d]?.icon || '🎵',
      total: Object.values(byDay[d]).reduce((s, t) => s + t.count, 0),
      tracks: Object.values(byDay[d]).sort((a, b) => b.count - a.count).slice(0, limit),
    })).filter(r => r.tracks.length > 0);
  }

  // ── CICLO DE REGISTRO ────────────────────────────────────────────────

  function enabled() {
    const v = (() => { try { return localStorage.getItem(K_ENABLED); } catch (e) { return null; } })();
    return v === null ? true : v === '1';
  }
  function setEnabled(on) {
    try { localStorage.setItem(K_ENABLED, on ? '1' : '0'); } catch (e) {}
    sync();
  }

  async function _tick() {
    // Con la pantalla bloqueada o la app en segundo plano no se
    // pregunta: el navegador congela los timers de todas formas, y
    // gastar cuota por nada no tiene caso.
    if (document.hidden) return;
    const ctx = _sessionContext();
    if (!ctx) return;

    // Si cambió la sesión (terminó el cardio y arrancó la fuerza, por
    // ejemplo), se olvida la última canción anotada. Si no, una rola que
    // venía sonando desde la sesión anterior se tomaría por repetida y
    // no quedaría registrada en la nueva.
    const sesId = `${ctx.kind}|${ctx.startedAt || ''}`;
    if (sesId !== _lastSesId) { _lastSesId = sesId; _lastKey = null; }

    const r = await _call('/me/player/currently-playing');
    if (r.ok && r.data) _logTrack(r.data, ctx);
  }

  function _startPolling() {
    _stopPolling();
    _lastKey = null; _lastSesId = null;
    _tick();
    _poll = setInterval(_tick, POLL_MS);
  }

  function _stopPolling() {
    if (_poll) clearInterval(_poll);
    _poll = null;
  }

  // Se llama al iniciar y al terminar sesión, y al arrancar la app.
  function sync() {
    const should = isConnected() && enabled() && !!_sessionContext();
    if (should && !_poll) _startPolling();
    else if (!should && _poll) _stopPolling();
  }

  // Al volver de la pantalla bloqueada se pregunta de inmediato, en vez
  // de esperar hasta 20 segundos al siguiente tick.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _poll) _tick();
  });

  // ── ESTADO PARA CONFIGURACIÓN ────────────────────────────────────────

  function status() {
    const log = getTrackLog();
    return {
      connected: isConnected(),
      enabled: enabled(),
      pending: log.length,   // lo que todavía no se ha subido al Sheet
      redirectUri: CONFIG.SPOTIFY?.REDIRECT_URI || '',
    };
  }

  return {
    connect, disconnect, handleRedirect, isConnected, status,
    sync, enabled, setEnabled,
    getTrackLog, clearTrackLog, topByDay, flush, pendingCount,
  };
})();
