// ═══════════════════════════════════════════
// PLAN MODULE — Plan semanal (datos desde el Sheet)
// v2: completado se determina por sesiones reales, no localStorage
// ═══════════════════════════════════════════

const Plan = (() => {

  let _planData = [];     // Plan de ejercicios por día (desde PLAN_SEMANAL)
  let _weekSessions = []; // Sesiones ya guardadas esta semana (fuente de verdad)

  function _mondayOfThisWeek() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    // Componentes locales, no toISOString() (evita el desfase de zona horaria)
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function _isDayDone(day) {
    const dayName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][day];
    return _weekSessions.some(s => s.day === dayName);
  }

  async function init(container) {
    container.innerHTML = `
      <div style="max-width:900px;margin:0 auto">
        <div class="skeleton" style="height:100px;border-radius:16px;margin-bottom:24px"></div>
        ${[1,2,3,4,5,6,7].map(() => `<div class="skeleton" style="height:90px;border-radius:14px;margin-bottom:12px"></div>`).join('')}
      </div>`;

    const [planRes, sessionsRes] = await Promise.all([
      API.getWeekPlan(),
      API.getSessions(50),
    ]);

    _planData = planRes.plan || [];
    const monday = _mondayOfThisWeek();
    _weekSessions = (sessionsRes.sessions || []).filter(s => s.date >= monday);

    if (API.isMock()) Toast.warning('Sin conexión al Sheet — mostrando datos de ejemplo');

    render();
  }

  function _dayPlan(day) {
    return _planData.find(p => p.dayOfWeek === day) || CONFIG.WEEK_PLAN[day];
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const today = Utils.todayDayNum();
    const orderedDays = [1,2,3,4,5,6,0];
    const trainableDays = orderedDays.filter(d => _dayPlan(d).type !== 'rest');
    const completedCount = trainableDays.filter(d => _isDayDone(d)).length;
    const pct = trainableDays.length ? Math.round((completedCount / trainableDays.length) * 100) : 0;

    container.innerHTML = `
      <div style="max-width:900px;margin:0 auto">

        <!-- Progreso semana -->
        <div class="card card-accent" style="margin-bottom:24px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
            <div>
              <div style="font-weight:700;font-size:16px">${CONFIG.CURRENT_PHASE.name}</div>
              <div style="font-size:12px;color:var(--text-3);margin-top:2px">Semana ${CONFIG.CURRENT_PHASE.currentWeek} de 12 · ${completedCount}/${trainableDays.length} sesiones completadas</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:28px;font-weight:800;color:var(--accent)">${pct}%</div>
              <div style="font-size:10px;color:var(--text-3)">de la semana</div>
            </div>
          </div>
          <div class="progress-bar" style="margin-top:14px">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div style="font-size:10px;color:var(--text-4);margin-top:10px">
            ✓ Basado en sesiones reales guardadas en tu Google Sheet — no en marcas locales.
          </div>
        </div>

        <!-- Días -->
        <div style="display:flex;flex-direction:column;gap:12px">
          ${orderedDays.map(day => _dayCard(day, today)).join('')}
        </div>

      </div>`;
  }

  function _dayCard(day, today) {
    const info = _dayPlan(day);
    const isToday = day === today;
    const isRest = info.type === 'rest';
    const done = !isRest && _isDayDone(day);
    const exercises = info.exercises || [];
    const dayFullName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][day];
    const session = _weekSessions.find(s => s.day === dayFullName);

    return `
    <div class="card ${done ? 'card-accent' : ''}" style="${isToday ? 'border-color:var(--border-accent)' : ''}">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:${exercises.length ? '16px' : '0'}">
        <div style="width:48px;height:48px;border-radius:12px;background:${info.color}22;
          display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">
          ${done ? '✅' : info.icon}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:15px">${info.name}</span>
            ${isToday ? `<span style="font-size:10px;background:var(--accent);color:var(--bg-primary);padding:2px 8px;border-radius:99px;font-weight:700">HOY</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">
            ${dayFullName} · ${exercises.length ? exercises.length + ' ejercicios' : info.type === 'cardio' ? 'Cardio / Zona 2' : 'Descanso total'}
            ${done && session ? ` · registrado: ${Utils.formatDuration(session.duration)}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          ${!isRest ? `
            ${!done ? `<button class="btn btn-ghost btn-sm" onclick="Plan.quickLog(${day})">Log rápido</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('workout')">Entrenar →</button>
          ` : ''}
        </div>
      </div>

      ${exercises.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${exercises.map(ex => `
            <span style="font-size:11px;background:var(--bg-input);color:var(--text-2);padding:5px 10px;border-radius:8px;display:flex;align-items:center;gap:5px">
              ${_muscleIcon(ex.group)} ${ex.name}
            </span>`).join('')}
        </div>` : ''}
    </div>`;
  }

  function _muscleIcon(group) {
    const map = {
      'Pecho':'🎯','Espalda':'🔙','Biceps':'💪','Triceps':'💪','Hombro':'🤸',
      'Cuadriceps':'🦵','Isquiotibiales':'🦵','Pantorrillas':'🦵','Core':'🎪','Calistenia':'🤸‍♂️','Cardio':'🏃'
    };
    return map[group] || '•';
  }

  // ── LOG RÁPIDO — escribe directo al Sheet sin pasar por sesión activa ──
  function quickLog(day) {
    const info = _dayPlan(day);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-header">
          <div class="modal-title">✓ Registrar "${info.name}"</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <p style="font-size:12px;color:var(--text-3)">Registro rápido sin detalle de ejercicios — se guarda directo en tu Sheet. Para registrar pesos y series usa "Entrenar" en su lugar.</p>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Duración (min)</label>
              <input class="input" type="number" id="ql-duration" value="60">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Esfuerzo (1-10)</label>
              <input class="input" type="number" id="ql-effort" value="7" min="1" max="10">
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">Notas (opcional)</label>
            <input class="input" id="ql-notes" placeholder="Ej. Buena sesión, subí cargas">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="ql-save-btn" onclick="Plan.confirmQuickLog(${day})">Guardar en Sheet</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  let _savingQuickLog = false;

  async function confirmQuickLog(day) {
    if (_savingQuickLog) return; // evita doble click / doble guardado
    _savingQuickLog = true;
    const btn = document.getElementById('ql-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const info = _dayPlan(day);
    const duration = parseInt(document.getElementById('ql-duration').value) || 60;
    const effort   = parseInt(document.getElementById('ql-effort').value) || 7;
    const notes    = document.getElementById('ql-notes').value || info.name;
    const dayName  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][day];

    const payload = {
      date: Utils.today(),
      day: dayName,
      type: info.type === 'cardio' ? 'Cardio' : 'Fuerza',
      week: CONFIG.CURRENT_PHASE.currentWeek,
      phase: CONFIG.CURRENT_PHASE.name,
      duration, effort, notes,
      exercises: [],
    };

    try {
      const result = await API.saveSession(payload);
      API.clearCache();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — guardado localmente, se sincronizará solo');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success(`"${info.name}" registrado`);
      }
      document.querySelector('.modal-overlay')?.remove();
      _weekSessions.push(payload);
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar en el Sheet');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar en Sheet'; }
    } finally {
      _savingQuickLog = false;
    }
  }

  return { init, quickLog, confirmQuickLog };
})();

function initPlan(container) { Plan.init(container); }
