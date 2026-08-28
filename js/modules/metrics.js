// ═══════════════════════════════════════════
// METRICS MODULE — Evolución, gráficas y récords
// ═══════════════════════════════════════════

const Metrics = (() => {

  let _sessions = [];
  let _cardio = [];
  let _metricsHistory = [];
  let _records = {};
  let _exerciseProgress = [];
  let _volumeByGroup = [];
  let _exerciseFilter = 'Todos';
  let _usingMock = false;

  async function init(container) {
    container.innerHTML = `
      <div class="grid-4" style="margin-bottom:24px">
        ${[1,2,3,4].map(() => `<div class="skeleton" style="height:100px;border-radius:16px"></div>`).join('')}
      </div>
      <div class="grid-2">
        ${[1,2].map(() => `<div class="skeleton" style="height:280px;border-radius:16px"></div>`).join('')}
      </div>`;

    const [sesRes, cardioRes, metricsRes, progressRes] = await Promise.all([
      API.getSessions(50), API.getCardio(50), API.getMetrics(), API.getExerciseProgress(),
    ]);

    _sessions = (sesRes.sessions || []).slice().reverse(); // orden cronológico
    _cardio   = (cardioRes.sessions || []).slice().reverse();
    _metricsHistory = metricsRes.history || [];
    _records  = metricsRes.records || {};
    _exerciseProgress = progressRes.exercises || [];
    _volumeByGroup = progressRes.volumeByGroup || [];
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
              <div class="card-subtitle">${_metricsHistory.length ? `Última: ${Utils.formatDate(_metricsHistory[0].date)}` : 'Sin registros todavía'}</div>
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
                { key:'sprintSpeed', label:'Velocidad sprint', unit:'km/h', color:'var(--accent)', higherIsBetter:true },
                { key:'pullUps', label:'Dominadas', unit:'reps', color:'var(--danger)', higherIsBetter:true },
                { key:'cadAvg', label:'Cadencia', unit:'spm', color:'var(--purple-light)', higherIsBetter:true },
                { key:'deadHang', label:'Dead hang', unit:'seg', color:'var(--warning)', higherIsBetter:true },
              ].map(f => {
                // _metricsHistory ya viene más-reciente-primero (index 0 = último)
                const latest = _metricsHistory[0][f.key];
                const prevEntry = _metricsHistory.slice(1).find(h => h[f.key] !== null && h[f.key] !== undefined);
                const prevVal = prevEntry ? prevEntry[f.key] : null;
                const delta = (latest !== null && latest !== undefined && prevVal !== null)
                  ? Math.round((latest - prevVal) * 10) / 10 : null;
                const isGood = delta !== null && (f.higherIsBetter ? delta > 0 : delta < 0);
                const isBad  = delta !== null && (f.higherIsBetter ? delta < 0 : delta > 0);
                return `<div style="background:var(--bg-input);border-radius:10px;padding:12px">
                  <div style="font-size:10px;color:var(--text-3);margin-bottom:4px">${f.label}</div>
                  <div style="font-size:18px;font-weight:700;color:${f.color}">${latest ?? '—'}<span style="font-size:10px;color:var(--text-3)"> ${f.unit}</span></div>
                  ${delta !== null
                    ? `<div style="font-size:10px;font-weight:600;margin-top:3px;color:${isGood ? 'var(--success)' : isBad ? 'var(--danger)' : 'var(--text-4)'}">${delta >= 0 ? '↑ +' : '↓ '}${Math.abs(delta)} vs anterior</div>`
                    : `<div style="font-size:10px;color:var(--text-4);margin-top:3px">${latest !== null && latest !== undefined ? 'primer registro' : 'sin dato'}</div>`}
                </div>`;
              }).join('')}
            </div>
            ${_metricsHistory.length >= 2 ? `
            <div style="position:relative;height:180px;width:100%;overflow:hidden;margin-bottom:16px">
              <canvas id="perf-trend-chart"></canvas>
            </div>` : ''}
            <div style="display:flex;flex-direction:column">
              ${_metricsHistory.slice(0, 8).map((h, i, arr) => `
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
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div class="card-title">🏆 Récords por ejercicio</div>
            <div class="card-subtitle">Mejor carga registrada</div>
          </div>
          ${_renderExerciseRecords()}
        </div>

        <!-- Distribución de volumen por grupo muscular — sí es un "parte del
             todo" real, por eso aquí sí tiene sentido usar pastel/dona -->
        ${_volumeByGroup.length > 0 ? `
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div>
              <div class="card-title">🥧 Distribución de volumen</div>
              <div class="card-subtitle">De qué grupo muscular viene tu volumen total movido</div>
            </div>
          </div>
          <div style="position:relative;height:220px;width:100%;overflow:hidden">
            <canvas id="volume-distribution-chart"></canvas>
          </div>
        </div>

        <!-- Mapa muscular — SVG con cada músculo como figura independiente,
             pintado con más intensidad según cuánto volumen ha recibido -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div>
              <div class="card-title">🧍 Mapa muscular</div>
              <div class="card-subtitle">Qué tanto has trabajado cada grupo — más verde, más volumen</div>
            </div>
          </div>
          <div id="muscle-map-wrap" style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap">
            <div style="text-align:center">
              ${_muscleMapSVG('front')}
              <div style="font-size:10px;color:var(--text-3);margin-top:4px">Frente</div>
            </div>
            <div style="text-align:center">
              ${_muscleMapSVG('back')}
              <div style="font-size:10px;color:var(--text-3);margin-top:4px">Espalda</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px">
            <span style="font-size:9px;color:var(--text-4)">Menos</span>
            <div style="width:90px;height:6px;border-radius:3px;background:linear-gradient(90deg, rgba(0,255,135,0.15), rgba(0,255,135,0.9))"></div>
            <span style="font-size:9px;color:var(--text-4)">Más</span>
            <span style="font-size:9px;color:var(--text-4);margin-left:10px">· Gris = sin datos</span>
          </div>
        </div>` : ''}

        <!-- Progresión por ejercicio — una gráfica de línea por cada uno,
             filtrable por grupo para que no se sature la sección -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">📈 Progresión por ejercicio</div>
              <div class="card-subtitle">Peso a través del tiempo, uno por ejercicio</div>
            </div>
          </div>
          ${_exerciseProgress.length === 0 ? `
            <div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">Todavía no hay suficiente historial por ejercicio</div>` : `
            <div style="display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">
              ${_exerciseFilterGroups().map(g => `
                <button class="btn ${_exerciseFilter === g ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex-shrink:0" onclick="Metrics.setExerciseFilter('${g.replace(/'/g,"\\'")}')">${g}</button>
              `).join('')}
            </div>
            <div class="grid-2" style="gap:12px" id="exercise-charts-grid">
              ${_filteredExercises().map((ex, i) => `
                <div class="card" style="background:var(--bg-input);border-color:transparent">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <div style="min-width:0">
                      <div style="font-size:12px;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ex.name}</div>
                      <div style="font-size:9px;color:var(--text-3)">${ex.sessions} sesiones</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                      <div style="font-size:13px;font-weight:700;color:var(--text-1)">${ex.lastKg}<span style="font-size:9px;color:var(--text-3)">kg</span></div>
                      <div style="font-size:9px;font-weight:600;color:${ex.changePct > 0 ? 'var(--success)' : ex.changePct < 0 ? 'var(--danger)' : 'var(--text-4)'}">${ex.changePct > 0 ? '+' : ''}${ex.changePct}%</div>
                    </div>
                  </div>
                  <div style="position:relative;height:90px;width:100%;overflow:hidden">
                    <canvas id="ex-mini-chart-${i}"></canvas>
                  </div>
                </div>`).join('')}
            </div>
            ${_filteredExercises().length === 0 ? `
              <div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">Sin ejercicios en este filtro</div>` : ''}`}
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

  function _exerciseFilterGroups() {
    const groups = new Set(_exerciseProgress.map(ex => ex.group).filter(Boolean));
    return ['Todos', ...Array.from(groups).sort()];
  }

  function _filteredExercises() {
    if (_exerciseFilter === 'Todos') return _exerciseProgress;
    return _exerciseProgress.filter(ex => ex.group === _exerciseFilter);
  }

  function setExerciseFilter(group) {
    _exerciseFilter = group;
    Sounds.click();
    render();
  }

  function _renderCharts() {
    _chartFCStrength();
    _chartCadence();
    _chartVolume();
    _chartRecovery();
    _chartPerformanceTrend();
    _chartVolumeDistribution();
    _paintMuscleMap();
    _filteredExercises().forEach((ex, i) => _chartExerciseMini(ex, i));
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

  // Tendencia de velocidad/dominadas/cadencia/dead hang — complementa la
  // gráfica de composición corporal de Perfil, mismo patrón robusto.
  function _chartPerformanceTrend() {
    const canvas = _setupCanvas('perf-trend-chart');
    if (!canvas) return;
    // _metricsHistory viene más-reciente-primero — para la gráfica se
    // necesita orden cronológico.
    const chronological = _metricsHistory.slice(0, 10).slice().reverse();
    if (chronological.length < 2) { _emptyState(canvas); return; }

    const labels = chronological.map(h => Utils.formatDateShort(h.date));

    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Velocidad sprint (km/h)', data: chronological.map(h => h.sprintSpeed), yAxisID: 'yLeft',
            borderColor: '#00FF87', backgroundColor: 'rgba(0,255,135,0.06)', fill: true,
            tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#00FF87',
            pointBorderColor: 'transparent', spanGaps: true,
          },
          {
            label: 'Cadencia (spm)', data: chronological.map(h => h.cadAvg), yAxisID: 'yRight',
            borderColor: '#7C3AED', backgroundColor: 'transparent',
            tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#7C3AED',
            pointBorderColor: 'transparent', borderDash: [4,3], spanGaps: true,
          },
          {
            label: 'Dominadas', data: chronological.map(h => h.pullUps), yAxisID: 'yLeft',
            borderColor: '#EF4444', backgroundColor: 'transparent',
            tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#EF4444',
            pointBorderColor: 'transparent', borderDash: [2,2], spanGaps: true,
          },
        ]
      },
      options: {
        ...CHART_BASE,
        plugins: {
          legend: { display: true, labels: { color: '#B4B2CC', font: { size: 10, family: 'Poppins' }, boxWidth: 10 } },
          tooltip: { backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF' }
        },
        scales: {
          x: {
            ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 8 },
            grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
          },
          yLeft: {
            type: 'linear', position: 'left',
            ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' } },
            grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
          },
          yRight: {
            type: 'linear', position: 'right',
            ticks: { color: '#7C3AED', font: { size: 9, family: 'Poppins' } },
            grid: { display: false }, border: { display: false },
          },
        }
      }
    });
  }

  // Dona — distribución de volumen total por grupo muscular. Es un
  // "parte del todo" real (suma 100%), por eso aquí sí se presta un
  // pastel/dona en vez de forzarlo donde no aporta.
  function _chartVolumeDistribution() {
    const canvas = _setupCanvas('volume-distribution-chart');
    if (!canvas || _volumeByGroup.length === 0) return;

    const palette = ['#00FF87','#7C3AED','#06B6D4','#F59E0B','#EF4444','#EC4899','#3B82F6','#10B981','#F97316'];
    const top = _volumeByGroup.slice(0, 8);
    const total = top.reduce((s, g) => s + g.volume, 0);

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: top.map(g => g.group),
        datasets: [{
          data: top.map(g => g.volume),
          backgroundColor: palette,
          borderColor: '#0A0A12',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        cutout: '62%',
        plugins: {
          legend: {
            display: true, position: 'right',
            labels: { color: '#B4B2CC', font: { size: 10, family: 'Poppins' }, boxWidth: 10, padding: 8 }
          },
          tooltip: {
            backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
            titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
            callbacks: {
              label: (ctx) => {
                const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                return ` ${ctx.label}: ${Math.round(ctx.parsed)} kg (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Una gráfica de línea chica por ejercicio — usa los puntos que ya
  // vienen de getExerciseProgress(), sin pedir historial aparte por
  // cada ejercicio (evitaría 15-20 llamadas solo para pintar esto).
  function _chartExerciseMini(ex, i) {
    const canvas = _setupCanvas(`ex-mini-chart-${i}`);
    if (!canvas || !ex.points || ex.points.length === 0) return;

    const color = ex.changePct > 0 ? '#00FF87' : ex.changePct < 0 ? '#EF4444' : '#6E6D8A';

    canvas.style.cursor = 'pointer';
    canvas.onclick = () => Metrics.openExerciseDetail(ex.name);

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: ex.points.map(p => Utils.formatDateShort(p.date)),
        datasets: [{
          data: ex.points.map(p => p.kg),
          borderColor: color, backgroundColor: color + '15', fill: true,
          tension: 0.4, pointRadius: ex.points.length > 1 ? 2 : 4, borderWidth: 2,
          pointBackgroundColor: color, pointBorderColor: 'transparent',
        }]
      },
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
            titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
            callbacks: { label: (ctx) => `${ctx.parsed.y} kg` }
          }
        },
        scales: {
          x: { display: false },
          y: { display: false },
        }
      }
    });
  }

  // ── MAPA MUSCULAR SVG ──────────────────────────────────────────────
  // Cada músculo es una figura SVG independiente con clase mm-<Grupo>,
  // así se puede pintar y poner tooltip por grupo sin librerías extra.
  // Las clases coinciden con los nombres de grupo del catálogo de
  // ejercicios (Pecho, Espalda, Biceps...).
  function _muscleMapSVG(view) {
    const N = 'fill="rgba(255,255,255,0.045)"';  // partes neutras (cabeza, manos...)
    const M = 'fill="rgba(255,255,255,0.07)"';   // músculos sin datos todavía

    if (view === 'front') {
      return `
      <svg viewBox="0 0 120 185" width="130" height="200" style="overflow:visible">
        <circle cx="60" cy="13" r="9" ${N}/>
        <rect x="55" y="21" width="10" height="7" rx="3" ${N}/>
        <ellipse cx="39" cy="37" rx="8.5" ry="6.5" class="mm-Hombro" ${M}/>
        <ellipse cx="81" cy="37" rx="8.5" ry="6.5" class="mm-Hombro" ${M}/>
        <rect x="45" y="33" width="14.5" height="13" rx="5" class="mm-Pecho" ${M}/>
        <rect x="60.5" y="33" width="14.5" height="13" rx="5" class="mm-Pecho" ${M}/>
        <ellipse cx="34" cy="57" rx="6" ry="10" class="mm-Biceps" ${M}/>
        <ellipse cx="86" cy="57" rx="6" ry="10" class="mm-Biceps" ${M}/>
        <ellipse cx="30" cy="79" rx="5" ry="10" ${N}/>
        <ellipse cx="90" cy="79" rx="5" ry="10" ${N}/>
        <rect x="48" y="48" width="24" height="30" rx="8" class="mm-Core" ${M}/>
        <rect x="47" y="80" width="26" height="11" rx="5" ${N}/>
        <ellipse cx="52" cy="112" rx="8" ry="20" class="mm-Cuadriceps" ${M}/>
        <ellipse cx="68" cy="112" rx="8" ry="20" class="mm-Cuadriceps" ${M}/>
        <ellipse cx="51" cy="152" rx="5.5" ry="16" ${N}/>
        <ellipse cx="69" cy="152" rx="5.5" ry="16" ${N}/>
        <ellipse cx="50" cy="174" rx="5" ry="3.5" ${N}/>
        <ellipse cx="70" cy="174" rx="5" ry="3.5" ${N}/>
      </svg>`;
    }

    return `
      <svg viewBox="0 0 120 185" width="130" height="200" style="overflow:visible">
        <circle cx="60" cy="13" r="9" ${N}/>
        <rect x="55" y="21" width="10" height="7" rx="3" ${N}/>
        <rect x="49" y="27" width="22" height="8" rx="4" class="mm-Espalda" ${M}/>
        <ellipse cx="39" cy="37" rx="8.5" ry="6.5" class="mm-Hombro" ${M}/>
        <ellipse cx="81" cy="37" rx="8.5" ry="6.5" class="mm-Hombro" ${M}/>
        <rect x="45" y="36" width="14.5" height="26" rx="6" class="mm-Espalda" ${M}/>
        <rect x="60.5" y="36" width="14.5" height="26" rx="6" class="mm-Espalda" ${M}/>
        <ellipse cx="34" cy="57" rx="6" ry="10" class="mm-Triceps" ${M}/>
        <ellipse cx="86" cy="57" rx="6" ry="10" class="mm-Triceps" ${M}/>
        <ellipse cx="30" cy="79" rx="5" ry="10" ${N}/>
        <ellipse cx="90" cy="79" rx="5" ry="10" ${N}/>
        <rect x="51" y="64" width="18" height="13" rx="5" class="mm-Espalda" ${M}/>
        <rect x="47" y="79" width="12.5" height="13" rx="6" ${N}/>
        <rect x="60.5" y="79" width="12.5" height="13" rx="6" ${N}/>
        <ellipse cx="52" cy="114" rx="8" ry="19" class="mm-Isquiotibiales" ${M}/>
        <ellipse cx="68" cy="114" rx="8" ry="19" class="mm-Isquiotibiales" ${M}/>
        <ellipse cx="51" cy="152" rx="6" ry="15" class="mm-Pantorrillas" ${M}/>
        <ellipse cx="69" cy="152" rx="6" ry="15" class="mm-Pantorrillas" ${M}/>
        <ellipse cx="50" cy="174" rx="5" ry="3.5" ${N}/>
        <ellipse cx="70" cy="174" rx="5" ry="3.5" ${N}/>
      </svg>`;
  }

  function _paintMuscleMap() {
    const wrap = document.getElementById('muscle-map-wrap');
    if (!wrap || _volumeByGroup.length === 0) return;

    // Volumen por grupo → volumen por región del cuerpo. "Calistenia"
    // no es un músculo — el trabajo de Diego ahí es jalón (dominadas,
    // australianas), así que se reparte: espalda 50%, bíceps 30%,
    // core 20%. Ajustable si cambia su enfoque de calistenia.
    const vol = {};
    _volumeByGroup.forEach(g => {
      if (g.group === 'Calistenia') {
        vol['Espalda'] = (vol['Espalda'] || 0) + g.volume * 0.5;
        vol['Biceps']  = (vol['Biceps']  || 0) + g.volume * 0.3;
        vol['Core']    = (vol['Core']    || 0) + g.volume * 0.2;
      } else if (g.group !== 'Cardio' && g.group !== 'Otro') {
        vol[g.group] = (vol[g.group] || 0) + g.volume;
      }
    });

    const values = Object.values(vol);
    if (values.length === 0) return;
    const max = Math.max(...values);
    const total = values.reduce((a, b) => a + b, 0);

    Object.entries(vol).forEach(([group, v]) => {
      const intensity = max > 0 ? v / max : 0;
      const alpha = (0.15 + 0.75 * intensity).toFixed(2);
      const pct = total > 0 ? Math.round((v / total) * 100) : 0;
      wrap.querySelectorAll('.mm-' + group).forEach(el => {
        el.setAttribute('fill', `rgba(0,255,135,${alpha})`);
        el.innerHTML = `<title>${group}: ${Math.round(v)} kg (${pct}%)</title>`;
      });
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
      // Se agrega al INICIO — el arreglo se mantiene más reciente
      // primero, igual que llega del backend.
      _metricsHistory.unshift({
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

  // ── DETALLE DE PROGRESIÓN POR EJERCICIO ───────────────────────────────
  async function openExerciseDetail(name) {
    Sounds.click();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <div class="modal-title">${name}</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="position:relative;height:220px;width:100%;overflow:hidden" id="ex-detail-chart-wrap">
            <div class="skeleton" style="height:100%;border-radius:10px"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    try {
      const res = await API.getStrengthHistory(name);
      const rows = res.history || [];
      const byDate = {};
      rows.forEach(r => {
        const raw = parseFloat(r.kg) || 0;
        if (raw <= 0) return;
        const kg = r.unit === 'lbs' ? Utils.lbsToKg(raw) : raw;
        if (!byDate[r.date] || kg > byDate[r.date]) byDate[r.date] = kg;
      });
      const points = Object.entries(byDate).sort((a,b) => a[0].localeCompare(b[0]));

      const wrap = document.getElementById('ex-detail-chart-wrap');
      if (!wrap) return; // el usuario cerró el modal antes de que cargara

      if (points.length === 0) {
        wrap.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-3);font-size:12px">Sin historial de peso para este ejercicio</div>`;
        return;
      }

      wrap.innerHTML = `<canvas id="ex-detail-chart"></canvas>`;
      const canvas = document.getElementById('ex-detail-chart');
      const w = wrap.offsetWidth || 460, h = wrap.offsetHeight || 220;
      canvas.width = w; canvas.height = h;

      new Chart(canvas, {
        type: 'line',
        data: {
          labels: points.map(p => Utils.formatDateShort(p[0])),
          datasets: [{
            label: 'Peso (kg)', data: points.map(p => p[1]),
            borderColor: '#00FF87', backgroundColor: 'rgba(0,255,135,0.08)', fill: true,
            tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#00FF87', pointBorderColor: 'transparent',
          }]
        },
        options: {
          responsive: false, maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF' }
          },
          scales: {
            x: { ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
            y: { ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' }, callback: v => v + 'kg' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
          }
        }
      });
    } catch(e) {
      const wrap = document.getElementById('ex-detail-chart-wrap');
      if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-3);font-size:12px">Error al cargar el historial</div>`;
    }
  }

  return { init, openCapture, saveCapture, openExerciseDetail, setExerciseFilter };
})();

function initMetrics(container) { Metrics.init(container); }
