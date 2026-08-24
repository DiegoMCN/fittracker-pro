// ═══════════════════════════════════════════
// UTILS + SOUNDS + STORE + ROUTER
// ═══════════════════════════════════════════

// ── SOUNDS (Web Audio API — sin archivos externos) ────────────────────────
const Sounds = (() => {
  let ctx = null;
  let enabled = true;

  function _ctx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function _beep(freq, duration, type = 'sine', gain = 0.3, delay = 0) {
    if (!enabled) return;
    try {
      const c = _ctx();
      const osc = c.createOscillator();
      const g   = c.createGain();
      osc.connect(g); g.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + delay);
      g.gain.setValueAtTime(0, c.currentTime + delay);
      g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + duration + 0.05);
    } catch(e) {}
  }

  return {
    toggle() { enabled = !enabled; return enabled; },
    isEnabled() { return enabled; },

    serieStart()    { _beep(440, 0.1, 'square', 0.2); },
    serieDone()     { _beep(880, 0.15); _beep(1100, 0.2, 'sine', 0.25, 0.15); },
    restStart()     { _beep(330, 0.12, 'sine', 0.2); },
    restWarning()   { [0, 0.15, 0.3].forEach(d => _beep(660, 0.1, 'square', 0.15, d)); },
    restDone()      { _beep(880, 0.4); _beep(1100, 0.3, 'sine', 0.3, 0.35); },
    countdown(n)    { _beep(n > 1 ? 550 : 880, 0.08, 'square', 0.2); },
    sessionDone()   {
      [440,554,660,880].forEach((f, i) => _beep(f, 0.25, 'sine', 0.3, i * 0.15));
    },
    hitPhase(effort) {
      const freqs = { easy: 330, moderate: 550, max: 880 };
      _beep(freqs[effort] || 440, 0.2, 'square', 0.25);
    },
    newRecord()     {
      [523,659,784,1047].forEach((f,i) => _beep(f, 0.2, 'sine', 0.35, i * 0.1));
    },
    click()         { _beep(440, 0.05, 'square', 0.1); },
    error()         { _beep(200, 0.3, 'sawtooth', 0.2); },
  };
})();

// ── VIBRATION ────────────────────────────────────────────────────────────
const Haptics = {
  light()   { navigator.vibrate?.(50); },
  medium()  { navigator.vibrate?.(100); },
  heavy()   { navigator.vibrate?.([100, 50, 100]); },
  success() { navigator.vibrate?.([200, 100, 200]); },
  done()    { navigator.vibrate?.([500, 200, 500, 200, 1000]); },
};

// ── WAKE LOCK ─────────────────────────────────────────────────────────────
const WakeLock = (() => {
  let sentinel = null;
  return {
    async request() {
      try {
        if ('wakeLock' in navigator) {
          sentinel = await navigator.wakeLock.request('screen');
          sentinel.addEventListener('release', () => { sentinel = null; });
        }
      } catch(e) {}
    },
    release() { sentinel?.release(); sentinel = null; },
    isActive() { return sentinel !== null; }
  };
})();

// ── UTILS ─────────────────────────────────────────────────────────────────
const Utils = {
  // Formato de fecha — robusto ante fechas mal formadas (ej. si el Sheet
  // devuelve un timestamp ISO completo en vez de solo YYYY-MM-DD).
  formatDate(dateStr) {
    if (!dateStr) return '—';
    let iso = String(dateStr);
    if (iso.includes('T')) iso = iso.split('T')[0];
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  formatDateShort(dateStr) {
    if (!dateStr) return '—';
    let iso = String(dateStr);
    if (iso.includes('T')) iso = iso.split('T')[0];
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  },
  dayName(dayNum) {
    return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][dayNum];
  },
  today() {
    // OJO: nunca usar toISOString() aquí — convierte a UTC y puede
    // regresar el día equivocado según tu zona horaria. Esto usa los
    // componentes de fecha LOCALES del navegador.
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  todayDayNum() { return new Date().getDay(); },

  // Formato de tiempo
  formatDuration(minutes) {
    if (!minutes) return '—';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  },
  formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2,'0');
    const s = (seconds % 60).toString().padStart(2,'0');
    return `${m}:${s}`;
  },

  // Conversiones
  lbsToKg(lbs) { return Math.round(lbs * 0.453592 * 10) / 10; },
  kgToLbs(kg)  { return Math.round(kg * 2.20462 * 10) / 10; },

  // Volumen
  calcVolume(reps, kg, unit) {
    if (unit === 'seg' || unit === 'PC') return 0;
    const kgVal = unit === 'lbs' ? Utils.lbsToKg(kg) : kg;
    return Math.round(reps * kgVal * 10) / 10;
  },

  // Delta
  formatDelta(value, suffix = '') {
    if (value === null || value === undefined) return '';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value}${suffix}`;
  },
  deltaClass(value, higherIsBetter = true) {
    if (!value) return 'flat';
    return (value > 0) === higherIsBetter ? 'up' : 'down';
  },

  // Porcentaje de progreso
  progress(current, baseline, target) {
    if (target === baseline) return 100;
    return Math.min(100, Math.max(0,
      Math.round(((current - baseline) / (target - baseline)) * 100)
    ));
  },

  // Zona cardíaca
  getZone(bpm) {
    for (const [z, zone] of Object.entries(CONFIG.HR_ZONES)) {
      if (bpm >= zone.min && bpm <= zone.max) return { zone: parseInt(z), ...zone };
    }
    return CONFIG.HR_ZONES[1];
  },

  // Tag HTML para grupo muscular
  muscleTag(group) {
    const map = {
      'Pecho':'chest','Espalda':'back','Biceps':'biceps','Triceps':'triceps',
      'Hombro':'shoulder','Cuadriceps':'legs','Isquiotibiales':'legs',
      'Pantorrillas':'legs','Core':'core','Calistenia':'cali','Cardio':'cardio'
    };
    const cls = map[group] || 'core';
    return `<span class="tag tag-${cls}">${group}</span>`;
  },

  // Truncar texto
  truncate(str, n = 30) {
    return str?.length > n ? str.slice(0, n) + '…' : (str || '—');
  },

  // Número con separador de miles
  formatNum(n, decimals = 0) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('es-MX', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },

  // Generar ID único
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); },

  // Deep clone
  clone(obj) { return JSON.parse(JSON.stringify(obj)); },

  // Debounce
  debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },

  // Clase de color por esfuerzo
  effortColor(n) {
    if (n <= 3) return '#10B981';
    if (n <= 5) return '#F59E0B';
    if (n <= 7) return '#F97316';
    return '#EF4444';
  },
};

// ── STORE (estado global simple) ──────────────────────────────────────────
const Store = (() => {
  let _state = {
    loading: false,
    currentPage: 'dashboard',
    dashboard: null,
    sessions: null,
    cardio: null,
    metrics: null,
    exercises: null,
    weekPlan: null,
    activeWorkout: null,
    soundEnabled: true,
    darkMode: true,
  };
  const _listeners = new Set();

  return {
    get(key) { return key ? _state[key] : { ..._state }; },
    set(updates) {
      _state = { ..._state, ...updates };
      _listeners.forEach(fn => fn(_state));
    },
    subscribe(fn) {
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    },
  };
})();

// ── TOAST ─────────────────────────────────────────────────────────────────
const Toast = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.className = 'toast-container';
      document.body.appendChild(this._container);
    }
    return this._container;
  },

  show(message, type = 'info', duration = 3500) {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️', record:'🏆' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <span style="font-size:18px">${icons[type] || icons.info}</span>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px;color:var(--text-1)">${message}</div>
      </div>
      <button onclick="this.closest('.toast').remove()" style="background:none;color:var(--text-3);font-size:16px;padding:4px">✕</button>
    `;
    this._getContainer().prepend(el);
    if (type === 'record') { Sounds.newRecord(); Haptics.done(); }
    if (type === 'success') { Sounds.serieDone(); Haptics.success(); }
    setTimeout(() => el.style.cssText += 'opacity:0;transform:translateX(20px);transition:all 0.3s', duration);
    setTimeout(() => el.remove(), duration + 350);
    return el;
  },

  success(msg, d) { return this.show(msg, 'success', d); },
  error(msg, d)   { return this.show(msg, 'error',   d); },
  warning(msg, d) { return this.show(msg, 'warning', d); },
  record(msg, d)  { return this.show(msg, 'record',  d); },
};

// ── ROUTER (SPA simple) ───────────────────────────────────────────────────
const Router = (() => {
  const _routes = {};
  let _current = null;

  return {
    register(name, fn) { _routes[name] = fn; },

    navigate(page, params = {}) {
      if (_current === page) return;

      // Actualizar nav activo
      document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
      });

      // Limpiar y cargar página
      const content = document.getElementById('page-content');
      if (!content) return;

      content.innerHTML = '';
      _current = page;
      Store.set({ currentPage: page });

      // Topbar title
      const titles = {
        dashboard: { title: 'Dashboard', sub: 'Tu progreso en tiempo real' },
        coach:     { title: 'Coach IA', sub: 'Tu evaluación diaria personalizada' },
        workout:   { title: 'Sesión Activa', sub: 'Modo entrenamiento' },
        cardio:    { title: 'Cardio / HIT', sub: 'Sprint & zona cardíaca' },
        plan:      { title: 'Plan Semanal', sub: 'Semana 3 · Fase 1' },
        history:   { title: 'Bitácora', sub: 'Historial de sesiones' },
        metrics:   { title: 'Métricas', sub: 'Evolución y gráficas' },
        exercises: { title: 'Ejercicios', sub: 'Catálogo y cargas' },
        perfil:    { title: 'Perfil', sub: 'Datos básicos y composición corporal' },
        import:    { title: 'Importar CSV', sub: 'Carga masiva desde Apple Watch' },
      };
      const info = titles[page] || { title: page, sub: '' };
      const ttl  = document.getElementById('topbar-title');
      const tsub = document.getElementById('topbar-subtitle');
      const mtl  = document.getElementById('mobile-title');
      if (ttl)  ttl.textContent  = info.title;
      if (tsub) tsub.textContent = info.sub;
      if (mtl)  mtl.textContent  = info.title;

      // Ejecutar módulo
      if (_routes[page]) {
        content.style.opacity = '0';
        content.style.transform = 'translateY(8px)';
        _routes[page](content, params);
        requestAnimationFrame(() => {
          content.style.transition = 'all 250ms cubic-bezier(0.4,0,0.2,1)';
          content.style.opacity = '1';
          content.style.transform = 'translateY(0)';
        });
      } else {
        content.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-3)">
          <div style="font-size:48px;margin-bottom:16px">🚧</div>
          <div style="font-weight:600">Módulo en construcción</div>
          <div style="font-size:12px;margin-top:8px">${page}</div>
        </div>`;
      }

      // Cerrar sidebar en mobile
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('open');

      // Notificar a los módulos de sesión persistente para actualizar la barra flotante
      if (typeof Workout !== 'undefined') Workout.onRouteChange();
      if (typeof Cardio !== 'undefined') Cardio.onRouteChange();
    },

    current() { return _current; }
  };
})();
