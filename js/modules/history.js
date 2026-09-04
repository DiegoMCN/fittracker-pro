// ═══════════════════════════════════════════
// HISTORY MODULE — Bitácora de sesiones
// ═══════════════════════════════════════════

const History = (() => {

  let _sessions = [];
  let _cardio = [];
  let _filter = 'all'; // all | Fuerza | Cardio
  let _expandedId = null;
  let _exerciseDetailCache = {}; // { [fecha]: { loading, exercises } }
  let _splitsAnalysisCache = {}; // { [fecha]: { loading, data } }
  let _usingMock = false;

  async function init(container) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${[1,2,3,4,5].map(() => `<div class="skeleton" style="height:80px;border-radius:14px"></div>`).join('')}
      </div>`;

    const [sesData, cardioData] = await Promise.all([API.getSessions(50), API.getCardio(50)]);
    _sessions = sesData.sessions || [];
    _cardio   = cardioData.sessions || [];
    _usingMock = API.isMock();
    render();
  }

  function _merged() {
    const fromSessions = _sessions.map(s => ({ ...s, _kind: 'sesion' }));
    const fromCardio = _cardio.map(c => ({
      date: c.date, type: 'Cardio', duration: c.duration, fcAvg: c.fcAvg, fcPeak: c.fcPeak,
      calories: c.caloriasActivas, calTotal: c.caloriasTotales, paceProm: c.paceProm,
      effort: null, volume: null, notes: c.notes, _kind: 'cardio',
      distance: c.distance, cadAvg: c.cadAvg, cadPeak: c.cadPeak, cadPeakVal: c.cadPeak,
      velMax: c.velMax, fcPost1: c.fcPost1, fcPost2: c.fcPost2, rec2min: c.rec2min,
      zone1: c.zone1, zone2: c.zone2, zone3: c.zone3, zone4: c.zone4, zone5: c.zone5,
      coachNote: c.coachNote || '', rowNum: c.rowNum, protocol: c.protocol,
    }));
    const all = [...fromSessions, ...fromCardio];
    all.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
    return all;
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    let list = _merged();
    if (_filter !== 'all') list = list.filter(s => s.type === _filter);

    // Agrupar por fecha
    const grouped = {};
    list.forEach(s => { (grouped[s.date] = grouped[s.date] || []).push(s); });
    const dates = Object.keys(grouped).sort().reverse();

    const totalSessions = list.length;
    const totalVolume   = list.reduce((s, x) => s + (Number(x.volume) || 0), 0);
    const avgFC         = list.filter(x => x.fcAvg).reduce((s, x, _, arr) => s + x.fcAvg / arr.length, 0);

    container.innerHTML = `
      <div style="max-width:900px;margin:0 auto">

        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div>
              <strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.
              Verifica que el Apps Script esté deployado y la URL en <code>config.js</code> sea correcta.
            </div>
          </div>
        </div>` : ''}

        <!-- Stats resumen -->
        <div class="grid-3" style="margin-bottom:24px">
          <div class="metric-card">
            <div class="metric-label">Sesiones registradas</div>
            <div class="metric-value accent">${totalSessions}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Volumen acumulado</div>
            <div class="metric-value" style="color:var(--purple-light)">${Utils.formatNum(totalVolume)}<span class="metric-unit">kg</span></div>
          </div>
          <div class="metric-card">
            <div class="metric-label">FC promedio general</div>
            <div class="metric-value" style="color:var(--danger)">${avgFC ? Math.round(avgFC) : '—'}<span class="metric-unit">bpm</span></div>
          </div>
        </div>

        <!-- Filtros -->
        <div style="display:flex;gap:8px;margin-bottom:20px">
          ${['all','Fuerza','Cardio'].map(f => `
            <button class="btn ${_filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm"
              onclick="History.setFilter('${f}')">
              ${f === 'all' ? 'Todas' : f}
            </button>`).join('')}
        </div>

        <!-- Timeline -->
        ${dates.length === 0 ? `
          <div style="text-align:center;padding:60px 20px;color:var(--text-3)">
            <div style="font-size:40px;margin-bottom:12px">📭</div>
            <div>Sin sesiones registradas todavía</div>
          </div>` : dates.map(date => `
          <div style="margin-bottom:20px">
            <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;
              letter-spacing:.06em;margin-bottom:10px;padding-left:4px">
              ${Utils.formatDate(date)}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${grouped[date].map((s, i) => _sessionCard(s, `${date}_${i}`)).join('')}
            </div>
          </div>`).join('')}
      </div>`;

    setTimeout(_renderSplitsPaceChart, 100);
  }

  function _sessionCard(s, cardId) {
    const isExpanded = _expandedId === cardId;
    const isCardio = s.type === 'Cardio';
    const typeColor = isCardio ? 'var(--danger)' : 'var(--purple-light)';
    const typeIcon  = isCardio ? '🏃' : '💪';

    return `
    <div class="card" style="cursor:pointer" onclick="History.toggleExpand('${cardId}', '${s.date}', ${isCardio})">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:40px;height:40px;border-radius:10px;background:${typeColor}22;
          display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${typeIcon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${s.notes ? Utils.truncate(s.notes, 40) : (s.type || '—')}
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px">
            ${Utils.formatDuration(s.duration)} ${s.fcAvg ? `· ${s.fcAvg} bpm prom` : ''} ${s.effort ? `· esfuerzo ${s.effort}/10` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${s.volume ? `<div style="font-weight:700;font-size:13px;color:var(--accent)">${Utils.formatNum(s.volume)} kg</div>` : ''}
          ${s.distance ? `<div style="font-weight:700;font-size:13px;color:var(--info)">${s.distance} km</div>` : ''}
          <div style="font-size:10px;color:var(--text-4)">${isExpanded ? '▾' : '▸'}</div>
        </div>
      </div>

      ${isExpanded ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)" onclick="event.stopPropagation()">
          <div class="grid-3" style="gap:10px">
            ${s.fcAvg  ? `<div><div style="font-size:10px;color:var(--text-4)">FC promedio</div><div style="font-weight:700;font-size:14px">${s.fcAvg} bpm</div></div>` : ''}
            ${s.fcPeak ? `<div><div style="font-size:10px;color:var(--text-4)">FC pico</div><div style="font-weight:700;font-size:14px">${s.fcPeak} bpm</div></div>` : ''}
            ${s.fcMin ? `<div><div style="font-size:10px;color:var(--text-4)">FC mínima</div><div style="font-weight:700;font-size:14px">${s.fcMin} bpm</div></div>` : ''}
            ${s.calories ? `<div><div style="font-size:10px;color:var(--text-4)">Calorías activas</div><div style="font-weight:700;font-size:14px">${s.calories} kcal</div></div>` : ''}
            ${s.calTotal ? `<div><div style="font-size:10px;color:var(--text-4)">Calorías totales</div><div style="font-weight:700;font-size:14px">${s.calTotal} kcal</div></div>` : ''}
            ${s.paceProm ? `<div><div style="font-size:10px;color:var(--text-4)">Pace promedio</div><div style="font-weight:700;font-size:14px">${s.paceProm}/km</div></div>` : ''}
            ${s.cadAvg ? `<div><div style="font-size:10px;color:var(--text-4)">Cadencia</div><div style="font-weight:700;font-size:14px">${s.cadAvg} spm</div></div>` : ''}
            ${s.cadPeak ? `<div><div style="font-size:10px;color:var(--text-4)">Cadencia pico</div><div style="font-weight:700;font-size:14px">${s.cadPeak} spm</div></div>` : ''}
            ${s.rec2min !== undefined && s.rec2min !== null ? `<div><div style="font-size:10px;color:var(--text-4)">Recuperación 2min</div><div style="font-weight:700;font-size:14px;color:${s.rec2min < 0 ? 'var(--success)' : 'var(--danger)'}">${s.rec2min} bpm</div></div>` : ''}
          </div>

          ${!isCardio ? _renderExerciseDetail(s.date) : _renderSplitsAnalysis(s.date)}

          ${(s.zone1 || s.zone2 || s.zone3 || s.zone4 || s.zone5) ? `
          <div style="margin-top:12px">
            <div style="font-size:10px;color:var(--text-4);margin-bottom:6px">Zonas de FC</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text-2)">
              ${s.zone1 ? `<span>Z1: ${s.zone1}</span>` : ''}
              ${s.zone2 ? `<span>Z2: ${s.zone2}</span>` : ''}
              ${s.zone3 ? `<span>Z3: ${s.zone3}</span>` : ''}
              ${s.zone4 ? `<span>Z4: ${s.zone4}</span>` : ''}
              ${s.zone5 ? `<span>Z5: ${s.zone5}</span>` : ''}
            </div>
          </div>` : ''}

          ${(s.fcPost0 || s.fcPost1 || s.fcPost2) ? `
          <div style="margin-top:12px">
            <div style="font-size:10px;color:var(--text-4);margin-bottom:6px">Recuperación post-esfuerzo</div>
            <div style="display:flex;gap:14px;font-size:11px;color:var(--text-2)">
              ${s.fcPost0 ? `<span>Al terminar: ${s.fcPost0} bpm</span>` : ''}
              ${s.fcPost1 ? `<span>1 min: ${s.fcPost1} bpm</span>` : ''}
              ${s.fcPost2 ? `<span>2 min: ${s.fcPost2} bpm</span>` : ''}
            </div>
          </div>` : ''}

          ${s.notes ? `<div style="margin-top:12px;font-size:12px;color:var(--text-2);background:var(--bg-input);padding:10px 12px;border-radius:8px;line-height:1.5">${s.notes}</div>` : ''}

          ${s.coachNote ? `
          <div style="margin-top:12px;display:flex;gap:10px;align-items:flex-start;background:var(--accent-glow);border:1px solid var(--border-accent);border-radius:8px;padding:10px 12px">
            <span style="font-size:16px;flex-shrink:0">🤖</span>
            <div style="font-size:12px;color:var(--text-1);line-height:1.5">${s.coachNote}</div>
          </div>` : ''}

          ${s.rowNum ? `
          <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:12px" onclick="History.openEdit(${s.rowNum}, '${s._kind}')">
            ✏️ Editar / completar datos del reloj
          </button>` : ''}
        </div>` : ''}
    </div>`;
  }

  const SUPERSET_COLORS = { A: '#7C3AED', B: '#06B6D4', C: '#F59E0B', D: '#EC4899', E: '#10B981' };

  function _renderExerciseDetail(date) {
    const cache = _exerciseDetailCache[date];
    if (!cache || cache.loading) {
      return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--text-4)">Cargando ejercicios...</div>`;
    }
    if (cache.exercises.length === 0) {
      return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--text-4)">Sin detalle de ejercicios para esta sesión (puede ser un Log rápido).</div>`;
    }

    return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-4);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">Ejercicios de la sesión</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${cache.exercises.map(ex => {
            const ssColor = ex.supersetGroup ? SUPERSET_COLORS[ex.supersetGroup] : null;
            return `
            <div style="background:var(--bg-input);border-radius:10px;padding:10px 12px;${ssColor ? `border-left:3px solid ${ssColor}` : ''}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-size:12px;font-weight:600;color:var(--text-1)">${ex.name}</span>
                ${ex.supersetGroup ? `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:${ssColor}22;color:${ssColor}">🔗 ${ex.supersetGroup}</span>` : ''}
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${ex.sets.map(s => {
                  const label = s.unit === 'seg' ? `${s.reps || 0}seg`
                    : s.unit === 'PC' ? `${s.reps || 0} reps`
                    : `${s.reps || 0}×${Utils.formatNum(s.kg, 1)}${s.unit || 'kg'}`;
                  const isAssist = s.kind === 'asistencia';
                  return `<span style="font-size:11px;color:var(--text-2);background:var(--bg-card);padding:3px 8px;border-radius:6px">${isAssist ? '−' : ''}${label}</span>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // Dibuja la gráfica de pacing de la sesión de cardio expandida (si
  // hay una) — verde si ese split ya va al ritmo objetivo, gris si no.
  function _renderSplitsPaceChart() {
    Object.keys(_splitsAnalysisCache).forEach(date => {
      const canvas = document.getElementById(`splits-pace-chart-${date}`);
      if (!canvas || !window.Chart) return;
      const cache = _splitsAnalysisCache[date];
      if (!cache || cache.loading || !cache.data || !cache.data.hasData) return;

      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();

      const splits = cache.data.splits.filter(s => s.paceSec !== null);
      if (splits.length === 0) return;

      const parent = canvas.parentElement;
      const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : 140;
      const wRaw = (parent && parent.offsetWidth > 0) ? parent.offsetWidth : 400;
      const w = Math.min(wRaw, document.documentElement.clientWidth - 48);
      canvas.width = w; canvas.height = h;

      const TARGET_SEC = 180; // 3:00/km = 20km/h

      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: splits.map(s => `Km ${s.num}`),
          datasets: [{
            data: splits.map(s => s.paceSec),
            backgroundColor: splits.map(s => s.paceSec <= TARGET_SEC ? '#00FF87' : '#6E6D8A'),
            borderRadius: 4,
          }]
        },
        options: {
          responsive: false, maintainAspectRatio: false,
          animation: { duration: 500, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
              callbacks: { label: (ctx) => `Pace: ${splits[ctx.dataIndex].pace}/km${splits[ctx.dataIndex].fcAvg ? ` · FC ${splits[ctx.dataIndex].fcAvg}bpm` : ''}` }
            }
          },
          scales: {
            x: { ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' } }, grid: { display: false }, border: { display: false } },
            y: {
              reverse: true, // menos segundos = más rápido = barra "mejor" arriba
              ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, callback: v => _secToPaceClient(v) },
              grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
            },
          }
        }
      });
    });
  }

  function _secToPaceClient(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function _renderSplitsAnalysis(date) {
    const cache = _splitsAnalysisCache[date];
    if (!cache || cache.loading) {
      return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--text-4)">Cargando splits...</div>`;
    }
    const d = cache.data;
    if (!d || !d.hasData) {
      return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--text-4)">Sin splits registrados para esta sesión — puedes agregarlos con "✏️ Completar datos del reloj".</div>`;
    }

    return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-4);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">Análisis de splits</div>

        <!-- Gráfica de pacing -->
        <div style="position:relative;height:140px;width:100%;overflow:hidden;margin-bottom:14px">
          <canvas id="splits-pace-chart-${date}"></canvas>
        </div>

        <!-- Métricas -->
        <div class="grid-2" style="gap:8px">
          ${d.paceConsistency ? `
          <div style="background:var(--bg-input);border-radius:8px;padding:10px">
            <div style="font-size:9px;color:var(--text-3)">Consistencia de pace</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-1)">${d.paceConsistency.fastestPace} - ${d.paceConsistency.slowestPace}<span style="font-size:9px;color:var(--text-3)">/km</span></div>
            <div style="font-size:9px;color:${d.paceConsistency.rangeSec <= 15 ? 'var(--success)' : d.paceConsistency.rangeSec <= 30 ? 'var(--warning)' : 'var(--danger)'}">rango de ${d.paceConsistency.rangeSec}seg</div>
          </div>` : ''}

          <div style="background:var(--bg-input);border-radius:8px;padding:10px">
            <div style="font-size:9px;color:var(--text-3)">Al ritmo objetivo (20km/h)</div>
            <div style="font-size:13px;font-weight:700;color:${d.atTargetPct >= 50 ? 'var(--success)' : 'var(--text-1)'}">${d.atTargetPct}%</div>
            <div style="font-size:9px;color:var(--text-3)">${d.atTargetCount} de ${d.totalValidSplits} splits</div>
          </div>

          ${d.cardiacDrift ? `
          <div style="background:var(--bg-input);border-radius:8px;padding:10px">
            <div style="font-size:9px;color:var(--text-3)">Deriva cardíaca</div>
            <div style="font-size:13px;font-weight:700;color:${d.cardiacDrift.fcDrift > 10 && d.cardiacDrift.paceSimilar ? 'var(--warning)' : 'var(--text-1)'}">${d.cardiacDrift.fcDrift > 0 ? '+' : ''}${d.cardiacDrift.fcDrift} bpm</div>
            <div style="font-size:9px;color:var(--text-3)">${d.cardiacDrift.fcFirstHalf} → ${d.cardiacDrift.fcSecondHalf} bpm${d.cardiacDrift.paceSimilar ? ' (mismo pace)' : ''}</div>
          </div>` : ''}

          ${d.cadenceDrift ? `
          <div style="background:var(--bg-input);border-radius:8px;padding:10px">
            <div style="font-size:9px;color:var(--text-3)">Consistencia de cadencia</div>
            <div style="font-size:13px;font-weight:700;color:${d.cadenceDrift.cadDrift < -5 ? 'var(--warning)' : 'var(--text-1)'}">${d.cadenceDrift.cadDrift > 0 ? '+' : ''}${d.cadenceDrift.cadDrift} spm</div>
            <div style="font-size:9px;color:var(--text-3)">${d.cadenceDrift.cadFirstHalf} → ${d.cadenceDrift.cadSecondHalf} spm</div>
          </div>` : ''}
        </div>
      </div>`;
  }

  function setFilter(f) { _filter = f; Sounds.click(); render(); }

  function toggleExpand(id, date, isCardio) {
    _expandedId = _expandedId === id ? null : id;
    Sounds.click();
    // Carga el detalle de ejercicios (reps/peso por ejercicio) la
    // primera vez que se expande una sesión de fuerza — se cachea por
    // fecha para no volver a pedirlo si se cierra y abre de nuevo.
    if (_expandedId && !isCardio && date && !_exerciseDetailCache[date]) {
      _exerciseDetailCache[date] = { loading: true, exercises: [] };
      API.getSessionExercises(date).then(res => {
        _exerciseDetailCache[date] = { loading: false, exercises: res.exercises || [] };
        if (_expandedId === id) render(); // solo re-renderiza si sigue abierta
      }).catch(() => {
        _exerciseDetailCache[date] = { loading: false, exercises: [] };
      });
    }
    // Mismo patrón para el análisis de splits en sesiones de cardio.
    if (_expandedId && isCardio && date && !_splitsAnalysisCache[date]) {
      _splitsAnalysisCache[date] = { loading: true, data: null };
      API.getSplitsAnalysis(date).then(res => {
        _splitsAnalysisCache[date] = { loading: false, data: res };
        if (_expandedId === id) render();
      }).catch(() => {
        _splitsAnalysisCache[date] = { loading: false, data: { hasData: false } };
      });
    }
    render();
  }

  // ── EDITAR SESIÓN EXISTENTE ────────────────────────────────────────────
  function openEdit(rowNum, kind) {
    if (kind === 'cardio') { openCardioEdit(rowNum); return; }

    const s = _sessions.find(x => x.rowNum === rowNum);
    if (!s) { Toast.error('No se encontró la sesión'); return; }
    Sounds.click();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">✏️ Completar datos del reloj</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:11px;color:var(--text-3)">${Utils.formatDate(s.date)} · ${s.type}</p>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Duración (min)</label>
              <input class="input" type="number" id="ed-duration" value="${s.duration || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Esfuerzo (1-10)</label>
              <input class="input" type="number" id="ed-effort" value="${s.effort || ''}">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Calorías activas</label>
              <input class="input" type="number" id="ed-kcalact" value="${s.calories || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Calorías totales</label>
              <input class="input" type="number" id="ed-kcaltot" value="${s.calTotal || ''}">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">FC promedio</label>
              <input class="input" type="number" id="ed-fcavg" value="${s.fcAvg || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">FC pico</label>
              <input class="input" type="number" id="ed-fcpeak" value="${s.fcPeak || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">FC mínima</label>
              <input class="input" type="number" id="ed-fcmin" value="${s.fcMin || ''}">
            </div>
          </div>
          <div style="font-size:10px;color:var(--text-3);margin-top:4px">Tiempo en cada zona (mm:ss)</div>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Zona 1</label><input class="input" id="ed-z1" value="${s.zone1 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Zona 2</label><input class="input" id="ed-z2" value="${s.zone2 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Zona 3</label><input class="input" id="ed-z3" value="${s.zone3 || ''}"></div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Zona 4</label><input class="input" id="ed-z4" value="${s.zone4 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Zona 5</label><input class="input" id="ed-z5" value="${s.zone5 || ''}"></div>
          </div>
          <div style="font-size:10px;color:var(--text-3);margin-top:4px">Recuperación post-esfuerzo</div>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Al terminar</label><input class="input" type="number" id="ed-fcpost0" value="${s.fcPost0 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">1 min</label><input class="input" type="number" id="ed-fcpost1" value="${s.fcPost1 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">2 min</label><input class="input" type="number" id="ed-fcpost2" value="${s.fcPost2 || ''}"></div>
          </div>
          <div class="input-group">
            <label class="input-label">Notas</label>
            <input class="input" id="ed-notes" value="${(s.notes || '').replace(/"/g, '&quot;')}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="ed-save-btn" onclick="History.saveEdit(${rowNum})">Guardar cambios</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  let _savingEdit = false;

  async function saveEdit(rowNum) {
    if (_savingEdit) return; // evita doble click / doble guardado
    _savingEdit = true;
    const btn = document.getElementById('ed-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const val = id => document.getElementById(id)?.value || '';
    const payload = {
      rowNum,
      duration: val('ed-duration'), effort: val('ed-effort'),
      kcalAct: val('ed-kcalact'), kcalTot: val('ed-kcaltot'),
      fcAvg: val('ed-fcavg'), fcPeak: val('ed-fcpeak'), fcMin: val('ed-fcmin'),
      zone1: val('ed-z1'), zone2: val('ed-z2'), zone3: val('ed-z3'), zone4: val('ed-z4'), zone5: val('ed-z5'),
      fcPost0: val('ed-fcpost0'), fcPost1: val('ed-fcpost1'), fcPost2: val('ed-fcpost2'),
      notes: val('ed-notes'),
    };

    try {
      const result = await API.updateSession(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — los cambios se sincronizarán cuando vuelva la conexión');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success('Sesión actualizada');
      }
      init(document.getElementById('page-content')); // recarga con datos frescos
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar los cambios');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar cambios'; }
    } finally {
      _savingEdit = false;
    }
  }

  // ── EDITAR CARDIO EXISTENTE ────────────────────────────────────────────
  async function openCardioEdit(rowNum) {
    const s = _cardio.find(x => x.rowNum === rowNum);
    if (!s) { Toast.error('No se encontró la sesión'); return; }
    Sounds.click();

    // Trae los splits que ya existan para esta fecha, para precargarlos
    // en vez de partir de cero cada vez que editas.
    let existingSplits = [];
    try {
      const res = await API.getCardioSplits(s.date);
      existingSplits = res.splits || [];
    } catch(e) { /* si falla, se edita sin precarga */ }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">✏️ Completar datos del reloj</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:11px;color:var(--text-3)">${Utils.formatDate(s.date)} · ${s.protocol || 'Cardio'}</p>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Duración (min)</label>
              <input class="input" type="number" id="ce-duration" value="${s.duration || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Distancia (km)</label>
              <input class="input" type="number" step="0.01" id="ce-distance" value="${s.distance || ''}" oninput="History.renderCardioEditSplits()">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">FC promedio</label>
              <input class="input" type="number" id="ce-fcavg" value="${s.fcAvg || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">FC pico</label>
              <input class="input" type="number" id="ce-fcpeak" value="${s.fcPeak || ''}">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Cadencia prom.</label>
              <input class="input" type="number" id="ce-cadavg" value="${s.cadAvg || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Cadencia pico</label>
              <input class="input" type="number" id="ce-cadpeak" value="${s.cadPeakVal || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Vel. máxima (km/h)</label>
              <input class="input" type="number" step="0.1" id="ce-velmax" value="${s.velMax || ''}">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Calorías activas</label>
              <input class="input" type="number" id="ce-cal-active" value="${s.caloriasActivas || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Calorías totales</label>
              <input class="input" type="number" id="ce-cal-total" value="${s.caloriasTotales || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Pace promedio</label>
              <input class="input" id="ce-pace" value="${s.paceProm || ''}" placeholder="5:30">
            </div>
          </div>
          <div style="font-size:10px;color:var(--text-3);margin-top:4px">Recuperación post-esfuerzo</div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Al terminar</label>
              <input class="input" type="number" id="ce-fcpost0" placeholder="opcional">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">1 min</label>
              <input class="input" type="number" id="ce-fcpost1" value="${s.fcPost1 || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">2 min</label>
              <input class="input" type="number" id="ce-fcpost2" value="${s.fcPost2 || ''}">
            </div>
          </div>
          <div style="font-size:10px;color:var(--text-3);margin-top:4px">Tiempo en cada zona (mm:ss)</div>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Zona 1</label><input class="input" id="ce-z1" value="${s.zone1 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Zona 2</label><input class="input" id="ce-z2" value="${s.zone2 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Zona 3</label><input class="input" id="ce-z3" value="${s.zone3 || ''}"></div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Zona 4</label><input class="input" id="ce-z4" value="${s.zone4 || ''}"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Zona 5</label><input class="input" id="ce-z5" value="${s.zone5 || ''}"></div>
          </div>

          <div id="ce-splits-section"></div>

          <div class="input-group">
            <label class="input-label">Notas</label>
            <input class="input" id="ce-notes" value="${(s.notes || '').replace(/"/g, '&quot;')}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="ce-save-btn" onclick="History.saveCardioEdit(${rowNum}, '${s.date}')">Guardar cambios</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    _ceExistingSplits = existingSplits;
    renderCardioEditSplits();
  }

  // ── SPLITS EN EL MODAL DE EDICIÓN — mismo patrón que cardio.js ────────
  let _ceExistingSplits = [];

  function renderCardioEditSplits() {
    const section = document.getElementById('ce-splits-section');
    if (!section) return;

    const distance = parseFloat(document.getElementById('ce-distance')?.value) || 0;
    const numSplits = Math.ceil(distance);

    // Preserva lo ya escrito en pantalla; si no hay nada escrito
    // todavía, usa los splits que ya venían guardados para esta fecha.
    const prev = [];
    for (let i = 0; i < 20; i++) {
      const t = document.getElementById(`ce-split-time-${i}`)?.value;
      const f = document.getElementById(`ce-split-fc-${i}`)?.value;
      const c = document.getElementById(`ce-split-cad-${i}`)?.value;
      if (t || f || c) prev[i] = { t, f, c };
    }

    if (numSplits === 0) { section.innerHTML = ''; return; }

    const rows = [];
    for (let i = 0; i < numSplits; i++) {
      const isLast = i === numSplits - 1;
      const splitDist = isLast ? Math.round((distance - i) * 100) / 100 : 1;
      const label = splitDist < 1 ? `Km ${i+1} (${splitDist}km)` : `Km ${i+1}`;
      const existing = _ceExistingSplits[i];
      const p = prev[i] || (existing ? {
        t: existing.timeSec ? `${Math.floor(existing.timeSec/60)}:${String(existing.timeSec%60).padStart(2,'0')}` : '',
        f: existing.fcAvg || '', c: existing.cadence || '',
      } : {});
      rows.push(`
        <div class="input-row" style="align-items:flex-end">
          <div style="width:56px;flex-shrink:0;font-size:10px;color:var(--text-3);padding-bottom:10px">${label}</div>
          <div class="input-group" style="flex:1">
            <label class="input-label">Tiempo</label>
            <input class="input" id="ce-split-time-${i}" placeholder="mm:ss" value="${p.t || ''}">
          </div>
          <div class="input-group" style="flex:1">
            <label class="input-label">FC prom</label>
            <input class="input" type="number" id="ce-split-fc-${i}" placeholder="bpm" value="${p.f || ''}">
          </div>
          <div class="input-group" style="flex:1">
            <label class="input-label">Cadencia</label>
            <input class="input" type="number" id="ce-split-cad-${i}" placeholder="spm" value="${p.c || ''}">
          </div>
        </div>`);
    }

    section.innerHTML = `
      <div style="font-size:10px;color:var(--text-3);margin:4px 0 8px">Splits por kilómetro — pantalla "Splits" del reloj</div>
      <div style="display:flex;flex-direction:column;gap:8px">${rows.join('')}</div>`;
  }

  function _collectCardioEditSplits() {
    const distance = parseFloat(document.getElementById('ce-distance')?.value) || 0;
    const numSplits = Math.ceil(distance);
    const splits = [];
    for (let i = 0; i < numSplits; i++) {
      const timeStr = document.getElementById(`ce-split-time-${i}`)?.value || '';
      const fc = document.getElementById(`ce-split-fc-${i}`)?.value || '';
      const cad = document.getElementById(`ce-split-cad-${i}`)?.value || '';
      if (!timeStr && !fc && !cad) continue;

      const isLast = i === numSplits - 1;
      const splitDist = isLast ? Math.round((distance - i) * 100) / 100 : 1;

      let timeSec = 0, pace = '';
      const parts = timeStr.split(':');
      if (parts.length === 2) {
        timeSec = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
        if (splitDist > 0) {
          const paceSecPerKm = timeSec / splitDist;
          const paceMin = Math.floor(paceSecPerKm / 60);
          const paceSec = Math.round(paceSecPerKm % 60);
          pace = `${paceMin}:${String(paceSec).padStart(2, '0')}`;
        }
      }
      splits.push({ distanceKm: splitDist, timeSec, pace, fcAvg: fc, cadence: cad });
    }
    return splits;
  }

  let _savingCardioEdit = false;

  async function saveCardioEdit(rowNum, date) {
    if (_savingCardioEdit) return; // evita doble click / doble guardado
    _savingCardioEdit = true;
    const btn = document.getElementById('ce-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const val = id => document.getElementById(id)?.value || '';
    const payload = {
      rowNum, date,
      duration: val('ce-duration'), distance: val('ce-distance'),
      fcAvg: val('ce-fcavg'), fcPeak: val('ce-fcpeak'),
      cadAvg: val('ce-cadavg'), cadPeak: val('ce-cadpeak'), velMax: val('ce-velmax'),
      fcPost0: val('ce-fcpost0'), fcPost1: val('ce-fcpost1'), fcPost2: val('ce-fcpost2'),
      zone1: val('ce-z1'), zone2: val('ce-z2'), zone3: val('ce-z3'), zone4: val('ce-z4'), zone5: val('ce-z5'),
      caloriasActivas: val('ce-cal-active'), caloriasTotales: val('ce-cal-total'), paceProm: val('ce-pace'),
      splits: _collectCardioEditSplits(),
      notes: val('ce-notes'),
    };

    try {
      const result = await API.updateCardio(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — los cambios se sincronizarán cuando vuelva la conexión');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success('Cardio actualizado');
      }
      init(document.getElementById('page-content'));
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar los cambios');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar cambios'; }
    } finally {
      _savingCardioEdit = false;
    }
  }

  return { init, setFilter, toggleExpand, openEdit, saveEdit, openCardioEdit, saveCardioEdit, renderCardioEditSplits };
})();

function initHistory(container) { History.init(container); }
