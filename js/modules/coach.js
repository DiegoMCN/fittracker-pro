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
    const past = today ? _history.slice(1) : _history;

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

        <!-- Historial -->
        ${past.length > 0 ? `
        <div class="section-header">
          <div class="section-title">Historial de consejos</div>
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

  async function generate() {
    if (_generating) return; // evita doble click mientras genera
    _generating = true;
    const btn = document.getElementById('coach-generate-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generando...'; }
    Sounds.click();

    try {
      const res = await API.refreshDashboardInsight();
      API.clearCache();
      if (res.insight) {
        // Actualiza el historial local sin refetch completo
        const today = Utils.today();
        _history = _history.filter(h => h.date !== today);
        _history.unshift({ date: today, note: res.insight });
        Sounds.serieDone(); Haptics.success();
        Toast.success('Consejo generado 🤖');
        render();
      } else {
        Toast.warning('No se pudo generar el consejo — revisa que tengas la API key configurada');
        if (btn) { btn.disabled = false; btn.innerHTML = '🎯 Generar consejo de hoy'; }
      }
    } catch(err) {
      Sounds.error();
      Toast.error('Error al generar el consejo');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = '🎯 Generar consejo de hoy'; }
    } finally {
      _generating = false;
    }
  }

  return { init, generate };
})();

function initCoach(container) { Coach.init(container); }
