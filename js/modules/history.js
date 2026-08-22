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
      coachNote: c.coachNote || '',
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
            ${s.fcMin ? `<div><div style="font-size:10px;color:var(--text-4)">FC mínima</div><div style="font-weight:700;font-size:14px">${s.fcMin} bpm</div></div>` : ''}
            ${s.calories ? `<div><div style="font-size:10px;color:var(--text-4)">Calorías activas</div><div style="font-weight:700;font-size:14px">${s.calories} kcal</div></div>` : ''}
            ${s.calTotal ? `<div><div style="font-size:10px;color:var(--text-4)">Calorías totales</div><div style="font-weight:700;font-size:14px">${s.calTotal} kcal</div></div>` : ''}
            ${s.cadAvg ? `<div><div style="font-size:10px;color:var(--text-4)">Cadencia</div><div style="font-weight:700;font-size:14px">${s.cadAvg} spm</div></div>` : ''}
            ${s.cadPeak ? `<div><div style="font-size:10px;color:var(--text-4)">Cadencia pico</div><div style="font-weight:700;font-size:14px">${s.cadPeak} spm</div></div>` : ''}
            ${s.rec2min !== undefined && s.rec2min !== null ? `<div><div style="font-size:10px;color:var(--text-4)">Recuperación 2min</div><div style="font-weight:700;font-size:14px;color:${s.rec2min < 0 ? 'var(--success)' : 'var(--danger)'}">${s.rec2min} bpm</div></div>` : ''}
          </div>

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
          <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:12px" onclick="History.openEdit(${s.rowNum})">
            ✏️ Editar / completar datos del reloj
          </button>` : ''}
        </div>` : ''}
    </div>`;
  }

  function setFilter(f) { _filter = f; Sounds.click(); render(); }
  function toggleExpand(id) { _expandedId = _expandedId === id ? null : id; Sounds.click(); render(); }

  // ── EDITAR SESIÓN EXISTENTE ────────────────────────────────────────────
  function openEdit(rowNum) {
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

  return { init, setFilter, toggleExpand, openEdit, saveEdit };
})();

function initHistory(container) { History.init(container); }
