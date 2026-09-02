// ═══════════════════════════════════════════
// API — FitTracker Pro
// Todas las llamadas al Apps Script backend
// ═══════════════════════════════════════════

const API = (() => {

  // Cache simple en memoria
  const _cache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  let _lastWasMock = false;

  function _cacheGet(key) {
    if (!_cache.has(key)) return null;
    const { data, ts } = _cache.get(key);
    if (Date.now() - ts > CACHE_TTL) { _cache.delete(key); return null; }
    return data;
  }
  function _cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }); }
  function clearCache() { _cache.clear(); }

  // Un solo intento de red — usado tanto por el retry loop como por la
  // cola offline al reintentar items pendientes.
  async function _attemptFetch(params) {
    let res;
    if (params.method === 'POST') {
      // text/plain evita el preflight CORS que Apps Script no soporta.
      // El backend hace JSON.parse(e.postData.contents) sin importar el content-type.
      res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        body: JSON.stringify(params),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    } else {
      const qs = new URLSearchParams(params).toString();
      res = await fetch(`${CONFIG.API_URL}?${qs}`);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // Fetch base con retry
  async function _fetch(params, options = {}) {
    const { useCache = true, retries = 2 } = options;
    const cacheKey = JSON.stringify(params);

    if (useCache && params.method !== 'POST') {
      const cached = _cacheGet(cacheKey);
      if (cached) return cached;
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await _attemptFetch(params);
        _lastWasMock = false;
        if (useCache && params.method !== 'POST') _cacheSet(cacheKey, data);
        return data;
      } catch (err) {
        lastError = err;
        if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    // ── Todos los intentos fallaron ──
    if (params.method === 'POST') {
      // CRÍTICO: nunca fingir que una escritura se guardó. Se encola
      // para sincronizar en cuanto vuelva la conexión.
      if (typeof OfflineQueue !== 'undefined') {
        OfflineQueue.add(params);
        console.warn('[API] Sin conexión — escritura encolada para sincronizar después:', params.action);
        return { success: true, queued: true, message: 'Guardado localmente — se sincronizará cuando haya conexión' };
      }
      throw lastError;
    }

    // GET: cae a datos de ejemplo para que la UI muestre algo mientras tanto
    _lastWasMock = true;
    console.warn('[API] Usando datos de ejemplo (sin conexión al backend):', lastError.message);
    return _getMockData(params.action);
  }

  // ── MOCK DATA (para desarrollo sin backend) ──────────────────────────────
  function _getMockData(action) {
    const mocks = {
      getDashboard: {
        weekStreak: 3,
        thisWeek: { sessions: 2, target: 6, calories: 768, volume: 11425 },
        lastSession: { date: '2026-05-11', type: 'Fuerza', fcAvg: 137, duration: 64, effort: 8 },
        nextSession: CONFIG.WEEK_PLAN[new Date().getDay()],
        recentRecovery: { delta: -14, date: '2026-05-11' },
        goals: CONFIG.GOALS
      },
      getSessions: {
        sessions: [
          { date:'2026-05-11', day:'Lunes',  type:'Fuerza',  duration:64, fcAvg:137, calories:492, effort:8, volume:4778, notes:'Jalón+Bíceps+Core' },
          { date:'2026-05-07', day:'Jueves', type:'Cardio',  duration:18, fcAvg:158, calories:141, effort:7, volume:0,    notes:'Indoor Run — Primera Z5' },
          { date:'2026-05-07', day:'Jueves', type:'Fuerza',  duration:29, fcAvg:135, calories:217, effort:8, volume:0,    notes:'Core+Calistenia' },
          { date:'2026-04-24', day:'Viernes',type:'Fuerza',  duration:56, fcAvg:132, calories:406, effort:6, volume:3024, notes:'Espalda+Hombro' },
          { date:'2026-04-24', day:'Viernes',type:'Cardio',  duration:24, fcAvg:151, calories:209, effort:6, volume:0,    notes:'Indoor Run 1.99km' },
          { date:'2026-04-21', day:'Martes', type:'Fuerza',  duration:42, fcAvg:126, calories:276, effort:7, volume:4602, notes:'Jalón+Bíceps' },
          { date:'2026-03-27', day:'Viernes',type:'Fuerza',  duration:56, fcAvg:132, calories:406, effort:6, volume:3024, notes:'Espalda+Hombro' },
          { date:'2026-03-26', day:'Jueves', type:'Fuerza',  duration:61, fcAvg:132, calories:434, effort:7, volume:8900, notes:'Piernas' },
          { date:'2026-03-23', day:'Lunes',  type:'Cardio',  duration:15, fcAvg:149, calories:117, effort:6, volume:0,    notes:'HIT Nivel 1 — Inicio' },
          { date:'2026-03-23', day:'Lunes',  type:'Fuerza',  duration:70, fcAvg:140, calories:554, effort:7, volume:6647, notes:'Entren. D — Día 1' },
        ]
      },
      getCardio: {
        sessions: [
          { date:'2026-05-07', type:'HIT/Sprint', duration:18, distance:1.42, fcAvg:158, fcPeak:194, cadAvg:97, cadPeak:202, z4plus:8.12, rec2min:3,  notes:'Primera Z5 4:51min' },
          { date:'2026-04-24', type:'Indoor Run', duration:24, distance:1.99, fcAvg:151, fcPeak:180, cadAvg:117, cadPeak:171, z4plus:7.55, rec2min:6,  notes:'1.99km post fuerza' },
          { date:'2026-03-23', type:'HIT Niv1',   duration:15, distance:1.24, fcAvg:149, fcPeak:186, cadAvg:109, cadPeak:186, z4plus:3.85, rec2min:-5, notes:'Día 1 de regreso' },
        ]
      },
      getMetrics: {
        history: [
          { date:'2026-05-11', week:3, weight:null, pullUps:0, sprintSpeed:12, cadAvg:117, deadHang:null, plankMax:50 },
          { date:'2026-04-21', week:2, weight:null, pullUps:0, sprintSpeed:12, cadAvg:117, deadHang:null, plankMax:45 },
          { date:'2026-03-23', week:1, weight:92.1, pullUps:0, sprintSpeed:12, cadAvg:109, deadHang:null, plankMax:45 },
        ],
        records: {
          fcRecovery: { value: -14, date: '2026-05-11', label: 'Mejor recuperación' },
          cadencePeak: { value: 202, date: '2026-05-07', label: 'Pico cadencia' },
          hrPeak: { value: 194, date: '2026-05-07', label: 'FC pico' },
          z4Time: { value: 8.12, date: '2026-05-07', label: 'Tiempo Z4+' },
          volumeSession: { value: 8900, date: '2026-03-26', label: 'Volumen sesión' }
        }
      },
      getExercises: {
        exercises: [
          { id:'ex001', name:'Dominadas Asistidas',       group:'Calistenia',  type:'Calistenia',   photoUrl:'', videoUrl:'', notes:'Baseline S1: 80 lbs → S2: 70 lbs' },
          { id:'ex002', name:'Jalón Pecho Prono',         group:'Espalda',     type:'Polea',        photoUrl:'', videoUrl:'', notes:'25 kg — S3 May11' },
          { id:'ex003', name:'Remo en Polea Baja',        group:'Espalda',     type:'Polea',        photoUrl:'', videoUrl:'', notes:'52.2 kg (115 lbs)' },
          { id:'ex004', name:'Jalón Pecho Supino',        group:'Espalda',     type:'Polea',        photoUrl:'', videoUrl:'', notes:'20 kg — S3' },
          { id:'ex005', name:'Curl Bíceps con Barra',     group:'Biceps',      type:'Libre',        photoUrl:'', videoUrl:'', notes:'22 kg — igual S1' },
          { id:'ex006', name:'Curl Martillo',             group:'Biceps',      type:'Mancuerna',    photoUrl:'', videoUrl:'', notes:'11 kg c/mano objetivo' },
          { id:'ex007', name:'Plancha Isométrica',        group:'Core',        type:'Calistenia',   photoUrl:'', videoUrl:'', notes:'50 seg S3 → objetivo 60 seg' },
          { id:'ex008', name:'Hollow Body Hold',          group:'Core',        type:'Calistenia',   photoUrl:'', videoUrl:'', notes:'2x30 seg' },
          { id:'ex009', name:'Dead Hang en Barra',        group:'Calistenia',  type:'Calistenia',   photoUrl:'', videoUrl:'', notes:'Baseline pendiente — jueves' },
          { id:'ex010', name:'Scapular Pulls',            group:'Calistenia',  type:'Calistenia',   photoUrl:'', videoUrl:'', notes:'3x10 — clave para dominada' },
          { id:'ex011', name:'Ab Wheel Rollout',          group:'Core',        type:'Calistenia',   photoUrl:'', videoUrl:'', notes:'3x8-10 desde rodillas' },
          { id:'ex012', name:'Leg Press 45°',             group:'Cuadriceps',  type:'Máquina',      photoUrl:'', videoUrl:'', notes:'Baseline: 160 kg' },
          { id:'ex013', name:'Sentadilla en Smith',       group:'Cuadriceps',  type:'Máquina',      photoUrl:'', videoUrl:'', notes:'40 kg baseline' },
          { id:'ex014', name:'Pantorrilla en Prensa',     group:'Pantorrillas',type:'Máquina',      photoUrl:'', videoUrl:'', notes:'⚠ Subir a 20 kg' },
          { id:'ex015', name:'Press Pecho Declinado',     group:'Pecho',       type:'Máquina',      photoUrl:'', videoUrl:'', notes:'25 kg c/brazo objetivo' },
          { id:'ex016', name:'Cristos Peck Fly',          group:'Pecho',       type:'Máquina',      photoUrl:'', videoUrl:'', notes:'Baseline: 52.2 kg (115 lbs)' },
          { id:'ex017', name:'Extensión Tríceps Cuerda',  group:'Triceps',     type:'Polea',        photoUrl:'', videoUrl:'', notes:'Baseline: 25.9 kg (57 lbs)' },
          { id:'ex018', name:'Shrugs Mancuerna',          group:'Hombro',      type:'Mancuerna',    photoUrl:'', videoUrl:'', notes:'22 kg c/mano → 44 kg total' },
          { id:'ex019', name:'Face Pulls en Polea',       group:'Hombro',      type:'Polea',        photoUrl:'', videoUrl:'', notes:'11.5 kg — no subir, técnica' },
          { id:'ex020', name:'Remo con Barra',            group:'Espalda',     type:'Libre',        photoUrl:'', videoUrl:'', notes:'⚠ Subir a 30 kg S3' },
        ]
      },
      getWeekPlan: {
        phase: CONFIG.CURRENT_PHASE,
        plan: [0,1,2,3,4,5,6].map(day => ({
          dayOfWeek: day,
          ...CONFIG.WEEK_PLAN[day],
          exercises: CONFIG.PLAN_EXERCISES[day] || []
        }))
      },
      getStrengthHistory: { history: [] },
      getProfile: { profile: null },
      getBodyComposition: { history: [] },
      getPersonalRecords: {
        fcRecovery: { value: null, date: null },
        cadencePeak: { value: 0, date: null },
        z3Time: { value: 0, date: null },
        sessionVolume: { value: 0, date: null },
        plankMax: { value: 0, date: null },
      },
      getCoachHistory: { history: [] },
      getMealLog: { log: [] },
      getBrandChoices: { brands: [] },
      getNutritionPlan: { meals: {}, equivalents: {}, brandGuides: {}, generalRecommendations: [] },
      getMeasurements: { history: [] },
      getExerciseProgress: { exercises: [] },
      getSessionExercises: { exercises: [] },
    };

    return mocks[action] || { data: [] };
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  return {
    clearCache,
    isMock: () => _lastWasMock,
    rawPost: (params) => _attemptFetch(params),

    getDashboard: () =>
      _fetch({ action: 'getDashboard' }),

    getSessions: (limit = 20) =>
      _fetch({ action: 'getSessions', limit }),

    getCardio: (limit = 20) =>
      _fetch({ action: 'getCardio', limit }),

    getMetrics: () =>
      _fetch({ action: 'getMetrics' }),

    getExercises: () =>
      _fetch({ action: 'getExercises' }),

    getWeekPlan: () =>
      _fetch({ action: 'getWeekPlan' }),

    getStrengthHistory: (exercise) =>
      _fetch({ action: 'getStrengthHistory', exercise }),

    getProfile: () =>
      _fetch({ action: 'getProfile' }),

    getBodyComposition: (limit = 50) =>
      _fetch({ action: 'getBodyComposition', limit }),

    getPersonalRecords: () =>
      _fetch({ action: 'getPersonalRecords' }),

    getCoachHistory: (limit = 30) =>
      _fetch({ action: 'getCoachHistory', limit }),

    getMealLog: (limit = 30) =>
      _fetch({ action: 'getMealLog', limit }),

    getBrandChoices: () =>
      _fetch({ action: 'getBrandChoices' }),

    getNutritionPlan: () =>
      _fetch({ action: 'getNutritionPlan' }),

    getMeasurements: (limit = 30) =>
      _fetch({ action: 'getMeasurements', limit }),

    getExerciseProgress: () =>
      _fetch({ action: 'getExerciseProgress' }),

    getSessionExercises: (date) =>
      _fetch({ action: 'getSessionExercises', date }),

    // retries: 0 en TODAS las escrituras — a diferencia de una lectura,
    // reintentar un POST significa ejecutar el guardado (y la llamada a
    // Gemini) por segunda vez. Si el guardado ya llegó al servidor pero
    // la respuesta tardó (Gemini puede tomar varios segundos), un
    // reintento automático duplicaría la fila en el Sheet.
    saveSession: (data) =>
      _fetch({ action: 'saveSession', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    saveCardio: (data) =>
      _fetch({ action: 'saveCardio', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    saveMetrics: (data) =>
      _fetch({ action: 'saveMetrics', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    saveExercise: (data) =>
      _fetch({ action: 'saveExercise', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    saveProfile: (data) =>
      _fetch({ action: 'saveProfile', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    saveBodyComposition: (data) =>
      _fetch({ action: 'saveBodyComposition', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    updateSession: (data) =>
      _fetch({ action: 'updateSession', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    updateCardio: (data) =>
      _fetch({ action: 'updateCardio', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    refreshDashboardInsight: () =>
      _fetch({ action: 'refreshDashboardInsight', method: 'POST' }, { useCache: false, retries: 0 }),

    saveMealLog: (data) =>
      _fetch({ action: 'saveMealLog', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    // Sube la foto por separado — si el guardado del texto ya funcionó
    // pero la foto falla (imagen pesada, conexión lenta), no se pierde
    // el registro de la comida.
    saveMealPhoto: (data) =>
      _fetch({ action: 'saveMealPhoto', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    saveBrandChoice: (data) =>
      _fetch({ action: 'saveBrandChoice', method: 'POST', ...data }, { useCache: false, retries: 0 }),

    saveMeasurements: (data) =>
      _fetch({ action: 'saveMeasurements', method: 'POST', ...data }, { useCache: false, retries: 0 }),
  };

})();
