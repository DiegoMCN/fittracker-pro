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

        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-primary btn-sm" onclick="Metrics.openCapture()">+ Registrar métricas clave</button>
        </div>

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

        <!-- Métricas corporales (velocidad, dominadas, cadencia, dead hang) -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div>
              <div class="card-title">Métricas corporales</div>
              <div class="card-subtitle">${_metricsHistory.length ? `Última: ${Utils.formatDate(_metricsHistory[_metricsHistory.length-1].date)}` : 'Sin registros todavía'}</div>
            </div>
          </div>
          ${_metricsHistory.length === 0 ? `
            <div style="text-align:center;padding:30px 20px;color:var(--text-3)">
              <div style="font-size:32px;margin-bottom:10px">📈</div>
              <div style="font-size:12px">Registra velocidad de sprint, dominadas, cadencia y dead hang aquí para ver tu evolución.</div>
              <button class="btn btn-primary" style="margin-top:14px" onclick="Metrics.openCapture()">+ Registrar primera medición</button>
            </div>` : `
            <div class="grid-4" style="gap:10px;margin-bottom:16px">
              ${[
                { key:'sprintSpeed', label:'Velocidad sprint', unit:'km/h', color:'var(--accent)' },
                { key:'pullUps', label:'Dominadas', unit:'reps', color:'var(--danger)' },
                { key:'cadAvg', label:'Cadencia', unit:'spm', color:'var(--purple-light)' },
                { key:'deadHang', label:'Dead hang', unit:'seg', color:'var(--warning)' },
              ].map(f => {
                const latest = _metricsHistory[_metricsHistory.length-1][f.key];
                return `<div style="background:var(--bg-input);border-radius:10px;padding:12px">
                  <div style="font-size:10px;color:var(--text-3);margin-bottom:4px">${f.label}</div>
                  <div style="font-size:18px;font-weight:700;color:${f.color}">${latest ?? '—'}<span style="font-size:10px;color:var(--text-3)"> ${f.unit}</span></div>
                </div>`;
              }).join('')}
            </div>
            <div style="display:flex;flex-direction:column">
              ${_metricsHistory.slice().reverse().slice(0, 8).map((h, i, arr) => `
                <div style="display:flex;align-items:center;gap:14px;padding:8px 0;${i < arr.length-1 ? 'border-bottom:1px solid var(--border)' : ''}">
                  <div style="font-size:11px;color:var(--text-3);min-width:70px">${Utils.formatDateShort(h.date)}</div>
                  <div style="flex:1;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--text-2)">
                    ${h.weight ? `<span>⚖️ ${h.weight} kg</span>` : ''}
                    ${h.sprintSpeed ? `<span>⚡ ${h.sprintSpeed} km/h</span>` : ''}
                    ${h.pullUps ? `<span>💪 ${h.pullUps} dominadas</span>` : ''}
                    ${h.cadAvg ? `<span>🦵 ${h.cadAvg} spm</span>` : ''}
                    ${h.deadHang ? `<span>🕐 ${h.deadHang}s hang</span>` : ''}
                    ${h.plankMax ? `<span>📏 ${h.plankMax}s plancha</span>` : ''}
                  </div>
                </div>`).join('')}
            </div>`}
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

  // ── REGISTRAR MÉTRICAS CLAVE ──────────────────────────────────────────
  function openCapture() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <div class="modal-title">📈 Registrar métricas clave</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:11px;color:var(--text-3)">Todo es opcional — llena solo lo que tengas medido hoy.</p>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Peso corporal (kg)</label>
              <input class="input" type="number" step="0.1" id="mc-weight">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Dominadas (reps)</label>
              <input class="input" type="number" id="mc-pullups">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Velocidad sprint (km/h)</label>
              <input class="input" type="number" step="0.1" id="mc-sprint">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Cadencia promedio (spm)</label>
              <input class="input" type="number" id="mc-cadence">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Dead hang (seg)</label>
              <input class="input" type="number" id="mc-deadhang">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Plancha máxima (seg)</label>
              <input class="input" type="number" id="mc-plank">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="mc-save-btn" onclick="Metrics.saveCapture()">Guardar en Sheet</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  let _savingCapture = false;

  async function saveCapture() {
    if (_savingCapture) return; // evita doble click / doble guardado
    _savingCapture = true;
    const btn = document.getElementById('mc-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const val = id => document.getElementById(id)?.value || '';
    const payload = {
      date: Utils.today(),
      week: CONFIG.CURRENT_PHASE.currentWeek,
      weight: val('mc-weight'),
      pullUps: val('mc-pullups'),
      sprintSpeed: val('mc-sprint'),
      cadAvg: val('mc-cadence'),
      deadHang: val('mc-deadhang'),
      plankMax: val('mc-plank'),
    };

    try {
      const result = await API.saveMetrics(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — guardado localmente, se sincronizará solo');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success('Métricas guardadas');
      }
      _metricsHistory.push({
        date: payload.date, week: payload.week, weight: Number(payload.weight) || null,
        pullUps: Number(payload.pullUps) || null, sprintSpeed: Number(payload.sprintSpeed) || null,
        cadAvg: Number(payload.cadAvg) || null, deadHang: Number(payload.deadHang) || null,
        plankMax: Number(payload.plankMax) || null,
      });
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar en el Sheet');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar en Sheet'; }
    } finally {
      _savingCapture = false;
    }
  }

  return { init, openCapture, saveCapture };
})();

function initMetrics(container) { Metrics.init(container); }
