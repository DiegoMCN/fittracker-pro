// ═══════════════════════════════════════════
// METRICS MODULE — Evolución, gráficas y récords
// ═══════════════════════════════════════════

const Metrics = (() => {

  let _sessions = [];
  let _cardio = [];
  let _metricsHistory = [];
  let _records = {};
  let _usingMock = false;

  async function init(container) {
    container.innerHTML = `
      <div class="grid-4" style="margin-bottom:24px">
        ${[1,2,3,4].map(() => `<div class="skeleton" style="height:100px;border-radius:16px"></div>`).join('')}
      </div>
      <div class="grid-2">
        ${[1,2].map(() => `<div class="skeleton" style="height:280px;border-radius:16px"></div>`).join('')}
      </div>`;

    const [sesRes, cardioRes, metricsRes] = await Promise.all([
      API.getSessions(50), API.getCardio(50), API.getMetrics(),
    ]);

    _sessions = (sesRes.sessions || []).slice().reverse(); // orden cronológico
    _cardio   = (cardioRes.sessions || []).slice().reverse();
    _metricsHistory = metricsRes.history || [];
    _records  = metricsRes.records || {};
    _usingMock = API.isMock();

    render();
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const strengthSessions = _sessions.filter(s => s.type === 'Fuerza' && s.fcAvg);
    const latestFC = strengthSessions[strengthSessions.length - 1]?.fcAvg;
    const firstFC  = strengthSessions[0]?.fcAvg;
    const fcDelta  = (latestFC && firstFC) ? latestFC - firstFC : null;

    const bestRec = _records.fcRecovery || { value: null };
    const bestCad = _records.cadencePeak || { value: null };

    container.innerHTML = `
      <div style="max-width:1100px;margin:0 auto">

        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div><strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.</div>
          </div>
        </div>` : ''}

        <!-- KPIs -->
        <div class="grid-4" style="margin-bottom:24px">
          <div class="metric-card">
            <div class="metric-label">FC fuerza (tendencia)</div>
            <div class="metric-value" style="color:var(--danger)">${latestFC || '—'}<span class="metric-unit">bpm</span></div>
            ${fcDelta !== null ? `<div class="metric-delta ${fcDelta <= 0 ? 'up' : 'down'}">${fcDelta <= 0 ? '↓' : '↑'} ${Math.abs(fcDelta)} bpm desde inicio</div>` : ''}
          </div>
          <div class="metric-card">
            <div class="metric-label">Mejor recuperación</div>
            <div class="metric-value accent">${bestRec.value ?? '—'}<span class="metric-unit">bpm</span></div>
            <div class="metric-delta ${bestRec.value <= -10 ? 'up' : 'flat'}">${bestRec.date ? Utils.formatDateShort(bestRec.date) : 'objetivo: -20'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Pico de cadencia</div>
            <div class="metric-value" style="color:var(--purple-light)">${bestCad.value ?? '—'}<span class="metric-unit">spm</span></div>
            <div class="metric-delta flat">${bestCad.date ? Utils.formatDateShort(bestCad.date) : 'objetivo: 170+'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Sesiones totales</div>
            <div class="metric-value" style="color:var(--cyan)">${_sessions.length + _cardio.length}</div>
            <div class="metric-delta flat">${_sessions.length} fuerza · ${_cardio.length} cardio</div>
          </div>
        </div>

        <!-- Gráficas -->
        <div class="grid-2" style="margin-bottom:24px">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">FC promedio — Fuerza</div>
                <div class="card-subtitle">Tendencia de recuperación cardiovascular</div>
              </div>
            </div>
            <div style="position:relative;height:220px;width:100%">
              <canvas id="chart-fc-strength"></canvas>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Cadencia — Cardio</div>
                <div class="card-subtitle">Promedio y pico por sesión</div>
              </div>
            </div>
            <div style="position:relative;height:220px;width:100%">
              <canvas id="chart-cadence"></canvas>
            </div>
          </div>
        </div>

        <div class="grid-2" style="margin-bottom:24px">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Volumen semanal</div>
                <div class="card-subtitle">Kg totales movidos por semana</div>
              </div>
            </div>
            <div style="position:relative;height:220px;width:100%">
              <canvas id="chart-volume"></canvas>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Recuperación cardíaca (2 min)</div>
                <div class="card-subtitle">Delta post-esfuerzo · negativo es mejor</div>
              </div>
            </div>
            <div style="position:relative;height:220px;width:100%">
              <canvas id="chart-recovery"></canvas>
            </div>
          </div>
        </div>

        <!-- Récords por ejercicio -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🏆 Récords por ejercicio</div>
            <div class="card-subtitle">Mejor carga registrada</div>
          </div>
          ${_renderExerciseRecords()}
        </div>

      </div>`;

    setTimeout(_renderCharts, 100);
  }

  function _renderExerciseRecords() {
    const prs = _records.exercisePRs || {};
    const entries = Object.entries(prs)
      .filter(([name, d]) => d.maxKg > 0)
      .sort((a, b) => b[1].maxKg - a[1].maxKg)
      .slice(0, 10);

    if (entries.length === 0) {
      return `<div style="text-align:center;padding:30px;color:var(--text-3);font-size:12px">Sin datos suficientes todavía — sigue registrando sesiones.</div>`;
    }

    return `
      <div style="display:flex;flex-direction:column">
        ${entries.map(([name, d], i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i < entries.length-1 ? 'border-bottom:1px solid var(--border)' : ''}">
            <div style="width:24px;height:24px;border-radius:6px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--text-3)">${i+1}</div>
            <div style="flex:1;font-size:13px;font-weight:500">${name}</div>
            <div style="font-weight:700;font-size:14px;color:var(--accent)">${Utils.formatNum(d.maxKg)} kg</div>
            ${d.lastDate ? `<div style="font-size:10px;color:var(--text-4);min-width:60px;text-align:right">${Utils.formatDateShort(d.lastDate)}</div>` : ''}
          </div>`).join('')}
      </div>`;
  }

  // ── CHARTS ────────────────────────────────────────────────────────────
  function _setupCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return null;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const parent = canvas.parentElement;
    const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : 220;
    const w = (parent && parent.offsetWidth  > 0) ? parent.offsetWidth  : 400;
    canvas.width = w; canvas.height = h;
    return canvas;
  }

  const CHART_BASE = {
    responsive: false,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' },
    layout: { padding: { top: 4, bottom: 4 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
        titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
      }
    },
  };
  const AXIS_STYLE = {
    ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' } },
    grid: { color: 'rgba(255,255,255,0.04)' },
    border: { display: false },
  };

  function _renderCharts() {
    _chartFCStrength();
    _chartCadence();
    _chartVolume();
    _chartRecovery();
  }

  function _chartFCStrength() {
    const canvas = _setupCanvas('chart-fc-strength');
    if (!canvas) return;
    const data = _sessions.filter(s => s.type === 'Fuerza' && s.fcAvg).slice(-10);
    if (data.length === 0) { _emptyState(canvas); return; }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(s => Utils.formatDateShort(s.date)),
        datasets: [{
          data: data.map(s => s.fcAvg),
          borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)',
          tension: 0.4, fill: true, pointRadius: 4, borderWidth: 2,
          pointBackgroundColor: '#EF4444', pointBorderColor: 'transparent',
        }]
      },
      options: {
        ...CHART_BASE,
        plugins: { ...CHART_BASE.plugins, tooltip: { ...CHART_BASE.plugins.tooltip, callbacks: { label: c => `${c.raw} bpm` } } },
        scales: {
          x: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, maxRotation: 0, maxTicksLimit: 6 } },
          y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => v + ' bpm' } },
        }
      }
    });
  }

  function _chartCadence() {
    const canvas = _setupCanvas('chart-cadence');
    if (!canvas) return;
    const data = _cardio.filter(c => c.cadAvg).slice(-10);
    if (data.length === 0) { _emptyState(canvas); return; }

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map(c => Utils.formatDateShort(c.date)),
        datasets: [
          { label: 'Promedio', data: data.map(c => c.cadAvg), backgroundColor: 'rgba(124,58,237,0.6)', borderRadius: 4 },
          { label: 'Pico', data: data.map(c => c.cadPeak || 0), backgroundColor: 'rgba(167,139,250,0.3)', borderRadius: 4 },
        ]
      },
      options: {
        ...CHART_BASE,
        plugins: { ...CHART_BASE.plugins, legend: { display: true, labels: { color: '#B4B2CC', font: { size: 10, family: 'Poppins' }, boxWidth: 10 } } },
        scales: {
          x: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, maxRotation: 0 } },
          y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => v + ' spm' } },
        }
      }
    });
  }

  function _chartVolume() {
    const canvas = _setupCanvas('chart-volume');
    if (!canvas) return;
    // Agrupar por semana ISO
    const weekly = {};
    _sessions.filter(s => s.volume > 0).forEach(s => {
      const wk = _weekOf(s.date);
      weekly[wk] = (weekly[wk] || 0) + s.volume;
    });
    const labels = Object.keys(weekly).sort();
    if (labels.length === 0) { _emptyState(canvas); return; }

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels.map(w => 'Sem ' + w.split('-W')[1]),
        datasets: [{ data: labels.map(w => weekly[w]), backgroundColor: 'rgba(0,255,135,0.5)', borderRadius: 6 }]
      },
      options: {
        ...CHART_BASE,
        plugins: { ...CHART_BASE.plugins, tooltip: { ...CHART_BASE.plugins.tooltip, callbacks: { label: c => `${Utils.formatNum(c.raw)} kg` } } },
        scales: {
          x: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, maxRotation: 0 } },
          y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => Utils.formatNum(v) } },
        }
      }
    });
  }

  function _chartRecovery() {
    const canvas = _setupCanvas('chart-recovery');
    if (!canvas) return;
    const data = _cardio.filter(c => c.rec2min !== null && c.rec2min !== undefined).slice(-10);
    if (data.length === 0) { _emptyState(canvas); return; }

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map(c => Utils.formatDateShort(c.date)),
        datasets: [{
          data: data.map(c => c.rec2min),
          backgroundColor: data.map(c => c.rec2min <= 0 ? 'rgba(0,255,135,0.6)' : 'rgba(239,68,68,0.6)'),
          borderRadius: 4,
        }]
      },
      options: {
        ...CHART_BASE,
        plugins: { ...CHART_BASE.plugins, tooltip: { ...CHART_BASE.plugins.tooltip, callbacks: { label: c => `${c.raw} bpm` } } },
        scales: {
          x: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, maxRotation: 0 } },
          y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => v + ' bpm' } },
        }
      }
    });
  }

  function _emptyState(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.font = '12px Poppins';
    ctx.fillStyle = '#6E6D8A';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos suficientes todavía', canvas.width / 2, canvas.height / 2);
  }

  function _weekOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
  }

  return { init };
})();

function initMetrics(container) { Metrics.init(container); }
