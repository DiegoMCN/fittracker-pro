// ═══════════════════════════════════════════
// COACH MODULE — Consejo diario del Coach IA (bajo demanda)
// ═══════════════════════════════════════════

const Coach = (() => {

  let _history = [];
  let _sessions = [];
  let _usingMock = false;
  let _generating = false;
  let _chartConfig = null; // { type: 'weight'|'speed'|'fc', title, subtitle, labels, values, unit, exerciseName }

  async function init(container) {
    setTimeout(_maybeResumeJob, 0); // si quedó un consejo generándose (pantalla bloqueada, recarga), retomarlo
    container.innerHTML = `
      <div style="max-width:700px;margin:0 auto">
        <div class="skeleton" style="height:180px;border-radius:16px;margin-bottom:20px"></div>
        ${[1,2,3].map(() => `<div class="skeleton" style="height:70px;border-radius:14px;margin-bottom:10px"></div>`).join('')}
      </div>`;

    const [histRes, sesRes] = await Promise.all([API.getCoachHistory(30), API.getSessions(10)]);
    // getCoachHistory() ya regresa más reciente primero — el reverse()
    // extra que había aquí invertía el orden dos veces, causando que
    // "hoy" nunca coincidiera con el primer elemento.
    _history = histRes.history || [];
    _sessions = sesRes.sessions || [];
    _usingMock = API.isMock();

    await _pickDynamicChart();
    render();
  }

  // La gráfica de apoyo cambia según lo que de verdad entrenaste hoy —
  // no siempre FC. Si hoy hubo fuerza, ilustra el ejercicio principal
  // del día (peso a través del tiempo); si fue cardio con velocidad,
  // ilustra la velocidad; si no hay nada de hoy, cae de regreso a la
  // tendencia general de FC. Así cada consejo trae una gráfica distinta
  // y relevante a lo que realmente pasó.
  async function _pickDynamicChart() {
    const today = Utils.today();
    try {
      const exRes = await API.getSessionExercises(today);
      const todayExercises = (exRes.exercises || []).filter(ex =>
        ex.sets.some(s => (s.unit === 'kg' || s.unit === 'lbs') && s.kg > 0)
      );

      if (todayExercises.length > 0) {
        // El "ejercicio principal" = el que tiene más series con peso hoy
        const featured = todayExercises.reduce((best, ex) =>
          ex.sets.length > best.sets.length ? ex : best, todayExercises[0]);

        const histRes = await API.getStrengthHistory(featured.name);
        const rows = histRes.history || [];
        const byDate = {};
        rows.forEach(r => {
          const raw = parseFloat(r.kg) || 0;
          if (raw <= 0) return;
          const kg = r.unit === 'lbs' ? Utils.lbsToKg(raw) : raw;
          if (!byDate[r.date] || kg > byDate[r.date]) byDate[r.date] = kg;
        });
        const points = Object.entries(byDate).sort((a,b) => a[0].localeCompare(b[0])).slice(-8);

        if (points.length >= 2) {
          _chartConfig = {
            type: 'weight',
            title: `📈 ${featured.name}`,
            subtitle: 'Peso a través de tus últimas sesiones — el ejercicio principal de hoy',
            labels: points.map(p => Utils.formatDateShort(p[0])),
            values: points.map(p => p[1]),
            unitSuffix: ' kg',
          };
          return;
        }
      }
    } catch(e) { /* si falla, cae al plan B abajo */ }

    // Plan B: cardio de hoy con velocidad — si no hubo fuerza hoy pero
    // sí sprint/cardio con velocidad registrada
    try {
      const cardioRes = await API.getCardio(15);
      const cardioSessions = (cardioRes.sessions || []).filter(c => c.velMax).slice().reverse();
      if (cardioSessions.length >= 2) {
        _chartConfig = {
          type: 'speed',
          title: '📈 Velocidad de sprint',
          subtitle: 'Velocidad máxima en tus últimas sesiones de cardio',
          labels: cardioSessions.map(c => Utils.formatDateShort(c.date)),
          values: cardioSessions.map(c => c.velMax),
          unitSuffix: ' km/h',
        };
        return;
      }
    } catch(e) { /* sigue al fallback final */ }

    // Fallback final: tendencia de FC (la de siempre, cuando no hay
    // nada más específico que ilustrar de hoy)
    const withFC = _sessions.filter(s => s.fcAvg).slice().reverse();
    if (withFC.length >= 2) {
      _chartConfig = {
        type: 'fc',
        title: '📈 Tu tendencia reciente',
        subtitle: 'FC promedio en tus últimas sesiones',
        labels: withFC.map(s => Utils.formatDateShort(s.date)),
        values: withFC.map(s => s.fcAvg),
        unitSuffix: ' bpm',
      };
    } else {
      _chartConfig = null;
    }
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const today = _history[0] && _history[0].date === Utils.today() ? _history[0] : null;
    const past = (today ? _history.slice(1) : _history).slice(0, 2);

    container.innerHTML = `
      <div style="max-width:700px;margin:0 auto">

        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div><strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.</div>
          </div>
        </div>` : ''}

        <!-- Consejo de hoy — se genera SOLO con el botón, nunca automático -->
        <div class="card card-accent" style="margin-bottom:20px">
          <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:${today ? '16px' : '0'}">
            <div style="width:48px;height:48px;border-radius:14px;background:var(--accent-glow);
              display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🤖</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
                Consejo de hoy · ${Utils.formatDate(Utils.today())}
              </div>
              ${today
                ? `<div style="font-size:14px;color:var(--text-1)" id="coach-today-text">${Utils.renderMarkdown(today.note)}</div>`
                : `<div style="font-size:13px;color:var(--text-3);line-height:1.6">
                    Todavía no has generado el consejo de hoy. Tócale al botón cuando quieras —
                    analiza tu sesión de hoy, tus pesos, tu ritmo, tu comida, y te compara contra
                    el consejo anterior para no repetirte lo mismo dos veces.
                  </div>`}
            </div>
          </div>
          <button class="btn btn-primary" style="width:100%" id="coach-generate-btn" onclick="Coach.generate()">
            ${today ? '🔄 Regenerar consejo de hoy' : '🎯 Generar consejo de hoy'}
          </button>
        </div>

        <!-- Cómo funciona -->
        <div class="card" style="margin-bottom:24px;background:var(--bg-input);border-color:transparent">
          <div style="display:flex;gap:10px;align-items:flex-start;font-size:12px;color:var(--text-3);line-height:1.6">
            <span style="font-size:16px">💡</span>
            <div>
              El consejo se genera <strong>solo cuando le das al botón</strong> — no consume
              solicitudes de IA al guardar sesiones, medidas o comidas. Considera tu sesión de
              hoy, los pesos manejados vs. la vez anterior, tu ritmo, tu alimentación, y evita
              repetir lo que ya te dijo la última vez si no cambió nada nuevo que contar.
            </div>
          </div>
        </div>

        <!-- Gráfica de apoyo — dinámica según lo que entrenaste hoy:
             peso del ejercicio principal, velocidad de sprint, o FC
             como respaldo general. Cambia con cada consejo. -->
        ${_chartConfig ? `
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div>
              <div class="card-title">${_chartConfig.title}</div>
              <div class="card-subtitle">${_chartConfig.subtitle}</div>
            </div>
          </div>
          <div style="position:relative;height:160px;width:100%;overflow:hidden">
            <canvas id="coach-trend-chart"></canvas>
          </div>
        </div>` : ''}

        <!-- Historial — solo los 2 más recientes, para no saturar la página -->
        ${past.length > 0 ? `
        <div class="section-header">
          <div class="section-title">Últimos 2 consejos</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${past.map(h => `
            <div class="card">
              <div style="font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
                ${Utils.formatDate(h.date)}
              </div>
              <div style="font-size:13px;color:var(--text-2)">${Utils.renderMarkdown(h.note)}</div>
            </div>`).join('')}
        </div>` : (today ? '' : `
        <div style="text-align:center;padding:40px 20px;color:var(--text-3)">
          <div style="font-size:36px;margin-bottom:10px">📅</div>
          <div style="font-size:12px">Todavía no hay historial de consejos.</div>
        </div>`)}

      </div>`;

    setTimeout(_renderTrendChart, 100);
  }

  function _renderTrendChart() {
    const canvas = document.getElementById('coach-trend-chart');
    if (!canvas || !window.Chart || !_chartConfig) return;

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    const parent = canvas.parentElement;
    const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : 160;
    const wRaw = (parent && parent.offsetWidth > 0) ? parent.offsetWidth : 400;
    // Nunca más ancho que la pantalla real, aunque falle la medición.
    const w = Math.min(wRaw, document.documentElement.clientWidth - 48);
    canvas.width = w; canvas.height = h;

    const color = _chartConfig.type === 'weight' ? '#00FF87' : _chartConfig.type === 'speed' ? '#7C3AED' : '#EF4444';

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: _chartConfig.labels,
        datasets: [{
          data: _chartConfig.values,
          borderColor: color, backgroundColor: color + '15', fill: true,
          tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: color, pointBorderColor: 'transparent',
        }]
      },
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
            callbacks: { label: (ctx) => `${ctx.parsed.y}${_chartConfig.unitSuffix}` }
          }
        },
        scales: {
          x: { ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
          y: { ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, callback: v => v + _chartConfig.unitSuffix }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
        }
      }
    });
  }

  // ── GENERACIÓN CON PROGRESO REAL ──────────────────────────────────
  // El consejo puede tardar 1-3 min (Gemini piensa antes de escribir).
  // Mientras tanto, la app le pregunta al servidor cada 3 s en qué paso va
  // (getCoachJob) y lo muestra. Si bloqueas la pantalla, sales de la app o
  // se corta la conexión, el servidor SIGUE trabajando: el número de
  // trabajo queda guardado en el teléfono y al volver la app se reengancha
  // y recoge el resultado.
  const JOB_KEY = 'fittracker_coach_job';
  const JOB_MAX_MS = 7 * 60 * 1000; // más que el límite de Apps Script (6 min)
  let _job = null, _pollTimer = null, _clockTimer = null, _lastSteps = [];

  function _newJobId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function _fmtElapsed(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  // Panel idempotente: si un re-render lo borró, lo vuelve a poner debajo del botón.
  function _renderProgress(note) {
    if (!_job) return;
    const btn = document.getElementById('coach-generate-btn');
    if (!btn) return;
    let panel = document.getElementById('coach-progress');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'coach-progress';
      panel.className = 'card animate-slide-up';
      panel.style.cssText = 'margin-top:12px;padding:14px 16px';
      btn.insertAdjacentElement('afterend', panel);
    }
    const steps = _lastSteps.slice(-6);
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.9s linear infinite;flex-shrink:0"></div>
        <div style="flex:1;font-size:13px;font-weight:600">Generando tu consejo</div>
        <div id="coach-progress-clock" style="font-size:12px;color:var(--text-3);font-variant-numeric:tabular-nums">${_fmtElapsed(Date.now() - _job.startedAt)}</div>
      </div>
      <div style="height:3px;border-radius:99px;background:var(--bg-input);overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:40%;background:var(--accent);border-radius:99px;animation:coach-indeterminate 1.4s ease-in-out infinite"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${steps.length ? steps.map((st, i) => `
          <div style="display:flex;gap:8px;font-size:11px;line-height:1.45;color:${i === steps.length - 1 ? 'var(--text-1)' : 'var(--text-3)'}">
            <span style="flex-shrink:0;width:34px;color:var(--text-4);font-variant-numeric:tabular-nums">${st.t}s</span>
            <span>${i === steps.length - 1 ? '▸' : '✓'} ${Utils.escapeHtml(st.msg)}</span>
          </div>`).join('') : `<div style="font-size:11px;color:var(--text-3)">Enviando la solicitud al servidor…</div>`}
      </div>
      <div style="font-size:10px;color:var(--text-4);margin-top:10px;line-height:1.5">
        ${note ? Utils.escapeHtml(note) : 'Puede tardar 1–3 min. Puedes bloquear la pantalla o salir: el servidor sigue trabajando y el resultado aparece aquí al volver.'}
      </div>`;
  }

  function _startJob(id, startedAt) {
    _job = { id, startedAt: startedAt || Date.now(), finished: false };
    _lastSteps = [];
    try { localStorage.setItem(JOB_KEY, JSON.stringify({ id, startedAt: _job.startedAt })); } catch(e) {}
    _generating = true;
    const btn = document.getElementById('coach-generate-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generando…'; }
    _renderProgress();
    clearInterval(_pollTimer); clearInterval(_clockTimer);
    _pollTimer = setInterval(_poll, 3000);
    _clockTimer = setInterval(() => {
      const c = document.getElementById('coach-progress-clock');
      if (c && _job) c.textContent = _fmtElapsed(Date.now() - _job.startedAt); else if (_job) _renderProgress();
    }, 1000);
  }

  async function _poll() {
    if (!_job || _job.finished) return;
    if (Date.now() - _job.startedAt > JOB_MAX_MS) {
      return _completeJob({ ok: false, message: 'El servidor no confirmó el resultado a tiempo. Si el consejo se generó, aparecerá al recargar Coach IA; si no, revisa el Registro del Coach IA en Configuración.' });
    }
    try {
      const st = await API.getCoachJob(_job.id);
      if (!_job || _job.finished) return;
      if (st && Array.isArray(st.steps)) { _lastSteps = st.steps; _renderProgress(); }
      if (st && st.status === 'done') _completeJob({ ok: true });
      else if (st && st.status === 'error') _completeJob({ ok: false, message: st.cause && st.cause.message });
    } catch(e) { /* sin señal un momento: se reintenta en el siguiente ciclo */ }
  }

  async function _completeJob({ ok, insight, message }) {
    if (!_job || _job.finished) return;
    _job.finished = true;
    clearInterval(_pollTimer); clearInterval(_clockTimer);
    try { localStorage.removeItem(JOB_KEY); } catch(e) {}
    _job = null; _generating = false;
    const panel = document.getElementById('coach-progress'); if (panel) panel.remove();
    const btn = document.getElementById('coach-generate-btn');
    if (ok) {
      API.clearCache();
      Router.invalidateAll(); // el consejo también actualiza notas de ejercicios e insights de gráficas
      if (insight) {
        const today = Utils.today();
        _history = _history.filter(h => h.date !== today);
        _history.unshift({ date: today, note: insight });
        render();
      } else if (Router.current() === 'coach') {
        init(document.getElementById('page-content')); // vino del sondeo: se recarga del servidor
      }
      Sounds.serieDone(); Haptics.success();
      Toast.success('Consejo generado 🤖');
    } else {
      if (btn) { btn.disabled = false; btn.innerHTML = '🎯 Generar consejo de hoy'; }
      Toast.warning(message ? `No se pudo generar el consejo: ${message}` : 'No se pudo generar el consejo — revisa el Registro del Coach IA en Configuración.', 12000);
    }
  }

  // Al abrir Coach IA (o volver a la app): si había un consejo en curso, reengancharse.
  function _maybeResumeJob() {
    if (_job) { _renderProgress(); _poll(); return; }
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(JOB_KEY) || 'null'); } catch(e) {}
    if (saved && saved.id && Date.now() - saved.startedAt < JOB_MAX_MS) { _startJob(saved.id, saved.startedAt); _poll(); }
    else { try { localStorage.removeItem(JOB_KEY); } catch(e) {} }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && _job) _poll(); });

  async function generate() {
    if (_generating) return; // evita doble click mientras genera
    Sounds.click();
    const id = _newJobId();
    _startJob(id);
    try {
      const res = await API.refreshDashboardInsight(id);
      if (res.duplicate) {
        if (res.jobId && res.jobId !== id) {
          // Ya había uno corriendo (p. ej. lo pediste antes de bloquear la pantalla): seguir ese.
          try { localStorage.setItem(JOB_KEY, JSON.stringify({ id: res.jobId, startedAt: _job.startedAt })); } catch(e) {}
          _job.id = res.jobId;
          _renderProgress('Ya había un consejo generándose — mostrando su progreso.');
          return;
        }
        return _completeJob({ ok: false, message: res.message || 'Ya se generó un consejo hace poco — espera unos minutos.' });
      }
      if (res.insight) return _completeJob({ ok: true, insight: res.insight });
      return _completeJob({ ok: false, message: res.cause && res.cause.message });
    } catch(err) {
      // Se cortó la conexión, se bloqueó la pantalla o se agotó la espera:
      // el servidor sigue trabajando — el sondeo recoge el resultado.
      if (_job && !_job.finished) _renderProgress('Se perdió la conexión con el teléfono, pero el servidor sigue trabajando. Esperando el resultado…');
    }
  }


  return { init, generate };
})();

function initCoach(container) { Coach.init(container); }
