// ═══════════════════════════════════════════
// CALENDARIO MODULE — Vista mensual de toda tu actividad
// ═══════════════════════════════════════════

const Calendario = (() => {

  let _sessions = [];
  let _cardio = [];
  let _viewDate = new Date(); // mes que se está mostrando
  let _usingMock = false;
  let _phases = [];       // rangos de semana por fase (getProgramPhases)
  let _checkins = {};      // fecha -> check-in (sueño, energía, qué hiciste en tu descanso)
  let _restForm = { date: null, acts: [], note: '' };
  let _dayTypeByDow = {};  // 0-6 -> {type, name, icon} — el tipo de día no cambia por fase

  const DOW = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  async function init(container) {
    container.innerHTML = `<div class="skeleton" style="height:500px;border-radius:16px"></div>`;
    const [sesRes, cardioRes, phasesRes, planRes, ckRes] = await Promise.all([
      API.getSessions(120), API.getCardio(90), API.getProgramPhases(52), API.getWeekPlan(), API.getCheckins().catch(() => ({ checkins: [] })),
    ]);
    _checkins = {};
    ((ckRes && ckRes.checkins) || []).forEach(c => { _checkins[c.date] = c; });
    _sessions = sesRes.sessions || [];
    _cardio = cardioRes.sessions || [];
    _usingMock = API.isMock();
    _phases = phasesRes.phases || [];
    _dayTypeByDow = {};
    (planRes.plan || []).forEach(d => { _dayTypeByDow[d.dayOfWeek] = { type: d.type, name: d.name, icon: d.icon }; });
    render();
  }

  // Convierte una fecha a número de fase usando PROGRAM_START_DATE +
  // los rangos de semana de getProgramPhases(). Fases "por definir"
  // (pending) no cuentan — un día ahí se muestra sin badge de fase.
  function _phaseForDate(dateStr) {
    const start = new Date(CONFIG.PROGRAM_START_DATE + 'T00:00:00');
    const d = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.floor((d - start) / 86400000);
    if (diffDays < 0) return null;
    const week = Math.floor(diffDays / 7) + 1;
    return _phases.find(p => !p.pending && week >= p.startWeek && week <= p.endWeek) || null;
  }

  function changeMonth(delta) {
    _viewDate.setMonth(_viewDate.getMonth() + delta);
    render();
  }

  function goToday() {
    _viewDate = new Date();
    render();
  }

  function _fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const year = _viewDate.getFullYear();
    const month = _viewDate.getMonth();
    const todayStr = Utils.today();

    // Primer día del mes y cuántos días tiene
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Lunes = 0 ... Domingo = 6 (en vez del getDay() nativo que empieza en domingo)
    const firstDow = (firstOfMonth.getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null); // relleno antes del día 1
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    container.innerHTML = `
      <div style="max-width:900px;margin:0 auto">
        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div><strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.</div>
          </div>
        </div>` : ''}

        <div class="card section" style="margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
            <button class="btn btn-secondary btn-icon" onclick="Calendario.changeMonth(-1)">←</button>
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:700;color:var(--text-1)">${MONTH_NAMES[month]} ${year}</div>
              <button class="btn btn-ghost btn-sm" style="margin-top:2px" onclick="Calendario.goToday()">Ir a hoy</button>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="Calendario.changeMonth(1)">→</button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px">
            ${DOW.map(d => `<div style="text-align:center;font-size:9px;font-weight:600;color:var(--text-4);text-transform:uppercase;padding:4px 0">${d}</div>`).join('')}
          </div>

          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
            ${cells.map(d => {
              if (d === null) return `<div></div>`;
              const dateObj = new Date(year, month, d);
              const dateStr = _fmtDate(dateObj);
              const isToday = dateStr === todayStr;
              const daySessions = _sessions.filter(s => s.date === dateStr);
              const dayCardio = _cardio.filter(c => c.date === dateStr);
              const hasStrength = daySessions.length > 0;
              const hasCardio = dayCardio.length > 0;
              const hasAny = hasStrength || hasCardio;

              // Intensidad (0-1) para el mapa de calor — volumen de
              // fuerza normalizado contra 3000kg, minutos de cardio
              // contra 40min. Si hay ambos el mismo día, se suman
              // (con tope en 1) — un día de doble sesión sí debe verse
              // más intenso que uno solo.
              const volScore = daySessions.reduce((s, x) => s + (x.volume || 0), 0) / 3000;
              const cardioScore = dayCardio.reduce((s, x) => s + (x.duration || 0), 0) / 40;
              const intensity = Math.min(1, volScore + cardioScore);

              // Plan vs. real — el tipo de día (fuerza/mixta/cardio/
              // descanso) no cambia entre fases, así que basta un solo
              // getWeekPlan() para saber qué tocaba.
              const dow = dateObj.getDay();
              const planned = _dayTypeByDow[dow];
              const wasRestDay = !planned || planned.type === 'rest';
              const missed = !wasRestDay && !hasAny && dateStr < todayStr; // solo días ya pasados cuentan como "perdidos"
              const bonus = wasRestDay && hasAny; // entrenaste en tu día de descanso — se marca en positivo
              // Descanso PLANEADO que ya pasó (o es hoy) y no entrenaste: cuenta como
              // hecho solo — descansar también es parte del plan, no hay que registrarlo.
              const plannedRest = !!planned && planned.type === 'rest';
              const restDone = plannedRest && !hasAny && dateStr <= todayStr;
              const ck = _checkins[dateStr];
              const hasRestNote = !!(ck && (ck.restActivities.length || ck.restNote));
              const clickable = hasAny || restDone || !!ck;

              const phase = _phaseForDate(dateStr);

              const heatBg = hasAny
                ? `rgba(0, 255, 135, ${(0.10 + intensity * 0.35).toFixed(2)})`
                : restDone ? 'rgba(110,109,138,0.16)' : missed ? 'rgba(239,68,68,0.06)' : 'transparent';

              return `
              <div class="${clickable ? 'calendar-day-active' : ''}" onclick="${clickable ? `Calendario.openDay('${dateStr}')` : ''}" title="${phase ? `Fase ${phase.number} — ${phase.name}` : ''}"
                style="position:relative;aspect-ratio:1;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
                cursor:${clickable ? 'pointer' : 'default'};
                background:${isToday ? 'var(--accent-glow)' : heatBg};
                border:${isToday ? '1.5px solid var(--accent)' : missed ? '1px dashed rgba(239,68,68,0.35)' : '1px solid transparent'}">
                <div style="font-size:11px;font-weight:${isToday ? '700' : '500'};color:${isToday ? 'var(--accent)' : (hasAny || restDone) ? 'var(--text-1)' : missed ? 'var(--danger)' : 'var(--text-4)'}">${d}</div>
                <div style="display:flex;gap:2px;height:6px;align-items:center">
                  ${hasStrength ? `<div style="width:5px;height:5px;border-radius:50%;background:var(--accent)"></div>` : ''}
                  ${hasCardio ? `<div style="width:5px;height:5px;border-radius:50%;background:var(--info)"></div>` : ''}
                  ${bonus ? `<span style="font-size:7px">✨</span>` : ''}
                  ${restDone ? `<span style="font-size:8px">${hasRestNote ? '🛌' : '😴'}</span>` : ''}
                  ${missed ? `<span style="font-size:7px;color:var(--danger)">·</span>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>

          <div style="display:flex;gap:14px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:9px;color:var(--text-3);flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:50%;background:var(--accent)"></div>Fuerza</div>
            <div style="display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:50%;background:var(--info)"></div>Cardio</div>
            <div style="display:flex;align-items:center;gap:5px">✨ Extra en descanso</div>
            <div style="display:flex;align-items:center;gap:5px">😴 Descanso (se marca solo) · 🛌 con nota</div>
            <div style="display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:2px;border:1px dashed rgba(239,68,68,0.5)"></div>Día planeado sin registrar</div>
          </div>
        </div>

        <div class="card section">
          <div class="card-header"><div class="card-title">📊 Resumen de ${MONTH_NAMES[month]}</div></div>
          ${(() => {
            const monthPrefix = `${year}-${String(month+1).padStart(2,'0')}`;
            const sMonth = _sessions.filter(s => s.date.startsWith(monthPrefix));
            const cMonth = _cardio.filter(c => c.date.startsWith(monthPrefix));
            const daysWithActivity = new Set([...sMonth.map(s=>s.date), ...cMonth.map(c=>c.date)]).size;
            const totalVolume = sMonth.reduce((sum, s) => sum + (s.volume || 0), 0);
            return `
            <div class="grid-4" style="gap:10px">
              <div style="background:var(--bg-input);border-radius:10px;padding:12px">
                <div style="font-size:9px;color:var(--text-3)">Días activos</div>
                <div style="font-size:18px;font-weight:700;color:var(--text-1)">${daysWithActivity}<span style="font-size:10px;color:var(--text-3)">/${daysInMonth}</span></div>
              </div>
              <div style="background:var(--bg-input);border-radius:10px;padding:12px">
                <div style="font-size:9px;color:var(--text-3)">Sesiones fuerza</div>
                <div style="font-size:18px;font-weight:700;color:var(--accent)">${sMonth.length}</div>
              </div>
              <div style="background:var(--bg-input);border-radius:10px;padding:12px">
                <div style="font-size:9px;color:var(--text-3)">Sesiones cardio</div>
                <div style="font-size:18px;font-weight:700;color:var(--info)">${cMonth.length}</div>
              </div>
              <div style="background:var(--bg-input);border-radius:10px;padding:12px">
                <div style="font-size:9px;color:var(--text-3)">Volumen total</div>
                <div style="font-size:18px;font-weight:700;color:var(--text-1)">${Math.round(totalVolume)}<span style="font-size:10px;color:var(--text-3)">kg</span></div>
              </div>
            </div>`;
          })()}
        </div>
      </div>`;

    // Cada render() aquí es una vista nueva de verdad (mes distinto),
    // así que no hace falta la bandera de "solo una vez" — a
    // diferencia de otros módulos, abrir un día (openDay) no pasa
    // por render(), usa su propio modal.
    Motion.staggerIn(container.querySelectorAll('.section'));
  }

  // ── Descanso y check-in dentro del modal del día ──────────────────
  function _isPlannedRest(dateStr) {
    const p = _dayTypeByDow[new Date(dateStr + 'T00:00:00').getDay()];
    return !!p && p.type === 'rest' && dateStr <= Utils.today();
  }
  function _checkinLine(dateStr) {
    const c = _checkins[dateStr];
    if (!c || (c.sleep === null && c.energy === null)) return '';
    const bits = [c.sleep !== null ? `sueño ${c.sleep}/10` : null, c.energy !== null ? `energía ${c.energy}/5` : null].filter(Boolean);
    return `<div style="font-size:11px;color:var(--text-3);padding:2px 2px 0">☀️ Check-in del día: ${bits.join(' · ')}</div>`;
  }
  function _restBlockHTML(dateStr, restOnly) {
    if (_restForm.date !== dateStr) {
      const c = _checkins[dateStr] || { restActivities: [], restNote: '' };
      _restForm = { date: dateStr, acts: (c.restActivities || []).slice(), note: c.restNote || '' };
    }
    const done = !!((_checkins[dateStr] || {}).restActivities || []).length || !!(_checkins[dateStr] || {}).restNote;
    return `
      <div style="background:var(--bg-input);border-radius:10px;padding:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:16px">😴</span>
          <span style="font-size:12px;font-weight:700">${restOnly ? 'Día de descanso — hecho ✓' : 'Tu descanso de este día'}</span>
        </div>
        ${restOnly ? '<div style="font-size:11px;color:var(--text-3);margin-bottom:10px;line-height:1.5">Se marca solo: descansar también es parte del plan. Si quieres, anota qué hiciste — así el Coach aprende cómo te recuperas.</div>' : ''}
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">
          ${Utils.REST_ACTIVITIES.map((a, i) => `<button type="button" class="btn btn-sm ${_restForm.acts.includes(a) ? 'btn-primary' : 'btn-secondary'}" style="padding:6px 10px;font-size:11px" onclick="Calendario.toggleRestAct(${i})">${Utils.escapeHtml(a)}</button>`).join('')}
        </div>
        <input class="input" maxlength="200" placeholder="Algo más que quieras anotar (opcional)" value="${Utils.escapeHtml(_restForm.note)}" oninput="Calendario.setRestNote(this.value)" style="margin-bottom:8px">
        <button class="btn btn-primary btn-sm" id="cal-rest-save" style="width:100%" onclick="Calendario.saveRest()">${done ? 'Actualizar nota de descanso' : 'Guardar nota de descanso'}</button>
      </div>`;
  }
  function toggleRestAct(i) {
    Sounds.click();
    const a = Utils.REST_ACTIVITIES[i], k = _restForm.acts.indexOf(a);
    if (k >= 0) _restForm.acts.splice(k, 1); else _restForm.acts.push(a);
    const b = document.getElementById('cal-rest-block');
    if (b) b.innerHTML = _restBlockHTML(_restForm.date, !_sessions.some(s => s.date === _restForm.date) && !_cardio.some(c => c.date === _restForm.date));
  }
  function setRestNote(v) { _restForm.note = v; }
  async function saveRest() {
    if (!_restForm.date) return;
    if (!_restForm.acts.length && !_restForm.note.trim()) { Toast.warning('Elige una actividad o escribe una nota.'); return; }
    const btn = document.getElementById('cal-rest-save'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      const res = await API.saveCheckin({ date: _restForm.date, restActivities: _restForm.acts, restNote: _restForm.note.trim() });
      if (res && res.success) {
        Sounds.serieDone();
        _checkins[_restForm.date] = Object.assign({ sleep: null, energy: null }, _checkins[_restForm.date], { date: _restForm.date, restActivities: _restForm.acts.slice(), restNote: _restForm.note.trim() });
        API.clearCache();
        Toast.success('Nota de descanso guardada 🛌');
        const ov = document.querySelector('.modal-overlay.modal-centered'); if (ov) Motion.closeModal(ov);
        render();
        return;
      }
      Toast.warning((res && res.error) || 'No se pudo guardar.');
    } catch(e) { Toast.warning('Sin conexión — intenta de nuevo cuando tengas señal.'); }
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar nota de descanso'; }
  }

  function openDay(dateStr) {
    Sounds.click();
    const daySessions = _sessions.filter(s => s.date === dateStr);
    const dayCardio = _cardio.filter(c => c.date === dateStr);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-centered'; // en celular, centrado (no hoja desde abajo)
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <div class="modal-title">${Utils.formatDate(dateStr)}</div>
          <button class="btn btn-ghost btn-icon" onclick="Motion.closeModal(this.closest('.modal-overlay'))">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
          ${_checkinLine(dateStr)}
          ${daySessions.map(s => `
            <div style="background:var(--bg-input);border-radius:10px;padding:12px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:14px">💪</span>
                <span style="font-size:12px;font-weight:700;color:var(--text-1)">${s.type || 'Fuerza'}</span>
              </div>
              <div style="font-size:11px;color:var(--text-3)">${Utils.formatDuration(s.duration)}${s.fcAvg ? ` · ${s.fcAvg} bpm` : ''}${s.volume ? ` · ${s.volume} kg` : ''}${s.effort ? ` · esfuerzo ${s.effort}/10` : ''}</div>
            </div>`).join('')}
          ${dayCardio.map(c => `
            <div style="background:var(--bg-input);border-radius:10px;padding:12px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:14px">🏃</span>
                <span style="font-size:12px;font-weight:700;color:var(--text-1)">${c.protocol || c.type || 'Cardio'}</span>
              </div>
              <div style="font-size:11px;color:var(--text-3)">${Utils.formatDuration(c.duration)}${c.fcAvg ? ` · ${c.fcAvg} bpm` : ''}${c.distance ? ` · ${c.distance} km` : ''}</div>
            </div>`).join('')}
          ${_isPlannedRest(dateStr) ? `<div id="cal-rest-block">${_restBlockHTML(dateStr, !daySessions.length && !dayCardio.length)}</div>` : ''}
        </div>
        <div class="modal-footer">
          ${(daySessions.length || dayCardio.length) ? `<button class="btn btn-primary" style="width:100%" onclick="Router.navigate('history')">Ver en Bitácora →</button>` : `<button class="btn btn-secondary" style="width:100%" onclick="Motion.closeModal(this.closest('.modal-overlay'))">Cerrar</button>`}
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Swipe para moverse al día anterior/siguiente sin cerrar y volver
    // a abrir el modal a mano — desliza sobre el modal mismo, no sobre
    // el overlay completo (así no interfiere con tocar fuera para
    // cerrar).
    const modalEl = overlay.querySelector('.modal');
    Gestures.onSwipe(modalEl, {
      onLeft:  () => { Motion.closeModal(overlay); openDay(_shiftDate(dateStr, 1)); },
      onRight: () => { Motion.closeModal(overlay); openDay(_shiftDate(dateStr, -1)); },
    });
  }

  function _shiftDate(dateStr, deltaDays) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    return _fmtDate(d);
  }

  return { init, changeMonth, goToday, openDay, toggleRestAct, setRestNote, saveRest };
})();

function initCalendario(container) { Calendario.init(container); }
