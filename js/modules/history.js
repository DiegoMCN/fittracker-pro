// ═══════════════════════════════════════════
// HISTORY MODULE — Bitácora de sesiones
// ═══════════════════════════════════════════

const History = (() => {

  let _sessions = [];
  let _cardio = [];
  let _filter = 'all'; // all | Fuerza | Cardio
  let _expandedId = null;
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
      calories: null, effort: null, volume: null, notes: c.notes, _kind: 'cardio',
      distance: c.distance, cadAvg: c.cadAvg, cadPeak: c.cadPeak, rec2min: c.rec2min,
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
  }

  function _sessionCard(s, cardId) {
    const isExpanded = _expandedId === cardId;
    const isCardio = s.type === 'Cardio';
    const typeColor = isCardio ? 'var(--danger)' : 'var(--purple-light)';
    const typeIcon  = isCardio ? '🏃' : '💪';

    return `
    <div class="card" style="cursor:pointer" onclick="History.toggleExpand('${cardId}')">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:40px;height:40px;border-radius:10px;background:${typeColor}22;
          display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${typeIcon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${Utils.truncate(s.notes, 40) || s.type}
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
            ${s.calories ? `<div><div style="font-size:10px;color:var(--text-4)">Calorías</div><div style="font-weight:700;font-size:14px">${s.calories} kcal</div></div>` : ''}
            ${s.cadAvg ? `<div><div style="font-size:10px;color:var(--text-4)">Cadencia</div><div style="font-weight:700;font-size:14px">${s.cadAvg} spm</div></div>` : ''}
            ${s.cadPeak ? `<div><div style="font-size:10px;color:var(--text-4)">Cadencia pico</div><div style="font-weight:700;font-size:14px">${s.cadPeak} spm</div></div>` : ''}
            ${s.rec2min !== undefined && s.rec2min !== null ? `<div><div style="font-size:10px;color:var(--text-4)">Recuperación 2min</div><div style="font-weight:700;font-size:14px;color:${s.rec2min < 0 ? 'var(--success)' : 'var(--danger)'}">${s.rec2min} bpm</div></div>` : ''}
          </div>
          ${s.notes ? `<div style="margin-top:12px;font-size:12px;color:var(--text-2);background:var(--bg-input);padding:10px 12px;border-radius:8px;line-height:1.5">${s.notes}</div>` : ''}
        </div>` : ''}
    </div>`;
  }

  function setFilter(f) { _filter = f; Sounds.click(); render(); }
  function toggleExpand(id) { _expandedId = _expandedId === id ? null : id; Sounds.click(); render(); }

  return { init, setFilter, toggleExpand };
})();

function initHistory(container) { History.init(container); }
