// ═══════════════════════════════════════════
// WORKOUT MODULE — Sesión activa de fuerza
// v2: plan desde Sheet, inicio manual, sesión persistente
// ═══════════════════════════════════════════

const Workout = (() => {

  let state = null;          // Sesión activa (persiste entre navegaciones)
  let planData = null;       // Cache del plan semanal (desde el Sheet)
  let elapsedInterval = null;
  let restInterval = null;

  // ── CARGA DEL PLAN (desde Google Sheet vía Apps Script) ──────────────
  async function _loadPlan() {
    if (planData) return planData;
    const res = await API.getWeekPlan();
    planData = res.plan || [];
    if (API.isMock()) {
      Toast.warning('Sin conexión al Sheet — usando plan de ejemplo local');
    }
    return planData;
  }

  function _planForDay(day) {
    if (!planData) return null;
    return planData.find(p => p.dayOfWeek === day) || null;
  }

  // Heurística: ejercicios "asistidos" (dominadas/fondos con máquina)
  // por defecto sugieren modo asistencia; el resto, carga. Siempre editable
  // por serie porque el mismo ejercicio puede entrenarse distinto según el día.
  function _defaultKind(name) {
    return /asistid/i.test(name || '') ? 'assist' : 'load';
  }

  function _freshState(day, dayPlan) {
    const exercises = dayPlan?.exercises || [];
    return {
      day,
      dayName: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][day],
      planName: dayPlan?.name || 'Sesión libre',
      started: false,
      startedAt: null,
      finished: false,
      exercises: exercises.map(ex => ({
        id: Utils.uid(),
        name: ex.name,
        group: ex.group,
        notes: ex.notes || '',
        photoUrl: ex.photoUrl || '',
        videoUrl: ex.videoUrl || '',
        instructions: ex.instructions || '',
        collapsed: false,
        sets: Array.from({ length: ex.sets }, () => ({
          repsTarget: `${ex.repsMin}-${ex.repsMax}`,
          reps: '', kg: '', unit: ex.unit, kind: _defaultKind(ex.name), done: false,
        })),
      })),
      rest: { running: false, remaining: 0, total: 0 },
    };
  }

  // ── INIT (llamado cada vez que se navega a esta página) ──────────────
  async function init(container) {
    // Si ya hay una sesión iniciada en curso → resumir directo, no mostrar picker
    if (state && state.started && !state.finished) {
      _renderSession();
      return;
    }

    container.innerHTML = `<div style="max-width:640px;margin:0 auto">
      <div class="skeleton" style="height:320px;border-radius:16px"></div>
    </div>`;

    await _loadPlan();
    const today = Utils.todayDayNum();
    _renderPicker(container, today);
  }

  function _renderPicker(container, selectedDay) {
    container.innerHTML = `
      <div style="max-width:640px;margin:0 auto">
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <div>
              <div class="card-title">¿Qué día quieres entrenar?</div>
              <div class="card-subtitle">Plan cargado desde tu Google Sheet — editable antes de iniciar</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[1,2,3,4,5,6,0].map(day => {
              const dayPlan = _planForDay(day) || CONFIG.WEEK_PLAN[day];
              const isToday = day === Utils.todayDayNum();
              const exCount = dayPlan?.exercises?.length || 0;
              const isRest = dayPlan?.type === 'rest';
              return `
              <div onclick="Workout.selectDay(${day})" style="
                display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;cursor:pointer;
                background:${isToday ? 'var(--accent-glow)' : 'var(--bg-input)'};
                border:1px solid ${isToday ? 'var(--border-accent)' : 'var(--border)'};
                transition:all 0.15s"
                onmouseenter="this.style.borderColor='var(--text-4)'"
                onmouseleave="this.style.borderColor='${isToday ? 'var(--border-accent)' : 'var(--border)'}'">
                <div style="width:40px;height:40px;border-radius:10px;background:${dayPlan.color}22;
                  display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${dayPlan.icon}</div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:13px">${dayPlan.name}</div>
                  <div style="font-size:11px;color:var(--text-3)">${exCount > 0 ? exCount + ' ejercicios base' : isRest ? 'Día de descanso' : 'Cardio / Zona 2'}</div>
                </div>
                ${isToday ? '<span style="font-size:10px;background:var(--accent);color:var(--bg-primary);padding:2px 8px;border-radius:99px;font-weight:700">HOY</span>' : ''}
                <span style="color:var(--text-4)">→</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <button class="btn btn-secondary" style="width:100%" onclick="Workout.selectDay(-1)">
          ✏️ Empezar sesión libre (sin plan base)
        </button>
      </div>`;
  }

  function selectDay(day) {
    Sounds.click();
    if (day === -1) {
      state = _freshState(Utils.todayDayNum(), { name: 'Sesión libre', exercises: [] });
    } else {
      state = _freshState(day, _planForDay(day));
    }
    _renderPreview();
  }

  // ── PREVIEW (antes de iniciar — editable) ────────────────────────────
  function _renderPreview() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:720px;margin:0 auto;padding-bottom:100px">

        <div class="card" style="margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:700;font-size:16px">${state.planName}</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px">${state.exercises.length} ejercicios · revisa o edita antes de empezar</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Workout.backToPicker()">← Cambiar día</button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px" id="exercise-list">
          ${state.exercises.map((ex, i) => _exerciseCard(ex, i, true)).join('')}
        </div>

        ${state.exercises.length === 0 ? `
          <div style="text-align:center;padding:40px 20px;color:var(--text-3);margin-bottom:20px">
            <div style="font-size:36px;margin-bottom:10px">🏋️</div>
            <div style="font-size:13px">Sin ejercicios todavía.</div>
          </div>` : ''}

        <button class="btn btn-secondary" style="width:100%;margin-bottom:24px" onclick="Workout.addExercise()">+ Agregar ejercicio</button>

        <!-- Botón grande de iniciar -->
        <button class="btn btn-primary btn-lg animate-pulse-glow" style="width:100%;position:sticky;bottom:20px" onclick="Workout.startSession()">
          ⚡ Iniciar Sesión
        </button>
      </div>`;

    _hydrateHistories();
  }

  function backToPicker() {
    Sounds.click();
    state = null;
    _renderPicker(document.getElementById('page-content'), Utils.todayDayNum());
  }

  // ── INICIO MANUAL DE LA SESIÓN ────────────────────────────────────────
  function startSession() {
    if (state.exercises.length === 0) {
      if (!confirm('No hay ejercicios cargados. ¿Iniciar de todas formas?')) return;
    }
    Sounds.sessionDone(); Haptics.success();
    state.started = true;
    state.startedAt = Date.now();
    WakeLock.request();
    if (elapsedInterval) clearInterval(elapsedInterval);
    elapsedInterval = setInterval(_tick, 1000);
    _renderSession();
    Toast.success('¡Sesión iniciada! 💪');
  }

  // ── RENDER SESIÓN ACTIVA ─────────────────────────────────────────────
  function _renderSession() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const totalSets = state.exercises.reduce((s, e) => s + e.sets.length, 0);
    const doneSets  = state.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
    const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

    container.innerHTML = `
      <div style="max-width:720px;margin:0 auto;padding-bottom:100px">

        <!-- Header sesión -->
        <div class="card card-glass" style="position:sticky;top:0;z-index:10;margin-bottom:20px;backdrop-filter:blur(20px)">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-weight:700;font-size:16px">${state.planName}</div>
              <div style="font-size:11px;color:var(--text-3);display:flex;align-items:center;gap:6px;margin-top:2px">
                <span id="elapsed-time" style="font-variant-numeric:tabular-nums">${Utils.formatTime(Math.floor((Date.now() - state.startedAt)/1000))}</span>
                · ${doneSets}/${totalSets} series
                ${WakeLock.isActive() ? '<span style="color:var(--accent)">· 🔓 pantalla activa</span>' : ''}
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary btn-sm" onclick="Workout.addExercise()">+ Ejercicio</button>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="Workout.discardSession()" title="Cancelar sesión">🗑</button>
              <button class="btn btn-primary btn-sm" onclick="Workout.finishSession()">✓ Terminar</button>
            </div>
          </div>
          <div class="progress-bar" style="margin-top:12px">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>

        <!-- Rest timer flotante -->
        <div id="rest-timer-widget"></div>

        <!-- Lista de ejercicios -->
        <div id="exercise-list" style="display:flex;flex-direction:column;gap:14px">
          ${state.exercises.map((ex, i) => _exerciseCard(ex, i, false)).join('')}
        </div>

        ${state.exercises.length === 0 ? `
          <div style="text-align:center;padding:60px 20px;color:var(--text-3)">
            <div style="font-size:40px;margin-bottom:12px">🏋️</div>
            <div style="font-size:13px">Sin ejercicios todavía.</div>
            <button class="btn btn-primary" style="margin-top:16px" onclick="Workout.addExercise()">+ Agregar ejercicio</button>
          </div>` : ''}

      </div>`;

    _renderRestWidget();
    _renderFloatingBar();
    _hydrateHistories();
  }

  function _exerciseCard(ex, exIdx, previewMode) {
    const tagMap = { 'Pecho':'chest','Espalda':'back','Biceps':'biceps','Triceps':'triceps','Hombro':'shoulder',
      'Cuadriceps':'legs','Isquiotibiales':'legs','Pantorrillas':'legs','Core':'core','Calistenia':'cali','Cardio':'cardio' };
    const tagCls = tagMap[ex.group] || 'core';
    const doneCount = ex.sets.filter(s => s.done).length;
    const allDone = doneCount === ex.sets.length && ex.sets.length > 0;

    return `
    <div class="card ${allDone ? 'card-accent' : ''}" data-ex-idx="${exIdx}" style="transition:all 0.3s">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${ex.collapsed ? '0' : '14px'}">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer" onclick="Workout.toggleCollapse(${exIdx})">
          <span style="font-size:16px;color:var(--text-3)">${ex.collapsed ? '▸' : '▾'}</span>
          <div style="min-width:0">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${allDone ? '✅ ' : ''}${ex.name}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
              <span class="tag tag-${tagCls}">${ex.group}</span>
              <span style="font-size:11px;color:var(--text-3)">${previewMode ? ex.sets.length + ' series planeadas' : doneCount + '/' + ex.sets.length + ' series'}</span>
            </div>
          </div>
        </div>
        <button class="btn btn-ghost btn-icon" onclick="Workout.removeExercise(${exIdx})" title="Eliminar ejercicio">🗑</button>
      </div>

      ${!ex.collapsed ? `
        <div style="border-radius:10px;overflow:hidden;margin-bottom:12px;background:var(--bg-input)">
          <div style="height:120px;position:relative;display:flex;align-items:center;justify-content:center;background:var(--bg-card)">
            ${ex.photoUrl ? `
              <img src="${ex.photoUrl}" style="width:100%;height:100%;object-fit:cover"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
              <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-size:32px;opacity:0.4">🏋️</div>
            ` : `<div style="font-size:32px;opacity:0.4">🏋️</div>`}
            ${ex.videoUrl ? `
              <a href="${ex.videoUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="
                position:absolute;bottom:8px;right:8px;background:var(--bg-overlay);backdrop-filter:blur(6px);
                color:var(--accent);font-size:11px;font-weight:600;padding:5px 10px;border-radius:8px;
                display:flex;align-items:center;gap:4px">▶ Ver técnica</a>` : ''}
          </div>
          ${ex.instructions ? `<div style="padding:8px 10px;font-size:11px;color:var(--text-2);line-height:1.4">${ex.instructions}</div>` : ''}
        </div>

        ${ex.notes ? `<div style="font-size:11px;color:var(--text-3);background:var(--bg-input);border-radius:8px;padding:8px 10px;margin-bottom:12px;line-height:1.5">💡 ${ex.notes}</div>` : ''}

        ${ex.group !== 'Core' && ex.group !== 'Cardio' ? `
        <div data-hist-name="${ex.name}" style="background:var(--bg-input);border-radius:8px;padding:10px 12px;margin-bottom:12px">
          ${_sparkHTML(ex.name)}
        </div>` : ''}

        <div style="display:flex;flex-direction:column;gap:8px">
          ${ex.sets.map((set, sIdx) => _setRow(ex, exIdx, set, sIdx, previewMode)).join('')}
        </div>

        <button class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" onclick="Workout.addSet(${exIdx})">+ Agregar serie</button>
      ` : ''}
    </div>`;
  }

  function _setRow(ex, exIdx, set, sIdx, previewMode) {
    const isTime = set.unit === 'seg';
    const showWeight = !isTime && set.unit !== 'PC';

    return `
    <div style="display:flex;flex-direction:column;gap:6px;background:${set.done ? 'var(--accent-glow)' : 'var(--bg-input)'};
      border:1px solid ${set.done ? 'var(--border-accent)' : 'transparent'};border-radius:10px;padding:8px 10px;transition:all 0.2s">

      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:24px;height:24px;border-radius:6px;background:var(--bg-card);display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;color:var(--text-3);flex-shrink:0">${sIdx + 1}</div>

        ${previewMode ? `
          <span style="font-size:12px;color:var(--text-3)">objetivo: ${set.repsTarget} ${isTime ? 'seg' : 'reps'}</span>
        ` : `
          <input type="number" inputmode="numeric" placeholder="${isTime ? 'seg' : 'reps'}" value="${set.reps}"
            style="width:56px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-1);
            font-size:13px;font-weight:600;padding:6px 4px;text-align:center"
            onchange="Workout.updateSet(${exIdx},${sIdx},'reps',this.value)">

          <span style="color:var(--text-4);font-size:11px">${isTime ? '' : '×'}</span>

          ${!isTime ? `
            <select id="unit-select-${exIdx}-${sIdx}" onchange="Workout.changeUnit(${exIdx},${sIdx},this.value)"
              style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-3);
              font-size:11px;padding:6px 3px">
              <option value="PC"  ${set.unit === 'PC'  ? 'selected' : ''}>Peso corp.</option>
              <option value="kg"  ${set.unit === 'kg'  ? 'selected' : ''}>kg</option>
              <option value="lbs" ${set.unit === 'lbs' ? 'selected' : ''}>lbs</option>
            </select>

            ${showWeight ? `
              <input type="number" inputmode="decimal" placeholder="peso" value="${set.kg}" id="kg-input-${exIdx}-${sIdx}"
                style="width:60px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-1);
                font-size:13px;font-weight:600;padding:6px 4px;text-align:center"
                oninput="Workout.refreshKgHint(${exIdx},${sIdx})">
            ` : ''}
          ` : ''}

          <span style="font-size:10px;color:var(--text-4);margin-left:auto;white-space:nowrap">obj: ${set.repsTarget}</span>

          <button onclick="Workout.toggleSetDone(${exIdx},${sIdx})" style="
            width:30px;height:30px;border-radius:8px;flex-shrink:0;font-size:14px;
            background:${set.done ? 'var(--accent)' : 'var(--bg-card)'};
            color:${set.done ? 'var(--bg-primary)' : 'var(--text-3)'};
            border:1px solid ${set.done ? 'var(--accent)' : 'var(--border)'};
            transition:all 0.2s">${set.done ? '✓' : ''}</button>
        `}
      </div>

      ${!previewMode && showWeight ? `
        <div style="display:flex;align-items:center;gap:8px;padding-left:32px">
          <div style="display:flex;background:var(--bg-card);border-radius:6px;padding:2px;gap:2px">
            <button id="kind-load-${exIdx}-${sIdx}" onclick="Workout.setKind(${exIdx},${sIdx},'load')"
              style="font-size:10px;padding:3px 8px;border-radius:5px;font-weight:600;
              background:${set.kind !== 'assist' ? 'var(--accent)' : 'transparent'};
              color:${set.kind !== 'assist' ? 'var(--bg-primary)' : 'var(--text-3)'}">Carga</button>
            <button id="kind-assist-${exIdx}-${sIdx}" onclick="Workout.setKind(${exIdx},${sIdx},'assist')"
              style="font-size:10px;padding:3px 8px;border-radius:5px;font-weight:600;
              background:${set.kind === 'assist' ? 'var(--warning)' : 'transparent'};
              color:${set.kind === 'assist' ? 'var(--bg-primary)' : 'var(--text-3)'}">Asistencia</button>
          </div>
          <span id="kg-hint-${exIdx}-${sIdx}" style="font-size:9px;color:var(--text-4);white-space:nowrap">
            ${set.unit === 'lbs' && set.kg ? '≈ ' + Utils.formatNum(Utils.lbsToKg(parseFloat(set.kg) || 0), 1) + ' kg' : ''}
            ${set.unit === 'kg'  && set.kg ? '≈ ' + Utils.formatNum(Utils.kgToLbs(parseFloat(set.kg) || 0), 1) + ' lbs' : ''}
          </span>
        </div>
      ` : ''}
    </div>`;
  }

  // ── REST TIMER WIDGET ────────────────────────────────────────────────
  function _renderRestWidget() {
    const el = document.getElementById('rest-timer-widget');
    if (!el) return;

    if (!state.rest.running) {
      el.innerHTML = `
        <div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text-3);font-weight:600">⏱ Descanso:</span>
          ${[30,45,60,90,120].map(s => `
            <button class="btn btn-secondary btn-sm" onclick="Workout.startRest(${s})">${s}s</button>
          `).join('')}
          <button class="btn btn-ghost btn-sm" onclick="Workout.customRest()">Personalizado</button>
        </div>`;
    } else {
      const pct = Math.round((state.rest.remaining / state.rest.total) * 100);
      const circumference = 2 * Math.PI * 40;
      const offset = circumference - (pct / 100) * circumference;
      el.innerHTML = `
        <div class="card card-accent animate-pulse-glow" style="margin-bottom:14px;display:flex;align-items:center;gap:16px">
          <div style="position:relative;width:90px;height:90px;flex-shrink:0">
            <svg width="90" height="90" style="transform:rotate(-90deg)">
              <circle cx="45" cy="45" r="40" stroke="var(--bg-input)" stroke-width="6" fill="none"/>
              <circle cx="45" cy="45" r="40" stroke="var(--accent)" stroke-width="6" fill="none"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
                style="transition:stroke-dashoffset 1s linear;filter:drop-shadow(0 0 6px var(--accent))"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
              font-size:20px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums">
              ${state.rest.remaining}
            </div>
          </div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">Descansando...</div>
            <div style="font-size:11px;color:var(--text-3)">Siguiente serie en breve</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="Workout.addRestTime(15)">+15s</button>
            <button class="btn btn-ghost btn-sm" onclick="Workout.skipRest()">Saltar</button>
          </div>
        </div>`;
    }
  }

  function startRest(seconds) {
    Sounds.restStart(); Haptics.light();
    state.rest = { running: true, remaining: seconds, total: seconds };
    _renderRestWidget();
    if (restInterval) clearInterval(restInterval);
    restInterval = setInterval(() => {
      state.rest.remaining--;
      if (state.rest.remaining === 5) Sounds.restWarning();
      if (state.rest.remaining <= 0) {
        clearInterval(restInterval);
        state.rest.running = false;
        Sounds.restDone(); Haptics.success();
        if (Router.current() === 'workout') Toast.success('Descanso terminado — ¡siguiente serie!');
        else Toast.success('⏱ Descanso terminado');
      }
      if (Router.current() === 'workout') _renderRestWidget();
    }, 1000);
  }

  function addRestTime(seconds) {
    state.rest.remaining += seconds;
    state.rest.total += seconds;
    Sounds.click();
    _renderRestWidget();
  }

  function skipRest() {
    clearInterval(restInterval);
    state.rest.running = false;
    Sounds.click();
    _renderRestWidget();
  }

  function customRest() {
    const val = prompt('Segundos de descanso:', '75');
    const n = parseInt(val);
    if (n > 0) startRest(n);
  }

  // ── ACCIONES DE EJERCICIOS ───────────────────────────────────────────
  function _rerender() {
    if (state.started) _renderSession(); else _renderPreview();
  }

  function toggleCollapse(exIdx) {
    state.exercises[exIdx].collapsed = !state.exercises[exIdx].collapsed;
    Sounds.click();
    _rerender();
  }

  function updateSet(exIdx, sIdx, field, value) {
    state.exercises[exIdx].sets[sIdx][field] = value;
  }

  // Cambiar PC↔kg↔lbs sí necesita re-render completo (aparece/desaparece
  // el input de peso y el toggle carga/asistencia). Los selects no
  // pierden nada al perder foco, así que esto es seguro.
  function changeUnit(exIdx, sIdx, newUnit) {
    state.exercises[exIdx].sets[sIdx].unit = newUnit;
    Sounds.click();
    _rerender();
  }

  // Alterna entre "carga" (peso agregado, más = mejor) y "asistencia"
  // (peso de la máquina, menos = mejor). Solo cambia clases de los
  // botones — no re-renderiza para no interrumpir si hay un input activo.
  function setKind(exIdx, sIdx, kind) {
    state.exercises[exIdx].sets[sIdx].kind = kind;
    Sounds.click();
    const loadBtn   = document.getElementById(`kind-load-${exIdx}-${sIdx}`);
    const assistBtn = document.getElementById(`kind-assist-${exIdx}-${sIdx}`);
    if (loadBtn && assistBtn) {
      loadBtn.style.background   = kind === 'load' ? 'var(--accent)' : 'transparent';
      loadBtn.style.color        = kind === 'load' ? 'var(--bg-primary)' : 'var(--text-3)';
      assistBtn.style.background = kind === 'assist' ? 'var(--warning)' : 'transparent';
      assistBtn.style.color      = kind === 'assist' ? 'var(--bg-primary)' : 'var(--text-3)';
    }
  }

  // Actualiza el valor + muestra conversión kg↔lbs en vivo sin re-renderizar
  // (evita perder el foco del input mientras escribes)
  function refreshKgHint(exIdx, sIdx) {
    const kgInput = document.getElementById(`kg-input-${exIdx}-${sIdx}`);
    const hint = document.getElementById(`kg-hint-${exIdx}-${sIdx}`);
    if (!kgInput) return;

    const val = parseFloat(kgInput.value) || 0;
    const unit = state.exercises[exIdx].sets[sIdx].unit;
    updateSet(exIdx, sIdx, 'kg', kgInput.value);

    if (!hint) return;
    if (val <= 0) { hint.textContent = ''; return; }
    hint.textContent = unit === 'lbs'
      ? `≈ ${Utils.formatNum(Utils.lbsToKg(val), 1)} kg`
      : `≈ ${Utils.formatNum(Utils.kgToLbs(val), 1)} lbs`;
  }

  // ── HISTORIAL POR EJERCICIO (mini-gráfica de progreso) ────────────────
  const _historyCache = {}; // { [nombreEjercicio]: { loading, values: [{date, kg}] } }

  async function _ensureHistoryLoaded(name) {
    if (_historyCache[name]) return; // ya cargado o cargando
    _historyCache[name] = { loading: true };

    try {
      const res = await API.getStrengthHistory(name);
      const rows = res.history || [];
      // Agrupa por fecha, toma el peso máximo de esa sesión, convertido siempre a kg
      const byDate = {};
      rows.forEach(r => {
        const raw = parseFloat(r.kg) || 0;
        if (raw <= 0) return;
        const kg = r.unit === 'lbs' ? Utils.lbsToKg(raw) : raw;
        if (!byDate[r.date] || kg > byDate[r.date]) byDate[r.date] = kg;
      });
      const values = Object.entries(byDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([date, kg]) => ({ date, kg }));
      _historyCache[name] = { loading: false, values };
    } catch(e) {
      _historyCache[name] = { loading: false, values: [] };
    }

    // Actualiza cualquier tarjeta visible de este ejercicio, sin re-render completo
    document.querySelectorAll(`[data-hist-name]`).forEach(el => {
      if (el.getAttribute('data-hist-name') === name) el.innerHTML = _sparkHTML(name);
    });
  }

  function _sparkHTML(name) {
    const entry = _historyCache[name];
    if (!entry || entry.loading) {
      return `<div style="font-size:10px;color:var(--text-4)">Cargando historial...</div>`;
    }
    if (!entry.values || entry.values.length === 0) {
      return `<div style="font-size:10px;color:var(--text-4)">Sin sesiones previas registradas</div>`;
    }

    const vals = entry.values;
    const kgs = vals.map(v => v.kg);
    const max = Math.max(...kgs), min = Math.min(...kgs);
    const range = (max - min) || 1;
    const w = 110, h = 32, pad = 4;

    const coords = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1 || 1)) * (w - pad * 2);
      const y = h - pad - ((v.kg - min) / range) * (h - pad * 2);
      return { x, y };
    });
    const points = coords.map(c => `${c.x},${c.y}`).join(' ');

    const last = vals[vals.length - 1];
    const prev = vals.length > 1 ? vals[vals.length - 2] : null;
    const delta = prev !== null ? Math.round((last.kg - prev.kg) * 10) / 10 : null;

    return `
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="${w}" height="${h}" style="flex-shrink:0">
          <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
          ${coords.map(c => `<circle cx="${c.x}" cy="${c.y}" r="2.2" fill="var(--accent)"/>`).join('')}
        </svg>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--accent)">${Utils.formatNum(last.kg, 1)} kg</div>
          ${delta !== null
            ? `<div style="font-size:10px;color:${delta >= 0 ? 'var(--success)' : 'var(--text-3)'}">${delta >= 0 ? '+' : ''}${Utils.formatNum(delta, 1)} kg vs anterior</div>`
            : `<div style="font-size:10px;color:var(--text-4)">${Utils.formatDateShort(last.date)}</div>`}
        </div>
      </div>`;
  }

  function _hydrateHistories() {
    state.exercises.forEach(ex => {
      if (ex.group === 'Core' || ex.group === 'Cardio') return; // seg/tiempo no aplica gráfica de peso
      _ensureHistoryLoaded(ex.name);
    });
  }

  function toggleSetDone(exIdx, sIdx) {
    const set = state.exercises[exIdx].sets[sIdx];
    set.done = !set.done;
    if (set.done) { Sounds.serieDone(); Haptics.medium(); } else { Sounds.click(); }
    _rerender();
  }

  function addSet(exIdx) {
    const ex = state.exercises[exIdx];
    const lastSet = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      repsTarget: lastSet?.repsTarget || '',
      reps: '', kg: lastSet?.kg || '', unit: lastSet?.unit || 'PC',
      kind: lastSet?.kind || _defaultKind(ex.name), done: false
    });
    Sounds.click();
    _rerender();
  }

  function removeExercise(exIdx) {
    if (!confirm(`¿Eliminar "${state.exercises[exIdx].name}" de la sesión?`)) return;
    state.exercises.splice(exIdx, 1);
    Sounds.click();
    _rerender();
  }

  function addExercise() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <div class="modal-title">+ Agregar ejercicio</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="input-group">
            <label class="input-label">Nombre del ejercicio</label>
            <input class="input" id="new-ex-name" placeholder="Ej. Press militar">
          </div>
          <div class="input-group">
            <label class="input-label">Grupo muscular</label>
            <select class="input" id="new-ex-group">
              ${CONFIG.MUSCLE_GROUPS.map(g => `<option value="${g}">${g}</option>`).join('')}
            </select>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Series</label>
              <input class="input" type="number" id="new-ex-sets" value="3">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Reps obj.</label>
              <input class="input" id="new-ex-reps" placeholder="8-12" value="8-12">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Unidad</label>
              <select class="input" id="new-ex-unit">
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
                <option value="seg">seg</option>
                <option value="PC">peso corp.</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="Workout.confirmAddExercise()">Agregar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('new-ex-name').focus();
  }

  function confirmAddExercise() {
    const name  = document.getElementById('new-ex-name').value.trim();
    const group = document.getElementById('new-ex-group').value;
    const sets  = parseInt(document.getElementById('new-ex-sets').value) || 3;
    const reps  = document.getElementById('new-ex-reps').value || '8-12';
    const unit  = document.getElementById('new-ex-unit').value;

    if (!name) { Sounds.error(); Toast.error('Escribe un nombre para el ejercicio'); return; }

    state.exercises.push({
      id: Utils.uid(), name, group, notes: '', collapsed: false,
      sets: Array.from({ length: sets }, () => ({ repsTarget: reps, reps: '', kg: '', unit, kind: _defaultKind(name), done: false })),
    });

    document.querySelector('.modal-overlay')?.remove();
    Sounds.serieDone();
    Toast.success(`"${name}" agregado a la sesión`);
    _rerender();
  }

  // ── TIMER GENERAL (corre SIEMPRE mientras la sesión esté activa,
  //    sin importar en qué página esté el usuario) ──────────────────────
  function _tick() {
    if (!state?.startedAt) return;
    const secs = Math.floor((Date.now() - state.startedAt) / 1000);
    const formatted = Utils.formatTime(secs);

    // Actualiza el reloj si estamos viendo la sesión
    const el = document.getElementById('elapsed-time');
    if (el) el.textContent = formatted;

    // Actualiza siempre la barra flotante (visible cuando NO estamos en workout)
    _renderFloatingBar();
  }

  // ── BARRA FLOTANTE (sesión corriendo en background) ───────────────────
  function _renderFloatingBar() {
    const bar = document.getElementById('floating-session-bar');
    if (!bar) return;

    const shouldShow = state && state.started && !state.finished && Router.current() !== 'workout';
    if (!shouldShow) {
      // No pisar la barra de Cardio si esa está activa
      if (!(typeof Cardio !== 'undefined' && Cardio.hasActiveSession?.())) bar.style.display = 'none';
      return;
    }

    const secs = Math.floor((Date.now() - state.startedAt) / 1000);
    const totalSets = state.exercises.reduce((s, e) => s + e.sets.length, 0);
    const doneSets  = state.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
    const restBadge = state.rest.running
      ? `<span style="color:var(--warning)">⏱ descanso ${state.rest.remaining}s</span>`
      : `<span style="color:var(--text-3)">${doneSets}/${totalSets} series</span>`;

    bar.style.display = 'flex';
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer" onclick="Router.navigate('workout')">
        <span class="animate-pulse-glow" style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${state.planName}</div>
          <div style="font-size:10px;display:flex;gap:6px">
            <span style="font-variant-numeric:tabular-nums;color:var(--accent)">${Utils.formatTime(secs)}</span>
            ${restBadge}
          </div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="Router.navigate('workout')">Volver →</button>
    `;
  }

  // Llamado por el Router cada vez que cambia de página
  function onRouteChange() { _renderFloatingBar(); }

  // ── CANCELAR SESIÓN (sin guardar) ─────────────────────────────────────
  function discardSession() {
    if (!confirm('¿Cancelar la sesión sin guardar? Se perderá todo el progreso.')) return;
    _fullCleanup();
    Sounds.error();
    Toast.warning('Sesión cancelada');
    Router.navigate('dashboard');
  }

  function _fullCleanup() {
    clearInterval(elapsedInterval);
    clearInterval(restInterval);
    WakeLock.release();
    state = null;
    const bar = document.getElementById('floating-session-bar');
    if (bar) bar.style.display = 'none';
  }

  // Cleanup "suave" al navegar — NO mata la sesión, solo se llama al salir de la app
  function cleanup() {
    // Intencionalmente vacío: la sesión debe seguir corriendo en background.
    // Solo se limpia con discardSession() o finishSession().
  }

  // ── FINALIZAR SESIÓN ─────────────────────────────────────────────────
  async function finishSession() {
    const totalSets = state.exercises.reduce((s, e) => s + e.sets.length, 0);
    const doneSets  = state.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);

    if (doneSets === 0) {
      if (!confirm('No has marcado ninguna serie como completada. ¿Terminar de todas formas?')) return;
    }

    _renderStatsForm(doneSets, totalSets);
  }

  // ── CAPTURA DE DATOS DEL RELOJ (calorías, FC, esfuerzo) ────────────────
  // Se pide ANTES de guardar — así el registro queda completo desde el
  // inicio y el dashboard no muestra "0 kcal" ni "—/10" de esfuerzo.
  function _renderStatsForm(doneSets, totalSets) {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:480px;margin:0 auto">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:48px;margin-bottom:8px">⌚</div>
          <h2 style="font-size:18px;font-weight:800">Datos del Apple Watch</h2>
          <p style="color:var(--text-3);font-size:12px;margin-top:4px">Últimos datos antes de guardar — opcional pero recomendado</p>
        </div>

        <div class="card">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Calorías activas</label>
                <input class="input" type="number" id="ws-kcalact" placeholder="kcal">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Calorías totales</label>
                <input class="input" type="number" id="ws-kcaltot" placeholder="kcal">
              </div>
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">FC promedio</label>
                <input class="input" type="number" id="ws-fcavg" placeholder="bpm">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">FC pico</label>
                <input class="input" type="number" id="ws-fcpeak" placeholder="bpm">
              </div>
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Esfuerzo (1-10)</label>
                <input class="input" type="number" id="ws-effort" min="1" max="10" placeholder="7">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Peso corporal (opcional)</label>
                <input class="input" type="number" step="0.1" id="ws-weight" placeholder="kg">
              </div>
            </div>
          </div>
        </div>

        <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:10px" onclick="Workout.toggleAdvancedStats()">
          <span id="ws-advanced-arrow">▸</span> Zonas de FC y recuperación (opcional)
        </button>

        <div id="ws-advanced-block" style="display:none">
          <div class="card" style="margin-top:10px">
            <div style="font-size:11px;color:var(--text-3);margin-bottom:12px">
              Del reloj: pantalla "Heart Rate" del entrenamiento → tiempo en cada zona y FC post-esfuerzo a 0/1/2 min.
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">FC mínima</label>
                <input class="input" type="number" id="ws-fcmin" placeholder="bpm">
              </div>
            </div>
            <div style="font-size:10px;color:var(--text-3);margin:10px 0 6px">Tiempo en cada zona (mm:ss)</div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 1</label>
                <input class="input" id="ws-z1" placeholder="45:35">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 2</label>
                <input class="input" id="ws-z2" placeholder="01:36">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 3</label>
                <input class="input" id="ws-z3" placeholder="00:15">
              </div>
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 4</label>
                <input class="input" id="ws-z4" placeholder="00:00">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 5</label>
                <input class="input" id="ws-z5" placeholder="00:00">
              </div>
            </div>
            <div style="font-size:10px;color:var(--text-3);margin:10px 0 6px">Recuperación post-esfuerzo</div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Al terminar</label>
                <input class="input" type="number" id="ws-fcpost0" placeholder="bpm">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">1 min después</label>
                <input class="input" type="number" id="ws-fcpost1" placeholder="bpm">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">2 min después</label>
                <input class="input" type="number" id="ws-fcpost2" placeholder="bpm">
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-secondary" style="flex:1" id="ws-skip-btn" onclick="Workout.saveFinalSession(true, ${doneSets}, ${totalSets})">Omitir</button>
          <button class="btn btn-primary" style="flex:1" id="ws-save-btn" onclick="Workout.saveFinalSession(false, ${doneSets}, ${totalSets})">Guardar sesión</button>
        </div>
      </div>`;
  }

  function toggleAdvancedStats() {
    const block = document.getElementById('ws-advanced-block');
    const arrow = document.getElementById('ws-advanced-arrow');
    if (!block) return;
    const showing = block.style.display !== 'none';
    block.style.display = showing ? 'none' : 'block';
    if (arrow) arrow.textContent = showing ? '▸' : '▾';
    Sounds.click();
  }

  async function saveFinalSession(skip, doneSets, totalSets) {
    const btn = document.getElementById(skip ? 'ws-skip-btn' : 'ws-save-btn');
    const otherBtn = document.getElementById(skip ? 'ws-save-btn' : 'ws-skip-btn');
    if (btn?.disabled) return; // evita doble click / doble guardado
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }
    if (otherBtn) otherBtn.disabled = true;

    const val = id => document.getElementById(id)?.value || '';
    const stats = skip ? {} : {
      kcalAct: val('ws-kcalact'), kcalTot: val('ws-kcaltot'),
      fcAvg: val('ws-fcavg'), fcPeak: val('ws-fcpeak'), fcMin: val('ws-fcmin'),
      effort: val('ws-effort'), weight: val('ws-weight'),
      zone1: val('ws-z1'), zone2: val('ws-z2'), zone3: val('ws-z3'), zone4: val('ws-z4'), zone5: val('ws-z5'),
      fcPost0: val('ws-fcpost0'), fcPost1: val('ws-fcpost1'), fcPost2: val('ws-fcpost2'),
    };

    const durationMin = state.startedAt ? Math.round((Date.now() - state.startedAt) / 60000) : 0;
    const volume = state.exercises.reduce((sum, ex) =>
      sum + ex.sets.reduce((s, set) => {
        // Asistencia no cuenta como volumen movido — es peso que la
        // máquina te QUITA, no que mueves. Igual que peso corporal/tiempo.
        if (set.unit === 'seg' || set.unit === 'PC' || set.kind === 'assist' || !set.done) return s;
        const kg = set.unit === 'lbs' ? Utils.lbsToKg(parseFloat(set.kg) || 0) : (parseFloat(set.kg) || 0);
        return s + (parseFloat(set.reps) || 0) * kg;
      }, 0), 0);

    const payload = {
      date: Utils.today(),
      day: state.dayName,
      type: 'Fuerza',
      week: CONFIG.CURRENT_PHASE.currentWeek,
      phase: CONFIG.CURRENT_PHASE.name,
      duration: durationMin,
      volume: Math.round(volume),
      notes: state.planName,
      kcalAct: stats.kcalAct || '', kcalTot: stats.kcalTot || '',
      fcAvg: stats.fcAvg || '', fcPeak: stats.fcPeak || '', fcMin: stats.fcMin || '',
      effort: stats.effort || '', weight: stats.weight || '',
      zone1: stats.zone1 || '', zone2: stats.zone2 || '', zone3: stats.zone3 || '',
      zone4: stats.zone4 || '', zone5: stats.zone5 || '',
      fcPost0: stats.fcPost0 || '', fcPost1: stats.fcPost1 || '', fcPost2: stats.fcPost2 || '',
      exercises: state.exercises.map(ex => ({
        name: ex.name, group: ex.group,
        sets: ex.sets.filter(s => s.done).map(s => ({
          repsReal: s.reps, kg: s.kg, unit: s.unit, kind: s.kind, repsObj: s.repsTarget
        }))
      })).filter(ex => ex.sets.length > 0),
    };

    try {
      const result = await API.saveSession(payload);
      API.clearCache();
      state.finished = true;
      _fullCleanup();

      if (result.queued) {
        Sounds.click(); Haptics.medium();
        _showSummary(payload, doneSets, totalSets, true);
        Toast.warning('Sin conexión — guardado localmente. Se sincronizará solo.');
      } else {
        Sounds.sessionDone(); Haptics.done();
        // Resumen INMEDIATO — la celebración de récord (si aplica) se
        // dispara encima sin bloquear ni retrasar la pantalla de resumen.
        _showSummary(payload, doneSets, totalSets, false);
        RecordCelebration.checkStrength(payload);
      }
    } catch(err) {
      if (btn) { btn.disabled = false; btn.innerHTML = skip ? 'Omitir' : 'Guardar sesión'; }
      if (otherBtn) otherBtn.disabled = false;
      Sounds.error();
      Toast.error('Error al guardar. Revisa la conexión con el backend.');
      console.error(err);
    }
  }

  function _showSummary(payload, doneSets, totalSets, queued) {
    const container = document.getElementById('page-content');
    container.innerHTML = `
      <div style="max-width:480px;margin:60px auto;text-align:center" class="animate-bounce-in">
        <div style="font-size:64px;margin-bottom:16px">${queued ? '📥' : '🎉'}</div>
        <h2 style="font-size:22px;font-weight:800;margin-bottom:6px">${queued ? 'Guardado localmente' : '¡Sesión completada!'}</h2>
        <p style="color:var(--text-3);font-size:13px;margin-bottom:${queued ? '8px' : '28px'}">${payload.notes} · ${Utils.formatDuration(payload.duration)}</p>
        ${queued ? `<p style="color:var(--warning);font-size:11px;margin-bottom:28px">⏳ Se sincronizará con tu Sheet automáticamente cuando vuelva la conexión</p>` : ''}

        <div class="grid-2" style="margin-bottom:28px">
          <div class="metric-card">
            <div class="metric-label">Series completadas</div>
            <div class="metric-value accent">${doneSets}<span class="metric-unit">/${totalSets}</span></div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Volumen total</div>
            <div class="metric-value" style="color:var(--purple-light)">${Utils.formatNum(payload.volume)}<span class="metric-unit">kg</span></div>
          </div>
          ${payload.kcalAct ? `
          <div class="metric-card">
            <div class="metric-label">Calorías activas</div>
            <div class="metric-value" style="color:var(--warning)">${payload.kcalAct}<span class="metric-unit">kcal</span></div>
          </div>` : ''}
          ${payload.fcAvg ? `
          <div class="metric-card">
            <div class="metric-label">FC promedio</div>
            <div class="metric-value" style="color:var(--danger)">${payload.fcAvg}<span class="metric-unit">bpm</span></div>
          </div>` : ''}
        </div>

        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" style="flex:1" onclick="Router.navigate('history')">Ver bitácora</button>
          <button class="btn btn-primary" style="flex:1" onclick="Router.navigate('dashboard')">Ir al Dashboard</button>
        </div>
      </div>`;
  }

  return {
    init, selectDay, backToPicker, startSession, toggleCollapse, updateSet, changeUnit, setKind, refreshKgHint, toggleSetDone, addSet,
    removeExercise, addExercise, confirmAddExercise, startRest, addRestTime,
    skipRest, customRest, finishSession, saveFinalSession, toggleAdvancedStats, discardSession, cleanup, onRouteChange,
    hasActiveSession: () => !!(state && state.started && !state.finished),
  };
})();

function initWorkout(container) { Workout.init(container); }
