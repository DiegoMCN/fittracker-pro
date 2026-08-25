// ═══════════════════════════════════════════
// CARDIO MODULE — Timer HIT / Sprint / Zona 2
// ═══════════════════════════════════════════

const Cardio = (() => {

  let state = null;
  let tickInterval = null;

  const EFFORT_COLOR = { easy: 'var(--z2)', moderate: 'var(--z3)', max: 'var(--z5)', z2: 'var(--z2)' };
  const EFFORT_LABEL = { easy: 'Suave', moderate: 'Moderado', max: 'MÁXIMO', z2: 'Zona 2' };

  function _freshState(protocolKey) {
    const protocol = CONFIG.HIT_PROTOCOLS[protocolKey];
    return {
      protocolKey,
      protocol,
      started: false,
      finished: false,
      startedAt: null,
      phaseIdx: 0,
      phaseRemaining: protocol.phases[0].duration,
      paused: false,
      // Datos manuales que Diego captura post-sesión (desde su Apple Watch)
      manualStats: { fcAvg:'', fcPeak:'', fcPost1:'', fcPost2:'', cadAvg:'', cadPeak:'', velMax:'', distance:'' },
    };
  }

  // ── INIT ──────────────────────────────────────────────────────────────
  function init(container) {
    if (state && state.started && !state.finished) { _renderActive(); return; }
    _renderPicker(container);
  }

  function _renderPicker(container) {
    const today = Utils.todayDayNum();
    container.innerHTML = `
      <div style="max-width:640px;margin:0 auto">
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <div>
              <div class="card-title">¿Qué protocolo corres hoy?</div>
              <div class="card-subtitle">Timer con fases automáticas, sonido y vibración en cada transición</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${Object.entries(CONFIG.HIT_PROTOCOLS).map(([key, p]) => {
              const isToday = p.day === today;
              const totalMin = Math.round(p.phases.reduce((s,ph) => s + ph.duration, 0) / 60);
              const maxEffort = p.phases.some(ph => ph.effort === 'max') ? 'max' : p.phases.some(ph => ph.effort === 'z2') ? 'z2' : 'moderate';
              return `
              <div onclick="Cardio.selectProtocol('${key}')" style="
                display:flex;align-items:center;gap:14px;padding:16px;border-radius:12px;cursor:pointer;
                background:${isToday ? 'var(--accent-glow)' : 'var(--bg-input)'};
                border:1px solid ${isToday ? 'var(--border-accent)' : 'var(--border)'};
                transition:all 0.15s"
                onmouseenter="this.style.borderColor='var(--text-4)'"
                onmouseleave="this.style.borderColor='${isToday ? 'var(--border-accent)' : 'var(--border)'}'">
                <div style="width:44px;height:44px;border-radius:10px;background:${EFFORT_COLOR[maxEffort]}22;
                  display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">
                  ${maxEffort === 'max' ? '🔥' : maxEffort === 'z2' ? '🧘' : '⚡'}
                </div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:14px">${p.name}</div>
                  <div style="font-size:11px;color:var(--text-3)">${p.phases.length} fases · ~${totalMin} min total</div>
                </div>
                ${isToday ? '<span style="font-size:10px;background:var(--accent);color:var(--bg-primary);padding:2px 8px;border-radius:99px;font-weight:700">HOY</span>' : ''}
                <span style="color:var(--text-4)">→</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <button class="btn btn-secondary" style="width:100%" onclick="Cardio.selectProtocol('libre')">
          ⏱ Cronómetro libre (sin protocolo)
        </button>
      </div>`;
  }

  function selectProtocol(key) {
    Sounds.click();
    if (key === 'libre') {
      CONFIG.HIT_PROTOCOLS['libre'] = CONFIG.HIT_PROTOCOLS['libre'] || {
        name: 'Cronómetro libre', day: null,
        phases: [{ duration: 999999, speed: '-', effort: 'moderate', label: 'Corriendo...' }]
      };
    }
    state = _freshState(key);
    _renderPreview();
  }

  function _renderPreview() {
    const container = document.getElementById('page-content');
    if (!container) return;
    const p = state.protocol;
    const totalMin = Math.round(p.phases.reduce((s,ph) => s + ph.duration, 0) / 60);

    container.innerHTML = `
      <div style="max-width:600px;margin:0 auto">
        <div class="card" style="margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div>
              <div style="font-weight:700;font-size:17px">${p.name}</div>
              <div style="font-size:12px;color:var(--text-3);margin-top:2px">${p.phases.length} fases · ~${totalMin} min · inicio manual</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Cardio.backToPicker()">← Cambiar</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto">
            ${p.phases.map((ph, i) => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-input);border-radius:8px">
                <div style="width:22px;height:22px;border-radius:6px;background:${EFFORT_COLOR[ph.effort]}22;
                  color:${EFFORT_COLOR[ph.effort]};display:flex;align-items:center;justify-content:center;
                  font-size:10px;font-weight:700;flex-shrink:0">${i+1}</div>
                <span style="font-size:12px;flex:1">${ph.label}</span>
                <span style="font-size:11px;color:${EFFORT_COLOR[ph.effort]};font-weight:600">${ph.speed !== '-' ? ph.speed + ' km/h' : ''}</span>
                <span style="font-size:11px;color:var(--text-3);min-width:40px;text-align:right">${Utils.formatTime(ph.duration)}</span>
              </div>`).join('')}
          </div>
        </div>

        <button class="btn btn-primary btn-lg animate-pulse-glow" style="width:100%" onclick="Cardio.startProtocol()">
          ⚡ Iniciar Protocolo
        </button>
      </div>`;
  }

  function backToPicker() {
    Sounds.click();
    state = null;
    _renderPicker(document.getElementById('page-content'));
  }

  // ── INICIO ────────────────────────────────────────────────────────────
  function startProtocol() {
    Sounds.sessionDone(); Haptics.success();
    state.started = true;
    state.startedAt = Date.now();
    // Hora real a la que debe terminar la fase actual — igual que el
    // timer de descanso de Fuerza, para sobrevivir a la pantalla bloqueada.
    state.phaseEndAt = Date.now() + state.protocol.phases[0].duration * 1000;
    WakeLock.request();
    Sounds.hitPhase(state.protocol.phases[0].effort);
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(_tick, 1000);
    document.addEventListener('visibilitychange', _onCardioVisibilityChange);
    _renderActive();
  }

  // Si el navegador suspendió el setInterval (pantalla bloqueada), esto
  // se dispara apenas vuelve a estar visible y recalcula de inmediato.
  function _onCardioVisibilityChange() {
    if (document.visibilityState === 'visible' && state && state.started && !state.paused && !state.finished) _tick();
  }

  // ── LOOP PRINCIPAL ────────────────────────────────────────────────────
  function _tick() {
    if (!state || !state.started || state.finished || state.paused) return;

    const phaseBefore = state.phaseIdx;
    _advancePhases();
    if (!state || state.finished) return; // _advancePhases pudo haber completado el protocolo

    const phaseChanged = state.phaseIdx !== phaseBefore;

    if (Router.current() === 'cardio') {
      if (phaseChanged) _renderActive();
      else _updateActiveUI();
    }
    _renderFloatingBar();
  }

  // Consume el tiempo real transcurrido desde phaseEndAt, avanzando
  // cuantas fases haga falta — así si la pantalla estuvo bloqueada
  // varios minutos, se pone al día de una vez en vez de quedarse
  // "congelado" en la fase de cuando se bloqueó.
  function _advancePhases() {
    while (true) {
      const remaining = Math.ceil((state.phaseEndAt - Date.now()) / 1000);
      if (remaining > 0) {
        if (remaining === 3 && state.phaseRemaining > 3) Sounds.restWarning();
        state.phaseRemaining = remaining;
        return;
      }
      const isLast = state.phaseIdx >= state.protocol.phases.length - 1;
      if (isLast) { _completeProtocol(); return; }
      state.phaseIdx++;
      const nextPhase = state.protocol.phases[state.phaseIdx];
      state.phaseEndAt += nextPhase.duration * 1000;
      state.phaseRemaining = nextPhase.duration;
      Sounds.hitPhase(nextPhase.effort);
      Haptics.medium();
      if (Router.current() === 'cardio') Toast.success(`→ ${nextPhase.label}`, 2000);
    }
  }

  function _completeProtocol() {
    clearInterval(tickInterval);
    document.removeEventListener('visibilitychange', _onCardioVisibilityChange);
    state.finished = true;
    Sounds.sessionDone(); Haptics.done();
    WakeLock.release();
    _renderStatsForm();
  }

  // ── RENDER SESIÓN ACTIVA ─────────────────────────────────────────────
  function _renderActive() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const p = state.protocol;
    const phase = p.phases[state.phaseIdx];
    const totalElapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const totalDuration = p.phases.reduce((s,ph) => s + ph.duration, 0);
    const overallPct = Math.min(100, Math.round((totalElapsed / totalDuration) * 100));
    const phasePct = Math.round(((phase.duration - state.phaseRemaining) / phase.duration) * 100);
    const color = EFFORT_COLOR[phase.effort];

    const circumference = 2 * Math.PI * 90;
    const offset = circumference - (phasePct / 100) * circumference;

    container.innerHTML = `
      <div style="max-width:480px;margin:0 auto;text-align:center">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div style="text-align:left">
            <div style="font-weight:700;font-size:14px">${p.name}</div>
            <div style="font-size:11px;color:var(--text-3)">Fase ${state.phaseIdx + 1}/${p.phases.length} · ${WakeLock.isActive() ? '🔓 pantalla activa' : ''}</div>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="Cardio.discardSession()" title="Cancelar">🗑</button>
        </div>

        <!-- Círculo grande de fase actual -->
        <div style="position:relative;width:220px;height:220px;margin:0 auto 20px">
          <svg width="220" height="220" style="transform:rotate(-90deg)">
            <circle cx="110" cy="110" r="90" stroke="var(--bg-input)" stroke-width="10" fill="none"/>
            <circle cx="110" cy="110" r="90" stroke="${color}" stroke-width="10" fill="none"
              stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
              style="transition:stroke-dashoffset 1s linear;filter:drop-shadow(0 0 10px ${color})"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div id="phase-time" style="font-size:42px;font-weight:800;color:${color};font-variant-numeric:tabular-nums;line-height:1">
              ${Utils.formatTime(state.phaseRemaining)}
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-top:6px;text-transform:uppercase;letter-spacing:.05em">
              ${EFFORT_LABEL[phase.effort]}
            </div>
          </div>
        </div>

        <div id="phase-label" class="card" style="margin-bottom:16px;border-color:${color}44">
          <div style="font-weight:700;font-size:16px;color:${color}">${phase.label}</div>
          ${phase.speed !== '-' ? `<div style="font-size:13px;color:var(--text-3);margin-top:4px">Velocidad objetivo: ${phase.speed} km/h</div>` : ''}
        </div>

        <!-- Progreso total -->
        <div style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:6px">
            <span>Progreso total</span>
            <span id="total-elapsed" style="font-variant-numeric:tabular-nums">${Utils.formatTime(totalElapsed)}</span>
          </div>
          <div class="progress-bar">
            <div id="total-progress" class="progress-fill" style="width:${overallPct}%"></div>
          </div>
        </div>

        <!-- Mini timeline de fases -->
        <div style="display:flex;gap:3px;margin-bottom:24px">
          ${p.phases.map((ph, i) => `
            <div style="flex:${ph.duration};height:6px;border-radius:3px;
              background:${i < state.phaseIdx ? 'var(--accent)' : i === state.phaseIdx ? EFFORT_COLOR[ph.effort] : 'var(--bg-input)'};
              opacity:${i === state.phaseIdx ? '1' : i < state.phaseIdx ? '0.6' : '0.3'}"></div>
          `).join('')}
        </div>

        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" style="flex:1" onclick="Cardio.togglePause()">${state.paused ? '▶ Reanudar' : '⏸ Pausar'}</button>
          <button class="btn btn-ghost" style="flex:1" onclick="Cardio.skipPhase()">Saltar fase →</button>
        </div>
      </div>`;

    _renderFloatingBar();
  }

  function _updateActiveUI() {
    const phase = state.protocol.phases[state.phaseIdx];
    const timeEl = document.getElementById('phase-time');
    if (!timeEl) { _renderActive(); return; }
    timeEl.textContent = Utils.formatTime(state.phaseRemaining);

    const totalElapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const totalDuration = state.protocol.phases.reduce((s,ph) => s + ph.duration, 0);
    const overallPct = Math.min(100, Math.round((totalElapsed / totalDuration) * 100));
    const totalEl = document.getElementById('total-elapsed');
    const progEl  = document.getElementById('total-progress');
    if (totalEl) totalEl.textContent = Utils.formatTime(totalElapsed);
    if (progEl)  progEl.style.width = overallPct + '%';

    // Si cambió de fase, re-render completo para actualizar círculo/color/timeline
    const circumference = 2 * Math.PI * 90;
    const phasePct = Math.round(((phase.duration - state.phaseRemaining) / phase.duration) * 100);
    const offset = circumference - (phasePct / 100) * circumference;
    const circle = document.querySelector('svg circle:nth-child(2)');
    if (circle) circle.setAttribute('stroke-dashoffset', offset);
  }

  function togglePause() {
    state.paused = !state.paused;
    Sounds.click();
    if (state.paused) {
      Toast.warning('Pausado'); WakeLock.release();
    } else {
      // Al reanudar, recalcula la hora de fin con el tiempo que quedaba
      // congelado — no sigue contando desde donde se pausó en reloj real.
      state.phaseEndAt = Date.now() + state.phaseRemaining * 1000;
      Toast.success('Reanudado'); WakeLock.request();
    }
    _renderActive();
  }

  function skipPhase() {
    Sounds.click();
    state.phaseEndAt = Date.now(); // se resuelve en el próximo tick
    Toast.show('Saltando fase...', 'info', 1200);
  }

  function discardSession() {
    if (!confirm('¿Cancelar el protocolo sin guardar?')) return;
    clearInterval(tickInterval);
    document.removeEventListener('visibilitychange', _onCardioVisibilityChange);
    WakeLock.release();
    state = null;
    const bar = document.getElementById('floating-session-bar');
    if (bar) bar.style.display = 'none';
    Sounds.error();
    Router.navigate('dashboard');
  }

  // ── BARRA FLOTANTE ────────────────────────────────────────────────────
  function _renderFloatingBar() {
    const bar = document.getElementById('floating-session-bar');
    if (!bar) return;
    const shouldShow = state && state.started && !state.finished && Router.current() !== 'cardio';
    if (!shouldShow) {
      // No pisar la barra de Workout si esa está activa
      if (!(typeof Workout !== 'undefined' && Workout.hasActiveSession?.())) bar.style.display = 'none';
      return;
    }
    const phase = state.protocol.phases[state.phaseIdx];
    const color = EFFORT_COLOR[phase.effort];

    bar.style.display = 'flex';
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer" onclick="Router.navigate('cardio')">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 8px ${color}"></span>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${phase.label}</div>
          <div style="font-size:10px;color:${color};font-variant-numeric:tabular-nums">${Utils.formatTime(state.phaseRemaining)}</div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="Router.navigate('cardio')">Volver →</button>
    `;
  }

  function onRouteChange() { _renderFloatingBar(); }
  function hasActiveSession() { return !!(state && state.started && !state.finished); }

  // ── FORMULARIO POST-SESIÓN (datos del Apple Watch) ────────────────────
  function _renderStatsForm() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:480px;margin:0 auto" class="animate-bounce-in">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:56px;margin-bottom:12px">🏁</div>
          <h2 style="font-size:20px;font-weight:800">¡Protocolo completado!</h2>
          <p style="color:var(--text-3);font-size:12px;margin-top:4px">${state.protocol.name} · ${Utils.formatDuration(Math.round((Date.now()-state.startedAt)/60000))}</p>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Datos del Apple Watch</div>
            <div class="card-subtitle">Captura lo que veas en el reloj — opcional pero recomendado</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">FC promedio</label>
                <input class="input" type="number" id="cs-fcavg" placeholder="bpm">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">FC pico</label>
                <input class="input" type="number" id="cs-fcpeak" placeholder="bpm">
              </div>
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">FC al terminar</label>
                <input class="input" type="number" id="cs-fcpost0" placeholder="bpm">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">FC post 1 min</label>
                <input class="input" type="number" id="cs-fcpost1" placeholder="bpm">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">FC post 2 min</label>
                <input class="input" type="number" id="cs-fcpost2" placeholder="bpm">
              </div>
            </div>
            <div style="font-size:10px;color:var(--text-3);margin-top:4px">Tiempo en cada zona (mm:ss) — pantalla "Heart Rate" del reloj</div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 1</label>
                <input class="input" id="cs-z1" placeholder="45:35">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 2</label>
                <input class="input" id="cs-z2" placeholder="01:36">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 3</label>
                <input class="input" id="cs-z3" placeholder="00:15">
              </div>
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 4</label>
                <input class="input" id="cs-z4" placeholder="00:00">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Zona 5</label>
                <input class="input" id="cs-z5" placeholder="00:00">
              </div>
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Cadencia prom.</label>
                <input class="input" type="number" id="cs-cadavg" placeholder="spm">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Cadencia pico</label>
                <input class="input" type="number" id="cs-cadpeak" placeholder="spm">
              </div>
            </div>
            <div class="input-row">
              <div class="input-group" style="flex:1">
                <label class="input-label">Velocidad máx</label>
                <input class="input" type="number" step="0.1" id="cs-velmax" placeholder="km/h">
              </div>
              <div class="input-group" style="flex:1">
                <label class="input-label">Distancia</label>
                <input class="input" type="number" step="0.01" id="cs-distance" placeholder="km">
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">Notas</label>
              <input class="input" id="cs-notes" placeholder="Ej. Se sintió más fácil que la semana pasada">
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-secondary" style="flex:1" id="cs-skip-btn" onclick="Cardio.skipStats()">Omitir</button>
          <button class="btn btn-primary" style="flex:1" id="cs-save-btn" onclick="Cardio.saveStats()">Guardar en Sheet</button>
        </div>
      </div>`;
  }

  function _lockButtons(activeId) {
    const skip = document.getElementById('cs-skip-btn');
    const save = document.getElementById('cs-save-btn');
    if (skip?.disabled) return false; // ya se está guardando, ignora el segundo click
    if (skip) skip.disabled = true;
    if (save) save.disabled = true;
    const active = document.getElementById(activeId);
    if (active) active.innerHTML = '⏳ Guardando...';
    return true;
  }

  function skipStats() {
    if (!_lockButtons('cs-skip-btn')) return;
    _saveCardioSession({});
  }

  function saveStats() {
    if (!_lockButtons('cs-save-btn')) return;
    const val = id => document.getElementById(id)?.value || '';
    _saveCardioSession({
      fcAvg: val('cs-fcavg'), fcPeak: val('cs-fcpeak'),
      fcPost0: val('cs-fcpost0'), fcPost1: val('cs-fcpost1'), fcPost2: val('cs-fcpost2'),
      zone1: val('cs-z1'), zone2: val('cs-z2'), zone3: val('cs-z3'), zone4: val('cs-z4'), zone5: val('cs-z5'),
      cadAvg: val('cs-cadavg'), cadPeak: val('cs-cadpeak'),
      velMax: val('cs-velmax'), distance: val('cs-distance'),
      notes: val('cs-notes'),
    });
  }

  async function _saveCardioSession(stats) {
    const duration = Math.round((Date.now() - state.startedAt) / 60000);
    // Preferimos la ventana completa 0→2min (igual que fuerza); si no
    // capturaste "FC al terminar" cae a 1→2min como antes.
    const rec2min = (stats.fcPost0 && stats.fcPost2)
      ? Math.round(stats.fcPost2 - stats.fcPost0)
      : (stats.fcPost1 && stats.fcPost2) ? Math.round(stats.fcPost2 - stats.fcPost1) : '';


    const payload = {
      date: Utils.today(),
      week: CONFIG.CURRENT_PHASE.currentWeek,
      phase: CONFIG.CURRENT_PHASE.name,
      type: state.protocol.name,
      protocol: state.protocolKey,
      duration,
      distance: stats.distance || '',
      fcAvg: stats.fcAvg || '', fcPeak: stats.fcPeak || '',
      fcPost1: stats.fcPost1 || '', fcPost2: stats.fcPost2 || '',
      rec2min,
      zone1: stats.zone1 || '', zone2: stats.zone2 || '', zone3: stats.zone3 || '',
      zone4: stats.zone4 || '', zone5: stats.zone5 || '',
      cadAvg: stats.cadAvg || '', cadPeak: stats.cadPeak || '',
      velMax: stats.velMax || '',
      notes: stats.notes || '',
    };

    // Se captura antes de limpiar state — se usa para ofrecer continuar
    // con la parte de fuerza si ese día tiene ejercicios asociados.
    const protocolDay = state?.protocol?.day;

    try {
      const result = await API.saveCardio(payload);
      API.clearCache();

      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — guardado localmente. Se sincronizará solo.');
        _showCardioSummary(payload, true, protocolDay);
      } else {
        Sounds.sessionDone(); Haptics.done();
        _showCardioSummary(payload, false, protocolDay);
        RecordCelebration.checkCardio(stats);
      }
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar. Revisa la conexión.');
      console.error(err);
      state = null;
      Router.navigate('dashboard');
      return;
    }
    state = null;
  }

  function _showCardioSummary(payload, queued, protocolDay) {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:480px;margin:60px auto;text-align:center" class="animate-bounce-in">
        <div style="font-size:64px;margin-bottom:16px">${queued ? '📥' : '🏁'}</div>
        <h2 style="font-size:22px;font-weight:800;margin-bottom:6px">${queued ? 'Guardado localmente' : '¡Cardio completado!'}</h2>
        <p style="color:var(--text-3);font-size:13px;margin-bottom:${queued ? '8px' : '28px'}">${payload.type} · ${Utils.formatDuration(payload.duration)}</p>
        ${queued ? `<p style="color:var(--warning);font-size:11px;margin-bottom:28px">⏳ Se sincronizará con tu Sheet automáticamente cuando vuelva la conexión</p>` : ''}

        <div class="grid-2" style="margin-bottom:28px">
          ${payload.distance ? `
          <div class="metric-card">
            <div class="metric-label">Distancia</div>
            <div class="metric-value" style="color:var(--info)">${payload.distance}<span class="metric-unit">km</span></div>
          </div>` : ''}
          ${payload.fcAvg ? `
          <div class="metric-card">
            <div class="metric-label">FC promedio</div>
            <div class="metric-value" style="color:var(--danger)">${payload.fcAvg}<span class="metric-unit">bpm</span></div>
          </div>` : ''}
          ${(payload.rec2min !== '' && payload.rec2min !== undefined) ? `
          <div class="metric-card">
            <div class="metric-label">Recuperación 2min</div>
            <div class="metric-value accent">${payload.rec2min}<span class="metric-unit">bpm</span></div>
          </div>` : ''}
          ${payload.cadAvg ? `
          <div class="metric-card">
            <div class="metric-label">Cadencia</div>
            <div class="metric-value" style="color:var(--purple-light)">${payload.cadAvg}<span class="metric-unit">spm</span></div>
          </div>` : ''}
        </div>

        ${(protocolDay != null && CONFIG.PLAN_EXERCISES?.[protocolDay]?.length > 0) ? `
        <button class="btn btn-primary btn-lg animate-pulse-glow" style="width:100%;margin-bottom:12px" onclick="Workout.quickStartDay(${protocolDay})">
          💪 Continuar con la parte de fuerza →
        </button>` : ''}

        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" style="flex:1" onclick="Router.navigate('history')">Ver bitácora</button>
          <button class="btn btn-primary" style="flex:1" onclick="Router.navigate('dashboard')">Ir al Dashboard</button>
        </div>
      </div>`;
  }

  return {
    init, selectProtocol, backToPicker, startProtocol, togglePause, skipPhase,
    discardSession, onRouteChange, hasActiveSession, skipStats, saveStats,
  };
})();

function initCardio(container) { Cardio.init(container); }
