// ═══════════════════════════════════════════
// SIMULADOR DE FORMA
// ═══════════════════════════════════════════
// El modelo (condición 42 días, fatiga 7 días, forma = condición − fatiga)
// lo calcula el backend con tu historial real (11_Forma.gs). Las
// SIMULACIONES corren aquí, en el teléfono, con la misma fórmula: mover
// un control redibuja todo al instante, sin esperar al servidor.
// La IA (Temach) solo se usa cuando la pides, para leer el escenario.

const Forma = (() => {
  const HORIZON = 56;                      // 8 semanas de proyección
  const HISTORY_SHOWN = 42;                // 6 semanas hacia atrás en la gráfica
  const TESTDAY_KEY = 'fittracker_form_testday';
  const GAUGE_MIN = -60, GAUGE_MAX = 45;   // rango visible del medidor (% de condición)
  const PRESETS = {
    igual:      { label: 'Seguir igual',       icon: '➡️', loadPct: 100, weeks: 4 },
    descarga:   { label: 'Semana de descarga', icon: '🛌', loadPct: 55,  weeks: 1 },
    subir:      { label: 'Subir volumen',      icon: '📈', loadPct: 120, weeks: 3 },
    duro:       { label: 'Bloque duro',        icon: '🔥', loadPct: 135, weeks: 2 },
    vacaciones: { label: 'Vacaciones',         icon: '🏖️', loadPct: 0,   weeks: 1 },
  };
  const AI_MSGS = ['Leyendo tu curva…', 'Revisando tus metas del winter arc…', 'Comparando con tu carga reciente…', 'Pensando qué haría yo en tu lugar…'];

  const AI_KEY = 'fittracker_form_ai';
  let _m = null, _chart = null, _planChart = null, _mode = 'forma', _sc = { preset: 'igual', loadPct: 100, weeks: 4 }, _plan = null, _ai = null, _aiBusy = false, _raf = null;

  // ── utilidades ──────────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const zoneOf = (pct) => _m.zones.find(z => pct >= z.min && pct < z.max) || _m.zones[2];
  const esc = (s) => Utils.escapeHtml(s);
  const dayName = (s) => new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  const signed = (n) => (n > 0 ? '+' : '') + n;

  // ── el modelo (misma fórmula que el backend) ────────────────────
  // factorFn(i) = multiplicador de tu semana habitual el día i (0 = mañana).
  // La forma de cada día es la de la MAÑANA (antes de entrenar).
  function simulate(factorFn) {
    let ctl = _m.state.fitness, atl = _m.state.fatigue;
    const out = [];
    for (let i = 0; i < HORIZON; i++) {
      const date = addDays(_m.today, i + 1);
      const wd = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
      const formPct = ctl > 0.5 ? Math.round((ctl - atl) / ctl * 100) : 0;
      const load = _m.pattern[wd] * factorFn(i);
      ctl += (load - ctl) / _m.tau.fitness;
      atl += (load - atl) / _m.tau.fatigue;
      out.push({ date, load, fitness: ctl, fatigue: atl, formPct });
    }
    return out;
  }
  const scenarioFn = (sc) => (i) => i < sc.weeks * 7 ? sc.loadPct / 100 : 1;

  function summarize(sim, sc) {
    const endIdx = Math.min(sc.weeks * 7, HORIZON) - 1;
    const end = sim[endIdx];
    const minDay = sim.slice(0, endIdx + 1).reduce((a, d) => d.formPct < a.formPct ? d : a, sim[0]);
    const best = sim.find(d => d.formPct >= 5 && d.formPct < 30) || null; // el PRÓXIMO día en que estarás fresco
    return { end, endIdx, minDay, best, fitnessChange: Math.round((end.fitness / _m.state.fitness - 1) * 100) };
  }

  // Busca entre cientos de planes el que te deja FRESCO el día de prueba
  // con la MAYOR condición posible, con tres reglas:
  //  • construir hasta 130% de tu semana habitual (más saldría de la zona
  //    sana del ACWR) y SIN días de sobrecarga en el camino;
  //  • la descarga final ("taper") de 7 a 14 días si hay tiempo, bajando
  //    40–60% el volumen — el rango que mejor funciona según la evidencia
  //    sobre tapers (se baja volumen; intensidad y frecuencia se mantienen);
  //  • con menos de 2 semanas, la descarga se acorta lo necesario.
  function planPeak(target) {
    const idx = daysBetween(_m.today, target) - 1;
    if (idx < 2 || idx >= HORIZON) return null;
    const minTaper = idx >= 14 ? 7 : Math.min(3, idx);
    let best = null;
    for (let m = 0.9; m <= 1.301; m += 0.05) {
      for (let taper = minTaper; taper <= Math.min(14, idx); taper++) {
        for (let tf = 0.4; tf <= 0.601; tf += 0.05) {
          const fn = (i) => i < idx - taper ? m : (i < idx ? tf : 1);
          const sim = simulate(fn), d = sim[idx];
          const inPeak = d.formPct >= 5 && d.formPct < 30;
          const overloadDays = sim.slice(0, idx).filter(x => x.formPct < -45).length;
          const score = (inPeak ? d.fitness : d.fitness - 1000 - Math.abs(d.formPct - 15) * 10) - overloadDays * 200;
          if (!best || score > best.score) best = { score, build: Math.round(m * 100), taper, taperPct: Math.round(tf * 100), day: d, idx, sim, inPeak };
        }
      }
    }
    return best;
  }

  // ── pantalla ────────────────────────────────────────────────────
  async function init(container) {
    container.innerHTML = `<div style="max-width:760px;margin:0 auto">
      ${[260, 300, 240].map(h => `<div class="skeleton" style="height:${h}px;border-radius:var(--card-radius);margin-bottom:16px"></div>`).join('')}</div>`;
    try { _m = await API.getFormModel(); } catch(e) { _m = null; }
    if (!_m || !_m.history || !_m.history.length || !(_m.state && _m.state.fitness > 0)) {
      container.innerHTML = `<div class="card" style="max-width:560px;margin:0 auto;text-align:center;padding:32px 20px">
        <div style="font-size:40px;margin-bottom:8px">🔮</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">Todavía no hay suficientes datos</div>
        <div style="font-size:12px;color:var(--text-3);line-height:1.6">El simulador necesita al menos un par de semanas de sesiones con su esfuerzo registrado para calcular tu condición y tu fatiga.</div></div>`;
      return;
    }
    // El plan guardado se vuelve a calcular con tus datos de HOY. Si el día ya
    // pasó o ya no hay tiempo de planear, se quita solo (no se queda pegado).
    _plan = null;
    try {
      const saved = localStorage.getItem(TESTDAY_KEY);
      if (saved) {
        const dd = daysBetween(_m.today, saved);
        if (dd >= 3 && dd <= HORIZON) _plan = planPeak(saved);
        if (!_plan) localStorage.removeItem(TESTDAY_KEY);
      }
    } catch(e) {}
    // La lectura del Temach se queda hasta que pidas otra.
    // El navegador es solo la copia rápida; la buena vive en el Sheet,
    // así que se ve igual desde cualquier dispositivo. Si el Sheet trae
    // algo más reciente que lo guardado aquí, manda el Sheet.
    try { _ai = JSON.parse(localStorage.getItem(AI_KEY) || 'null'); } catch(e) { _ai = null; }
    try {
      const r = await API.getFormAdvice(1);
      const s = r && r.advice && r.advice[0];
      if (s && s.text && (!_ai || Date.parse(s.at || 0) > (_ai.at || 0))) {
        _ai = { text: s.text, at: Date.parse(s.at) || Date.now(), name: s.scenario || '', day: s.date };
      }
    } catch(e) { /* sin conexión: se queda la copia del navegador */ }
    render(container);
  }

  function render(container) {
    const c = _m.current, z = zoneOf(c.formPct);
    const minDate = addDays(_m.today, 7), maxDate = addDays(_m.today, HORIZON);
    let savedDate = ''; try { savedDate = localStorage.getItem(TESTDAY_KEY) || ''; } catch(e) {}
    container.innerHTML = `
    <div style="max-width:760px;margin:0 auto;padding-bottom:40px">

      <!-- 1. TU FORMA HOY -->
      <div class="card section" style="text-align:center;overflow:hidden;position:relative">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 0%, ${z.color}22, transparent 60%);pointer-events:none"></div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Tu forma hoy</div>
        ${_gaugeSVG()}
        <div id="fm-zone" style="font-size:18px;font-weight:800;color:${z.color};margin-top:-6px">${esc(z.label)}</div>
        <div style="font-size:12px;color:var(--text-3);max-width:420px;margin:6px auto ${_m.testDue ? '10px' : '16px'};line-height:1.5">${esc(z.desc)}</div>
        ${_m.testDue ? `<button class="btn btn-sm" style="margin-bottom:14px;background:rgba(0,255,135,0.12);color:var(--accent);border:1px solid rgba(0,255,135,0.35)" onclick="Forma.goToTest()">🧪 Te toca tu prueba quincenal</button>` : ''}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${_stat('fm-fit', 'Condición', `Lo que has construido (${_m.tau.fitness} días)`, '#00FF87')}
          ${_stat('fm-fat', 'Fatiga', `Lo que traes encima (${_m.tau.fatigue} días)`, '#A78BFA')}
          ${_stat('fm-form', 'Forma', 'Condición − fatiga', z.color, '%')}
        </div>
        ${_m.building ? `<div style="margin-top:14px;font-size:11px;color:var(--warning);line-height:1.5">⏳ Calibrando: llevas ${_m.daysOfData} días de datos. Tu condición se estabiliza hacia los 63 días — hasta entonces, toma las cifras como tendencia.</div>` : ''}
      </div>

      <!-- 2. LA CURVA -->
      <div class="card section">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div><div class="card-title">📈 Tu curva</div><div class="card-subtitle">6 semanas atrás y 8 hacia adelante</div></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ${_mode === 'forma' ? 'btn-primary' : 'btn-secondary'}" onclick="Forma.setMode('forma')">Forma</button>
            <button class="btn btn-sm ${_mode === 'cf' ? 'btn-primary' : 'btn-secondary'}" onclick="Forma.setMode('cf')">Condición y fatiga</button>
            <button class="btn btn-sm ${_mode === 'bt' ? 'btn-primary' : 'btn-secondary'}" onclick="Forma.setMode('bt')">Proyectado vs. real</button>
          </div>
        </div>
        <div style="position:relative;height:230px"><canvas id="fm-chart"></canvas></div>
        <div id="fm-legend" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:10px;font-size:10px;color:var(--text-3)"></div>
        <div id="fm-bt-note" style="display:none;margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-input);font-size:12px;line-height:1.6;color:var(--text-2)"></div>
      </div>

      <!-- 3. ¿QUÉ PASA SI…? -->
      <div class="card section">
        <div class="card-header"><div><div class="card-title">🔮 ¿Qué pasa si…?</div><div class="card-subtitle">Toca un escenario o ajústalo a mano — la curva se redibuja al instante</div></div></div>
        <div id="fm-presets" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:14px;-webkit-overflow-scrolling:touch">
          ${Object.entries(PRESETS).map(([k, p]) => `
            <button class="btn btn-sm ${_sc.preset === k ? 'btn-primary' : 'btn-secondary'}" data-preset="${k}" style="flex-shrink:0;white-space:nowrap" onclick="Forma.setPreset('${k}')">${p.icon} ${esc(p.label)}</button>`).join('')}
        </div>
        <div class="input-group">
          <label class="input-label">Carga de entrenamiento <span id="fm-load-val" style="color:var(--text-3)">${_loadLabel(_sc.loadPct)}</span></label>
          <input type="range" min="0" max="150" step="5" value="${_sc.loadPct}" oninput="Forma.setLoad(this.value)">
        </div>
        <div class="input-group" style="margin-top:6px">
          <label class="input-label">Durante <span id="fm-weeks-val" style="color:var(--text-3)">${_sc.weeks} semana${_sc.weeks === 1 ? '' : 's'}</span> <span style="color:var(--text-4)">— después regresas a tu semana habitual</span></label>
          <input type="range" min="1" max="8" step="1" value="${_sc.weeks}" oninput="Forma.setWeeks(this.value)">
        </div>
        <div id="fm-results" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px"></div>
        <div id="fm-warning"></div>
      </div>

      <!-- 4. DÍA DE PRUEBA -->
      <div class="card section">
        <div class="card-header"><div><div class="card-title">🎯 Mi día de prueba</div><div class="card-subtitle">Elige el día en que quieres intentar tu récord — te digo cómo llegar en tu mejor forma</div></div></div>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div class="input-group" style="flex:1;min-width:160px;margin:0">
            <label class="input-label">Fecha (entre 1 y 8 semanas)</label>
            <input class="input" type="date" id="fm-testday" min="${minDate}" max="${maxDate}" value="${esc(savedDate)}">
          </div>
          <button class="btn btn-primary" onclick="Forma.planTestDay()">⚡ Planear mi pico</button>
        </div>
        <div id="fm-plan"></div>
      </div>

      <!-- 4b. PRUEBA QUINCENAL -->
      ${_testCardHTML()}

      <!-- 4c. ¿COMO LA POBLACIÓN? -->
      ${_populationHTML()}

      <!-- 5. LA LECTURA DEL TEMACH -->
      <div class="card section">
        <div class="card-header"><div><div class="card-title">🧠 Lo que dice el Temach</div><div class="card-subtitle">Te explica tu medidor, tu curva, tu escenario y tus pruebas — y si hay algo que ajustar. Se queda aquí hasta que pidas otra lectura.</div></div></div>
        <button class="btn btn-secondary" id="fm-ai-btn" style="width:100%" onclick="Forma.askAI()">Que el Temach lea mi pantalla</button>
        <div id="fm-ai" style="margin-top:12px"></div>
      </div>

      <!-- 6. CÓMO FUNCIONA -->
      <div class="card section">
        <button class="btn btn-ghost btn-sm" style="width:100%" onclick="Forma.toggleHow()"><span id="fm-how-arrow">▸</span> ¿Cómo funciona y qué tan confiable es?</button>
        <div id="fm-how" style="display:none;font-size:12px;color:var(--text-2);line-height:1.65;margin-top:12px">
          <p><b>Condición</b>: el promedio de tu carga de los últimos 42 días — lo que tu cuerpo ya construyó. Sube lento y baja lento.</p>
          <p style="margin-top:8px"><b>Fatiga</b>: el promedio de los últimos 7 días — lo que traes encima. Sube y baja rápido.</p>
          <p style="margin-top:8px"><b>Forma</b>: condición menos fatiga, en % de tu condición. Por eso un par de días suaves te ponen "fresco": la fatiga se va mucho antes que la condición. Es el principio con el que los atletas planean llegar a su mejor día.</p>
          <p style="margin-top:8px"><b>UA (unidades arbitrarias de carga)</b> = esfuerzo percibido (1–10) × minutos. Una sesión de 60 min con esfuerzo 7 son 420 UA. No es una unidad física como kilos o kilómetros: sirve para sumar pesas y cardio en la misma cuenta y comparar tus sesiones entre sí.</p>
          <p style="margin-top:8px"><b>Tu carga</b> es esfuerzo × minutos de cada sesión, fuerza y cardio. La simulación repite tu semana habitual de las últimas 4 semanas (${_m.weeklyLoad.toLocaleString('es-MX')} UA por semana), multiplicada por el escenario.</p>
          <p style="margin-top:8px"><b>Proyectado vs. real</b>: en la curva puedes ver, día por día, la forma que se proyectaba hace 7 días (suponiendo que repetías tu semana habitual) junto a la que pasó de verdad. Mide qué tan parecida fue tu semana real a la habitual — no si las fórmulas están bien. Lo que afina el modelo a ti son las pruebas quincenales.</p>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">
            ${_m.zones.map(zz => `<div style="display:flex;gap:8px;align-items:flex-start"><span style="width:10px;height:10px;border-radius:3px;background:${zz.color};flex-shrink:0;margin-top:4px"></span><span><b>${esc(zz.label)}</b> (${zz.min <= -999 ? 'menos de ' + zz.max : zz.max >= 999 ? 'más de +' + zz.min : (zz.min > 0 ? '+' : '') + zz.min + ' a ' + (zz.max > 0 ? '+' : '') + zz.max}%) — ${esc(zz.desc)}</span></div>`).join('')}
          </div>
          <p style="margin-top:12px;color:var(--text-3)"><b>Qué tan confiable es:</b> describe muy bien la TENDENCIA (cuándo vas a estar cansado, cuándo fresco) y no predice tu velocidad ni tus dominadas exactas. ${_calibText()} Basado en ${_m.quality.sessions} sesiones de las últimas 4 semanas${_m.quality.estimated ? `, ${_m.quality.estimated} con esfuerzo estimado — registrar tu esfuerzo en cada sesión lo vuelve más preciso` : ', todas con tu esfuerzo registrado'}.</p>
        </div>
      </div>
    </div>`;

    if (typeof Motion !== 'undefined') Motion.staggerIn(container.querySelectorAll('.section'));
    _animateHero();
    const bar = document.getElementById('fm-calib-bar');
    if (bar && typeof gsap !== 'undefined') gsap.fromTo(bar, { width: '0%' }, { width: bar.dataset.pct + '%', duration: 1.1, ease: 'power3.out', delay: 0.4 });
    _buildChart();
    _updateScenario(true);
    if (_plan) _renderPlan(false);
    _renderAI();
  }

  function _stat(id, label, hint, color, unit = '') {
    return `<div style="background:var(--bg-input);border-radius:12px;padding:10px 6px">
      <div id="${id}" style="font-size:20px;font-weight:800;color:${color};font-variant-numeric:tabular-nums">0${unit}</div>
      <div style="font-size:11px;font-weight:600;margin-top:2px">${label}</div>
      <div style="font-size:9px;color:var(--text-4);margin-top:2px;line-height:1.3">${hint}</div></div>`;
  }

  // ── medidor ─────────────────────────────────────────────────────
  const t = (pct) => (Math.max(GAUGE_MIN, Math.min(GAUGE_MAX, pct)) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);
  const polar = (r, tt) => { const a = Math.PI * (1 - tt); return [100 + r * Math.cos(a), 100 - r * Math.sin(a)]; };
  function _gaugeSVG() {
    const arcs = _m.zones.map(zz => {
      const a = t(Math.max(zz.min, GAUGE_MIN)), b = t(Math.min(zz.max, GAUGE_MAX));
      if (b <= a) return '';
      const [x1, y1] = polar(80, a), [x2, y2] = polar(80, b);
      return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A 80 80 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" stroke="${zz.color}" stroke-width="14" fill="none" opacity="0.85"/>`;
    }).join('');
    return `<svg viewBox="0 0 200 118" style="width:100%;max-width:300px;display:block;margin:0 auto" aria-label="Medidor de forma">
      <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="var(--bg-input)" stroke-width="18" fill="none"/>
      ${arcs}
      <g id="fm-needle"><line x1="100" y1="100" x2="100" y2="32" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/></g>
      <circle cx="100" cy="100" r="7" fill="#FFFFFF"/><circle cx="100" cy="100" r="3" fill="var(--bg-card)"/>
    </svg>`;
  }
  function _animateHero() {
    const c = _m.current;
    const angle = -90 + t(c.formPct) * 180;
    const needle = document.getElementById('fm-needle');
    const count = (id, to, unit = '', sign = false) => {
      const el = document.getElementById(id); if (!el) return;
      const o = { v: 0 };
      const paint = () => { const v = Math.round(o.v); el.textContent = (sign ? signed(v) : v.toLocaleString('es-MX')) + unit; };
      if (typeof gsap === 'undefined') { o.v = to; return paint(); }
      gsap.to(o, { v: to, duration: 1.3, ease: 'power2.out', onUpdate: paint, onComplete: paint });
    };
    if (needle && typeof gsap !== 'undefined') {
      gsap.fromTo(needle, { rotation: -90, svgOrigin: '100 100' }, { rotation: angle, svgOrigin: '100 100', duration: 1.6, ease: 'elastic.out(1, 0.55)', delay: 0.15 });
    } else if (needle) { needle.setAttribute('transform', `rotate(${angle} 100 100)`); }
    count('fm-fit', c.fitness); count('fm-fat', c.fatigue); count('fm-form', c.formPct, '%', true);
  }

  // ── gráfica ─────────────────────────────────────────────────────
  // Bandas de zonas detrás de la curva + línea de "hoy" + día de prueba.
  // Bandas de zonas detrás de la curva + líneas verticales (hoy, día de prueba).
  // Una sola fábrica para las dos gráficas: la curva principal y la del plan.
  function _bandsPlugin(id, markersFn, enabledFn) {
    return {
      id,
      beforeDatasetsDraw(chart) {
        if (enabledFn && !enabledFn()) return;
        const { ctx, chartArea: a, scales: { y } } = chart;
        ctx.save();
        _m.zones.forEach(zz => {
          const top = y.getPixelForValue(Math.min(zz.max, y.max)), bot = y.getPixelForValue(Math.max(zz.min, y.min));
          if (bot <= top) return;
          ctx.fillStyle = zz.color + '14'; ctx.fillRect(a.left, top, a.right - a.left, bot - top);
        });
        ctx.restore();
      },
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: a, scales: { x } } = chart;
        (markersFn() || []).forEach(({ idx, color, text }) => {
          if (idx < 0) return; const px = x.getPixelForValue(idx);
          ctx.save(); ctx.strokeStyle = color; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = '600 10px Poppins, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, px, a.top + 10); ctx.restore();
        });
      },
    };
  }
  const _mainBands = () => _bandsPlugin('fmBands', () => _mode === 'forma' ? [{ idx: HISTORY_SHOWN - 1, color: 'rgba(255,255,255,0.55)', text: 'hoy' }] : [], () => _mode !== 'cf');

  function _labels() {
    if (_mode === 'bt') return ((_m.backtest && _m.backtest.points) || []).map(p => p.date);
    const hist = _m.history.slice(-HISTORY_SHOWN).map(h => h.date);
    const fut = []; for (let i = 1; i <= HORIZON; i++) fut.push(addDays(_m.today, i));
    return hist.concat(fut);
  }

  function _datasets() {
    const ds = (label, data, color, opts = {}) => ({ label, data, borderColor: color, backgroundColor: color + '22', borderWidth: 2.5, pointRadius: 0, tension: 0.35, fill: false, spanGaps: false, ...opts });
    if (_mode === 'bt') {
      const pts = (_m.backtest && _m.backtest.points) || [];
      return [ds('Real', pts.map(p => p.actual), '#FFFFFF', { pointRadius: 3 }), ds('Proyectado hace 7 días', pts.map(p => p.forecast), '#A78BFA', { borderDash: [5, 4], pointRadius: 3 })];
    }
    const hist = _m.history.slice(-HISTORY_SHOWN);
    const pad = (arr, before, after) => Array(before).fill(null).concat(arr, Array(after).fill(null));
    const scenario = simulate(scenarioFn(_sc));
    const base = simulate(() => 1);
    const showBase = !(_sc.preset === 'igual' && _sc.loadPct === 100);
    const H = hist.length;
    const histVals = (k) => hist.map(h => h[k]);
    const fut = (sim, k) => [hist[H - 1][k]].concat(sim.map(d => k === 'formPct' ? d.formPct : Math.round(d[k] * 10) / 10)); // empieza en "hoy" para que la línea no se corte
    if (_mode === 'forma') {
      return [
        ds('Tu historia', pad(histVals('formPct'), 0, HORIZON), '#FFFFFF'),
        showBase ? ds('Si sigues igual', pad(fut(base, 'formPct'), H - 1, 0), '#6E6D8A', { borderDash: [5, 5], borderWidth: 1.5 }) : null,
        ds('Tu escenario', pad(fut(scenario, 'formPct'), H - 1, 0), '#A78BFA', { borderWidth: 3 }),
      ].filter(Boolean);
    }
    return [
      ds('Condición', pad(histVals('fitness'), 0, HORIZON), '#00FF87'),
      ds('Fatiga', pad(histVals('fatigue'), 0, HORIZON), '#A78BFA'),
      ds('Condición (escenario)', pad(fut(scenario, 'fitness'), H - 1, 0), '#00FF87', { borderDash: [5, 4] }),
      ds('Fatiga (escenario)', pad(fut(scenario, 'fatigue'), H - 1, 0), '#A78BFA', { borderDash: [5, 4] }),
    ];
  }

  function _btNote() {
    const el = document.getElementById('fm-bt-note'); if (!el) return;
    if (_mode !== 'bt') { el.style.display = 'none'; return; }
    const bt = _m.backtest;
    el.style.display = 'block';
    if (!bt || bt.n < 3) { el.innerHTML = 'Todavía no hay suficiente historia para comparar: necesita unas 5 semanas de datos (4 para conocer tu semana habitual + 1 para comparar).'; return; }
    const verdict = bt.mae <= 5 ? 'Tu semana real se parece mucho a tu semana habitual.' : bt.mae <= 10 ? 'Tu semana real varió un poco respecto a la habitual.' : 'Tu semana real varió bastante respecto a la habitual.';
    el.innerHTML = `<b>Diferencia típica: ±${bt.mae} puntos de forma</b> en ${bt.n} días comparados. ${verdict}<br><span style="color:var(--text-3)">Cada día se compara lo que se proyectaba <b>7 días antes</b> (suponiendo que repetías tu semana habitual) con lo que pasó de verdad. Una diferencia grande casi siempre significa que esa semana entrenaste distinto a lo habitual — <b>no</b> que el modelo falle. Lo que afina el modelo son tus pruebas quincenales.</span>`;
  }

  function _buildChart() {
    const canvas = document.getElementById('fm-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_chart) { try { _chart.destroy(); } catch(e) {} }
    _chart = new Chart(canvas, {
      type: 'line',
      data: { labels: _labels(), datasets: _datasets() },
      plugins: [_mainBands()],
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 650, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
            callbacks: {
              title: (items) => dayName(_chart.data.labels[items[0].dataIndex]),
              label: (c) => c.raw == null ? null : ` ${c.dataset.label}: ${_mode === 'cf' ? Math.round(c.raw) + ' UA/día' : signed(c.raw) + '% · ' + zoneOf(c.raw).label}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 6, callback: (v, i) => { const d = new Date(_chart ? _chart.data.labels[i] + 'T00:00:00' : 0); return isNaN(d) ? '' : `${d.getDate()}/${d.getMonth() + 1}`; } }, grid: { display: false }, border: { display: false } },
          y: _mode !== 'cf'
            ? { suggestedMin: -60, suggestedMax: 40, ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' }, callback: v => signed(v) + '%' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } }
            : { beginAtZero: true, ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
        },
      },
    });
    _renderLegend();
    _btNote();
  }

  function _renderLegend() {
    const el = document.getElementById('fm-legend'); if (!el || !_chart) return;
    el.innerHTML = _chart.data.datasets.map(d => `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:14px;height:0;border-top:2px ${d.borderDash ? 'dashed' : 'solid'} ${d.borderColor}"></span>${esc(d.label)}</span>`).join('');
  }

  // ── escenarios ──────────────────────────────────────────────────
  const _loadLabel = (p) => p === 0 ? 'Descanso total' : p === 100 ? '100% · tu semana habitual' : `${p}% de tu semana habitual`;

  function _updateScenario(first) {
    const s = summarize(simulate(scenarioFn(_sc)), _sc);
    const ze = zoneOf(s.end.formPct);
    const res = document.getElementById('fm-results');
    if (res) {
      res.innerHTML = `
        ${_resCard('Forma al terminar', `<span style="color:${ze.color}">${signed(s.end.formPct)}%</span>`, esc(ze.label))}
        ${_resCard('Condición', `<span style="color:${s.fitnessChange >= 0 ? 'var(--accent)' : 'var(--danger)'}">${signed(s.fitnessChange)}%</span>`, 'vs. hoy')}
        ${_resCard('Próximo día fresco', s.best ? `<span style="color:var(--accent);font-size:14px">${esc(dayName(s.best.date))}</span>` : '<span style="font-size:13px;color:var(--text-3)">ninguno</span>', s.best ? `forma ${signed(s.best.formPct)}%` : 'en 8 semanas')}`;
      if (!first && typeof gsap !== 'undefined') gsap.fromTo(res.children, { y: 6, opacity: 0.35 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.05, ease: 'power2.out' });
    }
    const warn = document.getElementById('fm-warning');
    if (warn) {
      const zmin = zoneOf(s.minDay.formPct);
      warn.innerHTML = zmin.key === 'sobrecarga'
        ? `<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);font-size:12px;line-height:1.5">⚠️ El <b>${esc(dayName(s.minDay.date))}</b> tocarías sobrecarga (${signed(s.minDay.formPct)}%). Sostenerlo varios días es la receta del estancamiento o la lesión — acórtalo o mete un día suave.</div>`
        : (s.end.formPct >= 30 ? `<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);font-size:12px;line-height:1.5">💤 Terminarías demasiado descansado: tu condición empieza a bajar. Bien para recuperarte, no para quedarte ahí.</div>` : '');
    }
    if (_chart) { _chart.data.datasets = _datasets(); _chart.update(); _renderLegend(); }
  }
  const _resCard = (title, value, sub) => `<div style="background:var(--bg-input);border-radius:12px;padding:10px 8px;text-align:center">
      <div style="font-size:10px;color:var(--text-3);margin-bottom:4px;line-height:1.3">${title}</div>
      <div style="font-size:18px;font-weight:800;font-variant-numeric:tabular-nums">${value}</div>
      <div style="font-size:10px;color:var(--text-4);margin-top:2px">${sub}</div></div>`;

  function _queueUpdate() { cancelAnimationFrame(_raf); _raf = requestAnimationFrame(() => _updateScenario(false)); }
  function _markPreset(key) {
    document.querySelectorAll('#fm-presets [data-preset]').forEach(b => {
      const on = b.dataset.preset === key;
      b.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-secondary');
      if (on && typeof gsap !== 'undefined') gsap.fromTo(b, { scale: 0.88 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
    });
  }

  function setPreset(key) {
    const p = PRESETS[key]; if (!p) return;
    if (typeof Sounds !== 'undefined') Sounds.click();
    _sc = { preset: key, loadPct: p.loadPct, weeks: p.weeks };
    const sliders = document.querySelectorAll('.card input[type="range"]');
    if (sliders[0]) sliders[0].value = p.loadPct;
    if (sliders[1]) sliders[1].value = p.weeks;
    _syncLabels(); _markPreset(key); _updateScenario(false);
  }
  function setLoad(v) { _sc = { ..._sc, preset: 'custom', loadPct: Number(v) }; _syncLabels(); _markPreset(null); _queueUpdate(); }
  function setWeeks(v) { _sc = { ..._sc, weeks: Number(v) }; _syncLabels(); _queueUpdate(); }
  function _syncLabels() {
    const l = document.getElementById('fm-load-val'), w = document.getElementById('fm-weeks-val');
    if (l) l.textContent = _loadLabel(_sc.loadPct);
    if (w) w.textContent = `${_sc.weeks} semana${_sc.weeks === 1 ? '' : 's'}`;
  }
  function setMode(m) { _mode = m; const c = document.getElementById('page-content'); document.querySelectorAll('.card-header .btn[onclick^="Forma.setMode"]').forEach(b => { b.className = 'btn btn-sm ' + (b.getAttribute('onclick').includes(`'${m}'`) ? 'btn-primary' : 'btn-secondary'); }); _buildChart(); }

  // ── día de prueba ───────────────────────────────────────────────
  // El plan vive en SU PROPIA tarjeta y gráfica: ya no se encima en "Tu curva".
  // Se guarda la fecha en el teléfono y se recalcula con tus datos de hoy cada
  // vez que entras; "Quitar plan" lo borra por completo.
  function planTestDay() {
    const input = document.getElementById('fm-testday');
    const date = input && input.value;
    if (!date || daysBetween(_m.today, date) < 7 || daysBetween(_m.today, date) > HORIZON) {
      Toast.warning('Elige una fecha entre 1 y 8 semanas a partir de mañana.'); return;
    }
    if (typeof Sounds !== 'undefined') Sounds.click();
    _plan = planPeak(date);
    if (!_plan) { Toast.warning('No pude armar un plan para esa fecha.'); return; }
    try { localStorage.setItem(TESTDAY_KEY, date); } catch(e) {}
    _renderPlan(true);
  }

  function clearPlan() {
    if (typeof Sounds !== 'undefined') Sounds.click();
    _plan = null;
    try { localStorage.removeItem(TESTDAY_KEY); } catch(e) {}
    if (_planChart) { try { _planChart.destroy(); } catch(e) {} _planChart = null; }
    const el = document.getElementById('fm-plan'), input = document.getElementById('fm-testday');
    if (input) input.value = '';
    if (el) el.innerHTML = '';
    Toast.success('Plan quitado');
  }

  function changePlanDate() { const i = document.getElementById('fm-testday'); if (i) { i.scrollIntoView({ behavior: 'smooth', block: 'center' }); i.focus(); } }

  function _renderPlan(animate) {
    const el = document.getElementById('fm-plan'); if (!el || !_plan) return;
    const p = _plan, d = p.day, zz = zoneOf(d.formPct);
    const buildDays = p.idx - p.taper, gain = Math.round((d.fitness / _m.state.fitness - 1) * 100);
    const seg = (days, color, title, sub) => days > 0 ? `<div class="fm-seg" style="flex:${days};min-width:0;background:${color};border-radius:8px;padding:8px 6px;overflow:hidden">
        <div style="font-size:11px;font-weight:700;color:#0A0A12;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
        <div style="font-size:10px;color:rgba(10,10,18,0.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div></div>` : '';
    el.innerHTML = `
      <div id="fm-plan-card" style="margin-top:14px;padding:14px;border-radius:14px;background:linear-gradient(135deg, rgba(0,255,135,0.10), rgba(124,58,237,0.10));border:1px solid rgba(0,255,135,0.25)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div><div style="font-size:12px;color:var(--text-3)">Tu día de prueba</div>
          <div style="font-size:17px;font-weight:800;margin-bottom:10px">${esc(dayName(addDays(_m.today, p.idx + 1)))}</div></div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-ghost btn-sm" onclick="Forma.changePlanDate()">Cambiar fecha</button>
            <button class="btn btn-secondary btn-sm" onclick="Forma.clearPlan()">✕ Quitar plan</button>
          </div>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:10px">
          ${seg(buildDays, '#F59E0B', `Construir · ${p.build}%`, `${buildDays} días`)}
          ${seg(p.taper, '#3B82F6', `Bajar · ${p.taperPct}%`, `${p.taper} días`)}
          ${seg(1.4, '#00FF87', '🎯 Prueba', 'tu día')}
        </div>
        <div style="font-size:12px;color:var(--text-2);line-height:1.6">
          ${buildDays > 0 ? `<b>${buildDays} días</b> entrenando al <b>${p.build}%</b> de tu semana habitual, ` : ''}después <b>${p.taper} días</b> bajando al <b>${p.taperPct}%</b> — mismos días e intensidad, menos series o menos minutos (bajar volumen, no intensidad, es lo que mejor funciona antes de una prueba). Llegarías con forma de <b style="color:${zz.color}">${signed(d.formPct)}% · ${esc(zz.label)}</b> y la condición <b>${signed(gain)}%</b> respecto a hoy.
          ${p.inPeak ? '' : '<br><span style="color:var(--warning)">⚠️ Con tan poco tiempo no se alcanza la zona fresca completa — es el mejor punto posible para esa fecha.</span>'}
        </div>
        <div style="font-size:11px;color:var(--text-3);margin:14px 0 6px">Tu forma día por día con este plan (la línea punteada es "si sigues igual")</div>
        <div style="position:relative;height:190px"><canvas id="fm-plan-chart"></canvas></div>
      </div>`;
    _buildPlanChart();
    if (animate && typeof gsap !== 'undefined') {
      gsap.from(el.firstElementChild, { y: 10, opacity: 0, duration: 0.45, ease: 'power2.out' });
      gsap.from(el.querySelectorAll('.fm-seg'), { scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.12, ease: 'power3.out', delay: 0.15 });
    }
  }

  function _buildPlanChart() {
    const canvas = document.getElementById('fm-plan-chart');
    if (_planChart) { try { _planChart.destroy(); } catch(e) {} _planChart = null; }
    if (!canvas || !_plan || typeof Chart === 'undefined') return;
    const labels = []; for (let i = 0; i <= _plan.idx + 4; i++) labels.push(addDays(_m.today, i));
    const cur = _m.history[_m.history.length - 1].formPct;
    const series = (sim) => [cur].concat(sim.slice(0, labels.length - 1).map(d => d.formPct));
    const ds = (label, data, color, opts = {}) => ({ label, data, borderColor: color, backgroundColor: color + '22', borderWidth: 2.5, pointRadius: 0, tension: 0.35, fill: false, ...opts });
    _planChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [ds('Si sigues igual', series(simulate(() => 1)), '#6E6D8A', { borderDash: [5, 5], borderWidth: 1.5 }), ds('Tu plan', series(_plan.sim), '#00FF87', { borderWidth: 3 })] },
      plugins: [_bandsPlugin('fmPlanBands', () => [{ idx: 0, color: 'rgba(255,255,255,0.55)', text: 'hoy' }, { idx: _plan.idx + 1, color: '#00FF87', text: '🎯' }], null)],
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 650, easing: 'easeOutQuart' }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
          callbacks: { title: (it) => dayName(labels[it[0].dataIndex]), label: (c) => c.raw == null ? null : ` ${c.dataset.label}: ${signed(c.raw)}% · ${zoneOf(c.raw).label}` } } },
        scales: {
          x: { ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 6, callback: (v, i) => { const d = new Date(labels[i] + 'T00:00:00'); return isNaN(d) ? '' : `${d.getDate()}/${d.getMonth() + 1}`; } }, grid: { display: false }, border: { display: false } },
          y: { suggestedMin: -60, suggestedMax: 40, ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' }, callback: v => signed(v) + '%' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
        },
      },
    });
  }

  // ── PRUEBA QUINCENAL ────────────────────────────────────────────
  // Cada 2 semanas: sprint de 20 s y máximo de dominadas con asistencia
  // fija. Con 6 pruebas el backend busca las constantes que mejor explican
  // TUS resultados (primero la fatiga, luego la condición si los datos lo
  // justifican) — ver _fitFormModel en 11_Forma.gs.
  function _calibText() {
    const c = _m.calibration || {};
    if (c.personalizedParts === 'ambas') return `Ya usa <b>tus</b> constantes: tu condición se construye en ~${c.tauFitness} días (promedio: 42) y tu fatiga se va en ~${c.tauFatigue} (promedio: 7).`;
    if (c.personalizedParts === 'fatiga') return `Ya aprendió <b>tu fatiga</b>: se te va en ~${c.tauFatigue} días (promedio: 7). Tu condición todavía usa la general (42 días) — cambia tan lento que tarda más pruebas en aprenderse.`;
    if ((c.usable || 0) >= (c.needed || 6)) return `Con tus ${c.usable} pruebas, las constantes generales (42 y 7 días) todavía predicen igual o mejor que unas personales, así que se mantienen. Cada prueba nueva lo vuelve a revisar.`;
    return `Por ahora usa las constantes generales (42 y 7 días). Con ${c.needed || 6} pruebas quincenales empieza a aprender las tuyas — llevas ${c.usable || 0}.`;
  }

  function _testCardHTML() {
    const c = _m.calibration || { usable: 0, needed: 6 };
    const tests = _m.tests || [];
    const ref = tests.find(x => x.reps > 0);
    const refAssist = ref ? ref.assist : null;
    const pct = c.personalized ? 100 : Math.min(100, Math.round((c.usable || 0) / (c.needed || 6) * 100));
    const left = daysBetween(_m.today, _m.nextTestDue);
    const status = _m.testDue
      ? `<span style="color:var(--accent);font-weight:700">Te toca hoy</span>`
      : `Próxima: <b>${esc(dayName(_m.nextTestDue))}</b> (en ${left} día${left === 1 ? '' : 's'})`;
    return `
      <div class="card section" id="fm-test-card">
        <div class="card-header"><div><div class="card-title">🧪 Prueba quincenal</div><div class="card-subtitle">10 minutos cada 2 semanas para que el simulador aprenda cómo respondes tú</div></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:8px"><span>${status}</span><span style="color:var(--text-3)">${c.personalized ? '✨ personalizado' : `${c.usable || 0} de ${c.needed || 6} pruebas`}</span></div>
        <div style="height:6px;border-radius:99px;background:var(--bg-input);overflow:hidden;margin-bottom:10px">
          <div id="fm-calib-bar" data-pct="${pct}" style="height:100%;width:${pct}%;border-radius:99px;background:linear-gradient(90deg, var(--purple), var(--accent))"></div>
        </div>
        <div style="font-size:12px;color:var(--text-2);line-height:1.55;margin-bottom:12px">${_calibText()}</div>
        ${tests.length ? `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px">${tests.slice(-6).reverse().map(x => `
          <div style="flex-shrink:0;background:var(--bg-input);border-radius:10px;padding:8px 10px;font-size:11px;line-height:1.5">
            <div style="color:var(--text-3)">${esc(dayName(x.date))}</div>
            ${x.speed ? `<div>🏃 <b>${x.speed}</b> km/h</div>` : ''}${x.reps !== null ? `<div>💪 <b>${x.reps}</b> reps${x.assist !== null ? ` · ${x.assist} lbs` : ''}</div>` : ''}
          </div>`).join('')}</div>` : ''}
        <button class="btn ${_m.testDue ? 'btn-primary' : 'btn-secondary'}" style="width:100%" onclick="Forma.toggleTestForm()">🧪 Registrar mi prueba</button>
        <div id="fm-test-form" style="display:none;margin-top:14px">
          <ol style="font-size:12px;color:var(--text-2);line-height:1.6;padding-left:18px;margin:0 0 12px 0">
            <li>Al <b>inicio</b> de una sesión, tras 10 min de calentamiento — nunca al final, cansado.</li>
            <li><b>Sprint:</b> la velocidad MÁS alta que sostengas <b>20 segundos</b> en la caminadora.</li>
            <li>Descansa 3 minutos.</li>
            <li><b>Dominadas:</b> máximo de repeticiones limpias en la máquina ${refAssist !== null && refAssist !== undefined ? `con <b>${refAssist} lbs</b> de asistencia — la misma de siempre, si no los números no se comparan` : 'con una asistencia en la que saques <b>10 a 15</b> — anótala y úsala SIEMPRE igual (más repeticiones = medición más fina)'}.</li>
          </ol>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="input-group" style="margin:0"><label class="input-label">Sprint (km/h)</label><input class="input" type="number" step="0.1" min="4" max="35" id="fm-t-speed" placeholder="12.5"></div>
            <div class="input-group" style="margin:0"><label class="input-label">Dominadas (reps)</label><input class="input" type="number" step="1" min="0" max="60" id="fm-t-reps" placeholder="12"></div>
            <div class="input-group" style="margin:0"><label class="input-label">Asistencia (lbs)</label><input class="input" type="number" step="1" min="0" id="fm-t-assist" value="${refAssist ?? ''}" placeholder="25"></div>
            <div class="input-group" style="margin:0"><label class="input-label">Fecha</label><input class="input" type="date" id="fm-t-date" max="${_m.today}" value="${_m.today}"></div>
          </div>
          <div class="input-group" style="margin-top:8px"><label class="input-label">Notas (opcional)</label><input class="input" id="fm-t-notes" maxlength="200" placeholder="Dormí mal, caminadora distinta…"></div>
          <button class="btn btn-primary" id="fm-t-save" style="width:100%;margin-top:4px" onclick="Forma.saveTest()">Guardar prueba</button>
        </div>
      </div>`;
  }

  function toggleTestForm() {
    const f = document.getElementById('fm-test-form'); if (!f) return;
    const open = f.style.display === 'none';
    f.style.display = open ? 'block' : 'none';
    if (open && typeof gsap !== 'undefined') gsap.from(f, { opacity: 0, y: -6, duration: 0.3 });
  }
  function goToTest() {
    const card = document.getElementById('fm-test-card'); if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const f = document.getElementById('fm-test-form'); if (f && f.style.display === 'none') toggleTestForm();
  }

  async function saveTest() {
    const v = (id) => (document.getElementById(id) || {}).value;
    const payload = { speed: v('fm-t-speed'), reps: v('fm-t-reps'), assist: v('fm-t-assist'), date: v('fm-t-date'), notes: v('fm-t-notes') };
    if (!payload.speed && payload.reps === '') { Toast.warning('Registra al menos tu sprint o tus dominadas.'); return; }
    const btn = document.getElementById('fm-t-save'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      const r = await API.saveFormTest(payload);
      if (r && r.success) {
        if (typeof Sounds !== 'undefined' && Sounds.serieDone) Sounds.serieDone();
        Toast.success(r.updated ? 'Prueba actualizada 🧪' : 'Prueba guardada 🧪 — el modelo se recalculó');
        await init(document.getElementById('page-content'));
        return;
      }
      Toast.warning((r && r.error) || 'No se pudo guardar la prueba.');
    } catch(e) { Toast.warning('Sin conexión — intenta de nuevo cuando tengas señal.'); }
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar prueba'; }
  }

  // ── IA ──────────────────────────────────────────────────────────
  // ── ¿COMO LA POBLACIÓN O LA EXCEPCIÓN? ──────────────────────────
  // La app NO tiene datos de otras personas. "Población" aquí = los valores de
  // referencia de la literatura del entrenamiento (condición ≈ 42 días, fatiga
  // ≈ 7). Mientras el modelo use esos mismos valores, no hay forma honesta de
  // saber si eres como la mayoría: solo después de calibrarlo con tus pruebas.
  function _popBar(label, you, pop, min, max, fast, slow) {
    const pos = (v) => Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
    const diff = (you - pop) / pop, exception = Math.abs(diff) >= 0.25;
    const verdict = Math.abs(diff) < 0.15 ? 'Como la mayoría' : (you < pop ? 'Más rápido que lo típico' : 'Más lento que lo típico');
    return `<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:8px"><b>${label}</b><span style="color:${exception ? '#F59E0B' : 'var(--accent)'};font-weight:700;text-align:right">${exception ? '⭐ Excepción · ' : ''}${verdict}</span></div>
      <div style="position:relative;height:8px;border-radius:99px;background:var(--bg-input)">
        <div style="position:absolute;left:${pos(pop)}%;top:-3px;width:14px;height:14px;margin-left:-7px;border-radius:50%;border:2px solid var(--text-3);background:var(--bg-card)"></div>
        <div style="position:absolute;left:${pos(you)}%;top:-3px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(0,255,135,0.25)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-4);margin-top:7px"><span>${min} días</span><span>Tú: <b style="color:var(--text-1)">${you} días</b> · Población: ${pop}</span><span>${max} días</span></div>
      <div style="font-size:11px;color:var(--text-3);margin-top:6px;line-height:1.5">${Math.abs(diff) < 0.15 ? 'Tu cuerpo responde como lo hace la mayoría de la gente que entrena.' : (you < pop ? fast : slow)}</div></div>`;
  }

  function _populationHTML() {
    const c = _m.calibration || {}, h = _m.history;
    const d28 = h[Math.max(0, h.length - 29)], last = h[h.length - 1];
    const fitChange = d28 && d28.fitness > 0 ? Math.round((last.fitness / d28.fitness - 1) * 100) : null;
    const body = c.personalized
      ? `${c.personalizedParts === 'ambas' ? _popBar('Condición — cuánto tarda en construirse (y en perderse)', _m.tau.fitness, 42, 21, 63, 'Ganas condición más rápido que lo típico… y también la pierdes más rápido si paras varios días.', 'Ganas condición más lento que lo típico, pero la conservas más tiempo cuando paras.') : `<div style="font-size:12px;color:var(--text-3);margin-bottom:14px;line-height:1.5">Tu <b>condición</b> todavía usa el valor general (42 días): cambia tan lento que necesita más pruebas para aprenderse.</div>`}
         ${_popBar('Fatiga — cuánto tarda en irse', _m.tau.fatigue, 7, 3, 14, 'Te recuperas más rápido que lo típico: toleras bloques densos con menos días suaves.', 'Tu fatiga tarda más en irse que lo típico: respeta los días suaves y no apiles bloques duros.')}`
      : `<div style="font-size:12px;color:var(--text-2);line-height:1.6;margin-bottom:10px">Todavía <b>no se puede saber</b> si eres como la mayoría o la excepción: el modelo usa los valores de la población (condición 42 días, fatiga 7) hasta aprender los tuyos. Con tus pruebas quincenales lo averigua — llevas <b>${c.usable || 0} de ${c.needed || 6}</b>.</div>
         <div style="height:6px;border-radius:99px;background:var(--bg-input);overflow:hidden"><div style="height:100%;width:${Math.min(100, Math.round((c.usable || 0) / (c.needed || 6) * 100))}%;border-radius:99px;background:linear-gradient(90deg, var(--purple), var(--accent))"></div></div>`;
    return `
      <div class="card section" id="fm-pop-card">
        <div class="card-header"><div><div class="card-title">🧭 ¿Eres como la población o la excepción?</div><div class="card-subtitle">Compara cómo responde tu cuerpo contra lo típico</div></div></div>
        ${body}
        ${fitChange !== null ? `<div style="margin-top:14px;padding:10px 12px;border-radius:10px;background:var(--bg-input);font-size:12px;line-height:1.5">Tu condición cambió <b style="color:${fitChange >= 0 ? 'var(--accent)' : 'var(--danger)'}">${fitChange > 0 ? '+' : ''}${fitChange}%</b> en las últimas 4 semanas.</div>` : ''}
        <div style="font-size:10px;color:var(--text-4);margin-top:12px;line-height:1.5">La app no tiene datos de otras personas: "población" son los valores de referencia de la literatura del entrenamiento (42 y 7 días). Es una comparación del <i>modelo</i>, no un ranking contra gente real.</div>
      </div>`;
  }

  // ── LECTURA DEL TEMACH (se queda hasta que pidas otra) ───────────
  function _renderAI() {
    const el = document.getElementById('fm-ai'), btn = document.getElementById('fm-ai-btn');
    if (!el || _aiBusy) return;
    const has = !!(_ai && _ai.text);
    if (btn) btn.textContent = has ? '🔄 Actualizar lectura' : 'Que el Temach lea mi pantalla';
    if (!has) { el.innerHTML = ''; return; }
    const when = new Date(_ai.at).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const stale = _ai.day !== _m.today;
    el.innerHTML = `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:10px;line-height:1.5">Lectura del ${esc(when)} · escenario: <b>${esc(_ai.name || '—')}</b>${stale ? ' · <span style="color:var(--warning)">es de otro día — actualízala para que use tus datos de hoy</span>' : ''}</div>
      <div class="fm-ai-text" style="font-size:13px;line-height:1.7;color:var(--text-1)">${Utils.renderMarkdown ? Utils.renderMarkdown(_ai.text) : esc(_ai.text).replace(/\n/g, '<br>')}</div>`;
  }

  async function askAI() {
    if (_aiBusy) return;
    _aiBusy = true;
    const btn = document.getElementById('fm-ai-btn'), el = document.getElementById('fm-ai');
    if (btn) { btn.disabled = true; btn.textContent = 'El Temach está leyendo…'; }
    let i = 0;
    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:14px;border-radius:12px;background:var(--bg-input)">
      <div style="width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.9s linear infinite"></div>
      <div id="fm-ai-msg" style="font-size:12px;color:var(--text-2)">${AI_MSGS[0]}</div></div>`;
    const ticker = setInterval(() => {
      const m = document.getElementById('fm-ai-msg'); if (!m) return;
      i = (i + 1) % AI_MSGS.length;
      if (typeof gsap !== 'undefined') gsap.fromTo(m, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.35 });
      m.textContent = AI_MSGS[i];
    }, 2600);

    const s = summarize(simulate(scenarioFn(_sc)), _sc);
    const payload = {
      current: { formaPct: _m.current.formPct, zona: zoneOf(_m.current.formPct).label, condicion: _m.current.fitness, fatiga: _m.current.fatigue, cargaSemanalHabitual: _m.weeklyLoad },
      scenario: { nombre: (PRESETS[_sc.preset] || {}).label || 'Personalizado', cargaPct: _sc.loadPct, semanas: _sc.weeks },
      result: { formaAlTerminarPct: s.end.formPct, zonaAlTerminar: zoneOf(s.end.formPct).label, cambioCondicionPct: s.fitnessChange, puntoMasBajoPct: s.minDay.formPct, fechaPuntoMasBajo: s.minDay.date, proximoDiaFresco: s.best ? s.best.date : null },
      testDay: _plan ? { fecha: addDays(_m.today, _plan.idx + 1), construirPct: _plan.build, diasConstruir: _plan.idx - _plan.taper, bajarPct: _plan.taperPct, diasBajar: _plan.taper, formaEseDiaPct: _plan.day.formPct } : null,
      building: !!_m.building,
    };
    let errHtml = '';
    try {
      const r = await API.interpretFormScenario(payload);
      if (r && r.success && r.text) {
        _ai = { text: r.text, at: r.at || Date.now(), name: payload.scenario.nombre, day: _m.today };
        try { localStorage.setItem(AI_KEY, JSON.stringify(_ai)); } catch(e) {}
      } else {
        errHtml = `<div style="font-size:12px;color:var(--warning);line-height:1.5;margin-bottom:10px">No se pudo leer tu pantalla: ${esc((r && r.cause && r.cause.message) || 'sin respuesta del servidor')}${_ai ? ' Se conserva tu lectura anterior.' : ''}</div>`;
      }
    } catch(e) {
      errHtml = `<div style="font-size:12px;color:var(--warning);line-height:1.5;margin-bottom:10px">No se pudo conectar con el Temach. Intenta de nuevo en un momento.${_ai ? ' Se conserva tu lectura anterior.' : ''}</div>`;
    } finally {
      clearInterval(ticker); _aiBusy = false;
      if (btn) btn.disabled = false;
      _renderAI();
      if (errHtml) el.insertAdjacentHTML('afterbegin', errHtml);
      else if (typeof gsap !== 'undefined' && el.lastElementChild) gsap.from(el.lastElementChild, { opacity: 0, y: 8, duration: 0.5, ease: 'power2.out' });
    }
  }

  function toggleHow() {
    const el = document.getElementById('fm-how'), ar = document.getElementById('fm-how-arrow');
    const open = el.style.display === 'none';
    el.style.display = open ? 'block' : 'none'; ar.textContent = open ? '▾' : '▸';
    if (open && typeof gsap !== 'undefined') gsap.from(el, { opacity: 0, y: -6, duration: 0.3 });
  }

  return { init, setPreset, setLoad, setWeeks, setMode, planTestDay, clearPlan, changePlanDate, askAI, toggleHow, toggleTestForm, goToTest, saveTest, _test: { simulate: (f) => simulate(f), planPeak: (d) => planPeak(d), summarize: (s, c) => summarize(s, c), setModel: (m) => { _m = m; } } };
})();

function initForma(container) { Forma.init(container); }
