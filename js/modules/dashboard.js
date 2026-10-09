// ═══════════════════════════════════════════
// DASHBOARD MODULE
// ═══════════════════════════════════════════

// ═══ RUTA VIRTUAL DE KILÓMETROS ════════════════════════════════════
// Antes había 17 lugares fijos guardados aquí (Xcaret, Tulum, Mérida…)
// y se elegía el de distancia "parecida" a tus km, en cualquier
// dirección — impreciso (3 km → "Xcaret", 7 km) y tope en CDMX. Ahora
// NO hay lugares guardados: tus km se recorren sobre una CARRETERA REAL
// desde tu ciudad (Configuración) rumbo a CDMX y luego a Tijuana, y el
// nombre del punto exacto donde caes se obtiene solo de OpenStreetMap.
// Aquí solo vive el RUMBO del viaje, no los lugares.
const _KM_ROUTE_WAYPOINTS = [[19.4326, -99.1332], [32.5149, -117.0382]]; // CDMX → Tijuana
const _KM_ROUTE_KEY = 'fittracker_km_route_v2';

function _haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// La ruta por carretera se pide UNA vez a OSRM (servicio abierto, sin
// llave) y se guarda en el teléfono. Si no hay conexión, se usa una
// línea recta aproximada (punteada en el mapa) y no se guarda.
async function _kmRoute(homeLat, homeLng) {
  const key = `${_KM_ROUTE_KEY}_${homeLat.toFixed(3)}_${homeLng.toFixed(3)}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.pts && c.pts.length > 1) return c; } catch(e) {}
  let pts = null, real = false;
  try {
    const coords = [[homeLat, homeLng], ..._KM_ROUTE_WAYPOINTS].map(([la, ln]) => `${ln},${la}`).join(';');
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    const data = await res.json();
    const g = data.code === 'Ok' && data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates;
    if (g && g.length > 1) { pts = g.map(([ln, la]) => [la, ln]); real = true; }
  } catch(e) { /* sin red: línea recta abajo */ }
  if (!pts) {
    const legs = [[homeLat, homeLng], ..._KM_ROUTE_WAYPOINTS]; pts = [];
    for (let i = 0; i < legs.length - 1; i++) for (let k = 0; k < 100; k++) { const t = k / 100; pts.push([legs[i][0] + (legs[i+1][0] - legs[i][0]) * t, legs[i][1] + (legs[i+1][1] - legs[i][1]) * t]); }
    pts.push(legs[legs.length - 1]);
  }
  // Distancia acumulada; puntos a ≥0.5 km (la geometría completa trae miles).
  const out = [pts[0]], cum = [0]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const last = out[out.length - 1], d = _haversineKm(last[0], last[1], pts[i][0], pts[i][1]);
    if (d >= 0.5 || i === pts.length - 1) { acc += d; out.push([Math.round(pts[i][0] * 1e5) / 1e5, Math.round(pts[i][1] * 1e5) / 1e5]); cum.push(Math.round(acc * 100) / 100); }
  }
  const route = { pts: out, cum, real };
  if (real) { try { localStorage.setItem(key, JSON.stringify(route)); } catch(e) {} }
  return route;
}

// Punto exacto sobre la carretera a "km" de casa.
function _kmPointAt(route, km) {
  const { pts, cum } = route;
  if (!(km > 0)) return { point: pts[0], idx: 0 };
  if (km >= cum[cum.length - 1]) return { point: pts[pts.length - 1], idx: pts.length - 1, beyond: true };
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= km) lo = mid; else hi = mid; }
  const t = (km - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
  return { point: [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t], idx: lo };
}

// Nombre del lugar donde caes — OpenStreetMap (Nominatim, sin llave).
// Su política pide máximo 1 consulta por segundo: se encolan, y cada
// nombre queda guardado en el teléfono (por zona de ~1 km).
let _nominatimQueue = Promise.resolve();
function _kmPlaceName(lat, lng, km) {
  const zoom = km < 20 ? 14 : 10; // poca distancia → colonia; mucha → ciudad/municipio
  const key = `fittracker_km_place_${zoom}_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  try { const c = localStorage.getItem(key); if (c) return Promise.resolve(c); } catch(e) {}
  const job = _nominatimQueue.then(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&accept-language=es`);
      const a = ((await res.json()) || {}).address || {};
      const town = a.city || a.town || a.village || a.hamlet || a.municipality || a.county;
      const colonia = zoom >= 14 ? (a.suburb || a.neighbourhood || a.quarter) : null;
      // Cerca de casa: "Colonia, Ciudad". Lejos: "Ciudad, Estado".
      const parts = colonia ? [colonia, town] : [town, a.state];
      const name = parts.filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ') || null;
      if (name) { try { localStorage.setItem(key, name); } catch(e) {} }
      return name;
    } catch(e) { return null; }
    finally { await new Promise(r => setTimeout(r, 1100)); }
  });
  _nominatimQueue = job.catch(() => {});
  return job;
}

// Tarjeta tipo carrusel (swipeable) — hoy / semana / mes / año, para
// no saturar el Dashboard con 4 tarjetas fijas. Cada slide compara
// los km corridos contra un lugar real, calculado desde la ciudad de
// "casa" que Diego configure en Configuración.
function _kmCarouselHTML(distanceStats, profile) {
  const homeLat = profile?.Ciudad_Lat != null ? Number(profile.Ciudad_Lat) : null;
  const homeLng = profile?.Ciudad_Lng != null ? Number(profile.Ciudad_Lng) : null;
  const homeCity = profile?.Ciudad_Origen || '';
  const stats = distanceStats || { today: 0, week: 0, month: 0, year: 0 };

  if (homeLat == null || homeLng == null) {
    return `
    <div class="card section">
      <div class="card-header"><div class="card-title">🏃 Kilómetros corridos</div></div>
      <div style="font-size:12px;color:var(--text-3);line-height:1.6">
        Configura tu ciudad de origen en <b>Configuración</b> para ver cuánto equivalen en distancias reales tus kilómetros corridos.
      </div>
      <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="Router.navigate('config')">⚙️ Ir a Configuración</button>
    </div>`;
  }

  const periods = [
    { key: 'today', label: 'Hoy',        km: stats.today },
    { key: 'week',  label: 'Esta semana', km: stats.week },
    { key: 'month', label: 'Este mes',   km: stats.month },
    { key: 'year',  label: 'Este año',   km: stats.year },
  ];

  return `
    <div class="card section" style="padding:0;overflow:hidden">
      <div style="padding:16px 16px 4px 16px">
        <div class="card-title">🏃 Kilómetros corridos</div>
        <div class="card-subtitle">Tus km sobre la carretera desde ${homeCity || 'tu ciudad'} rumbo a CDMX — desliza para hoy, semana, mes y año</div>
      </div>
      <div id="km-carousel" data-home-lat="${homeLat}" data-home-lng="${homeLng}" data-home-city="${Utils.escapeHtml(homeCity)}" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;gap:0" onscroll="Dashboard_onKmScroll(this)">
        ${periods.map(p => `
          <div style="flex:0 0 100%;scroll-snap-align:start;padding:12px 16px 18px 16px;box-sizing:border-box">
            <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:4px">
              <span style="font-size:22px;font-weight:700;color:var(--accent)">${p.km.toFixed(p.km < 10 ? 1 : 0)}</span>
              <span style="font-size:12px;color:var(--text-3)">km · ${p.label}</span>
            </div>
            ${p.km > 0 ? `
            <div id="km-place-${p.key}" style="font-size:12px;color:var(--text-2);margin-bottom:10px;min-height:17px">Ubicando tu punto en la carretera…</div>
            <div id="km-map-${p.key}" data-km="${p.km}" data-period="${p.key}"
              style="height:150px;border-radius:10px;overflow:hidden;background:var(--bg-input)"></div>
            ` : `
            <div style="font-size:12px;color:var(--text-3)">Sin carreras registradas todavía — ${p.label.toLowerCase()}.</div>
            `}
          </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:center;gap:6px;padding:4px 0 14px 0">
        ${periods.map((p,i) => `<span class="km-dot" data-idx="${i}" style="width:6px;height:6px;border-radius:99px;background:${i===0 ? 'var(--accent)' : 'var(--border)'};transition:background 0.2s"></span>`).join('')}
      </div>
    </div>`;
}

// Meta de "primera dominada libre" — Fase 2. Solo se muestra una vez
// que ya hay al menos un intento registrado, para no ensuciar el
// Dashboard antes de que empiece esa fase.
// ═══ LISTO PARA ENTRENAR — TARJETA VIVA ═══════════════════════════════
// Antes de tu sesión: cómo estás para entrenar. Después: tu recuperación
// subiendo en vivo, a qué hora estarás al 100% y cómo amanecerás mañana.
// El servidor calcula todo (getReadinessScore) con la hora exacta en que
// terminó tu última sesión; aquí solo se pinta, y se actualiza sola:
//  • cada 30 s se mueve la barra y los textos de tiempo (cálculo local);
//  • cada 5 min, o al volver a la app, se vuelve a pedir al servidor;
//  • al guardar tu check-in, al instante.
let _rdy = null, _rdyAt = 0, _rdyTimer = null, _rdyBusy = false, _rdyHooked = false, _rdyWhyOpen = false, _rdyEditing = false, _rdyRingDone = false;
// Último puntaje YA mostrado en pantalla. Sin esto, cada refresco
// volvía a animar el número desde cero — y como el refresco también se
// dispara al regresar a la app, parecía que la tarjeta se cargaba dos
// veces. Ahora la cuenta de cero es solo la primera vez; después anima
// del valor anterior al nuevo, y si no cambió no anima nada.
let _rdyShown = null;
const _rdyForm = { sleep: null, energy: null, acts: [], note: '' };
const _REST_ACTS = Utils.REST_ACTIVITIES;
const _ENERGY = [['😫', 'Sin energía'], ['😕', 'Baja'], ['😐', 'Normal'], ['🙂', 'Buena'], ['🤩', 'A tope']];
const _RDY_CFG = {
  alto:  { color: 'var(--accent)', hex: '#00FF87', emoji: '🟢', label: 'Alto' },
  medio: { color: '#F59E0B',       hex: '#F59E0B', emoji: '🟡', label: 'Medio' },
  bajo:  { color: '#EF4444',       hex: '#EF4444', emoji: '🔴', label: 'Bajo' },
};
const _TONE_COLOR = { bien: 'var(--accent)', ojo: '#F59E0B', mal: '#EF4444' };
const _RING_C = 2 * Math.PI * 26;

function _isRestDayToday() { return ((CONFIG.WEEK_PLAN || {})[new Date().getDay()] || {}).type === 'rest'; }

function _fmtHM(h) { const m = Math.max(0, Math.round(h * 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`; }
function _fmtClock(ms) {
  const d = new Date(ms), n = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
  const t = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : d.toLocaleDateString('es-MX', { weekday: 'long' })} a las ${t}`;
}

// Recuperación en este instante: parte de lo que dijo el servidor y suma el tiempo transcurrido desde entonces.
// Recibe la respuesta y el momento en que llegó — nunca depende de estado
// global: la primera vez que se pinta la tarjeta todavía no hay estado.
function _rdyLiveFor(r, at) {
  const rc = r && r.recovery; if (!rc) return null;
  const hs = rc.hoursSince + (Date.now() - at) / 3600000;
  return { hs, pct: Math.min(100, Math.round(hs / rc.needHours * 100)), left: Math.max(0, rc.needHours - hs) };
}
function _rdyLive() { return _rdyLiveFor(_rdy, _rdyAt); }

function _rdyMainHTML(r, at) {
  const cfg = _RDY_CFG[r.level] || _RDY_CFG.medio;
  const mode = r.mode || 'antes';
  const recov = mode !== 'antes' && r.recovery;
  const lv = recov ? _rdyLiveFor(r, at || Date.now()) : null;
  const comps = r.components || (r.reasons || []).map(t => ({ label: '', text: t, delta: 0, tone: 'bien' }));
  const tm = r.tomorrow ? (_RDY_CFG[r.tomorrow.level] || _RDY_CFG.medio) : null;
  const title = recov ? (mode === 'despues' ? 'Sesión completada · recuperándote' : 'Recuperándote de tu última sesión') : `Listo para entrenar: ${cfg.label}`;
  const sub = recov
    ? (lv.pct >= 100 ? 'Ya completaste tu tiempo de recuperación' : `Al 100% <b>${_fmtClock(r.recovery.readyAtMs)}</b> · faltan ~${_fmtHM(lv.left)}`)
    : comps.slice(0, 2).map(c => Utils.escapeHtml(c.text)).join(' · ');
  return `
    <div style="display:flex;align-items:center;gap:14px">
      <div style="position:relative;width:64px;height:64px;flex-shrink:0">
        <svg viewBox="0 0 64 64" width="64" height="64" style="transform:rotate(-90deg)">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--bg-input)" stroke-width="6"/>
          <circle id="rdy-ring" cx="32" cy="32" r="26" fill="none" stroke="${cfg.hex}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${_RING_C.toFixed(2)}" stroke-dashoffset="${(_RING_C * (1 - r.score / 100)).toFixed(2)}"/>
        </svg>
        <div id="rdy-score" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;color:${cfg.color}">${r.score}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;line-height:1.3">${recov ? '⏳ ' : cfg.emoji + ' '}${title}</div>
        <div id="rdy-sub" style="font-size:11px;color:var(--text-3);margin-top:3px;line-height:1.5">${sub}</div>
      </div>
    </div>
    ${recov ? `
    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3);margin-bottom:4px"><span>Recuperación estimada</span><span id="rdy-pct" style="font-weight:700;color:var(--text-1)">${lv.pct}%</span></div>
      <div style="height:7px;background:var(--bg-input);border-radius:99px;overflow:hidden"><div id="rdy-bar" style="height:100%;width:${lv.pct}%;border-radius:99px;background:linear-gradient(90deg, var(--purple), var(--accent));transition:width 0.6s ease"></div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;font-size:11px">
        <span style="padding:4px 10px;border-radius:99px;background:var(--bg-input)">Si entrenaras ahora: ${cfg.emoji} ${cfg.label} (${r.score})</span>
        ${tm ? `<span style="padding:4px 10px;border-radius:99px;background:var(--bg-input)">Mañana temprano: ${tm.emoji} ${tm.label} (${r.tomorrow.score})</span>` : ''}
      </div>
    </div>` : ''}
    <button class="btn btn-ghost btn-sm" style="margin-top:10px;padding:4px 0;font-size:11px;color:var(--text-3)" onclick="rdyToggleWhy()">¿Por qué este puntaje? <span id="rdy-why-arrow">${_rdyWhyOpen ? '▾' : '▸'}</span></button>
    <div id="rdy-why" style="display:${_rdyWhyOpen ? 'block' : 'none'};margin-top:6px">
      ${comps.map(c => `<div style="display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.5;margin-bottom:6px">
        <span style="flex-shrink:0;min-width:30px;text-align:center;padding:1px 6px;border-radius:99px;font-weight:700;background:var(--bg-input);color:${_TONE_COLOR[c.tone] || 'var(--text-2)'}">${c.delta > 0 ? '+' : ''}${c.delta}</span>
        <span style="color:var(--text-2)">${Utils.escapeHtml(c.text)}</span></div>`).join('')}
      <div style="font-size:10px;color:var(--text-4);line-height:1.5;margin-top:4px">El tiempo de recuperación es una estimación general (24–48 h según qué tan dura fue tu sesión), no tu fisiología exacta. Se actualiza solo con las horas, tu forma, tu sueño y tu energía.</div>
    </div>`;
}

function _rdyChip(label, active, fn, wide) {
  return `<button type="button" class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}" style="${wide ? 'padding:6px 10px' : 'min-width:32px;padding:6px 0'};font-size:12px" onclick="${fn}">${label}</button>`;
}

function _rdyCheckinHTML(r) {
  const missing = r.missing || [], rest = _isRestDayToday(), ck = r.checkin;
  const needSleep = missing.includes('sleep') || _rdyEditing, needEnergy = missing.includes('energy') || _rdyEditing;
  if (!needSleep && !needEnergy && !rest) {
    const bits = [ck && ck.sleep !== null && ck.sleep !== undefined ? `sueño ${ck.sleep}/10` : null, ck && ck.energy ? `energía ${ck.energy}/5` : null].filter(Boolean);
    return bits.length ? `<div style="margin-top:12px;font-size:11px;color:var(--text-3);display:flex;justify-content:space-between;align-items:center"><span>☀️ Check-in de hoy: ${bits.join(' · ')} ✓</span><button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px" onclick="rdyEditCheckin()">Editar</button></div>` : '';
  }
  return `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:12px;font-weight:700;margin-bottom:10px">${rest ? '🛌 Hoy toca descanso' : '☀️ Check-in de hoy'} <span style="font-weight:400;color:var(--text-3)">· 10 segundos, mejora tu puntaje y lo que aprende la app</span></div>
      ${needSleep ? `<div style="font-size:11px;color:var(--text-3);margin-bottom:6px">¿Cómo dormiste? (1 = fatal, 10 = perfecto)</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">${[1,2,3,4,5,6,7,8,9,10].map(n => _rdyChip(n, _rdyForm.sleep === n, `rdyPick('sleep',${n})`)).join('')}</div>` : ''}
      ${needEnergy ? `<div style="font-size:11px;color:var(--text-3);margin-bottom:6px">¿Con cuánta energía amaneciste?</div>
        <div style="display:flex;gap:6px;margin-bottom:12px">${_ENERGY.map(([e, l], i) => `<button type="button" class="btn btn-sm ${_rdyForm.energy === i + 1 ? 'btn-primary' : 'btn-secondary'}" style="flex:1;flex-direction:column;gap:2px;padding:6px 2px" onclick="rdyPick('energy',${i + 1})"><span style="font-size:18px">${e}</span><span style="font-size:9px">${l}</span></button>`).join('')}</div>` : ''}
      ${rest ? `<div style="font-size:11px;color:var(--text-3);margin-bottom:6px">¿Qué hiciste para recuperarte? (elige las que apliquen)</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">${_REST_ACTS.map((a, i) => _rdyChip(Utils.escapeHtml(a), _rdyForm.acts.includes(a), `rdyToggleAct(${i})`, true)).join('')}</div>
        <input class="input" id="rdy-note" maxlength="200" placeholder="Algo más que quieras anotar (opcional)" value="${Utils.escapeHtml(_rdyForm.note)}" oninput="_rdyForm.note=this.value" style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--text-4);margin-bottom:10px;line-height:1.5">El descanso de hoy cuenta como hecho automáticamente — esto solo ayuda a que el Coach conozca cómo te recuperas.</div>` : ''}
      <button class="btn btn-primary" id="rdy-save" style="width:100%" onclick="rdySaveCheckin()">Guardar</button>
    </div>`;
}

function _readinessHTML(readiness) {
  if (!readiness) return '';
  const cfg = _RDY_CFG[readiness.level] || _RDY_CFG.medio;
  return `
    <div class="card section" id="readiness-card" style="border-color:${cfg.hex}44">
      <div id="rdy-main">${_rdyMainHTML(readiness, Date.now())}</div>
      <div id="rdy-checkin">${_rdyCheckinHTML(readiness)}</div>
    </div>`;
}

function _rdySync(r) {
  _rdy = r; _rdyAt = Date.now();
  if (r.checkin) Utils.saveTodayCheckin(r.checkin);
  const ck = r.checkin || {};
  if (_rdyForm.sleep === null && ck.sleep != null) _rdyForm.sleep = ck.sleep;
  if (_rdyForm.energy === null && ck.energy != null) _rdyForm.energy = ck.energy;
  if (!_rdyForm.acts.length && ck.restActivities && ck.restActivities.length) _rdyForm.acts = ck.restActivities.slice();
  if (!_rdyForm.note && ck.restNote) _rdyForm.note = ck.restNote;
}

// Se llama una vez pintado el Dashboard: anima el aro y arranca las actualizaciones solas.
function _rdyMount(readiness) {
  if (!readiness || !document.getElementById('readiness-card')) return;
  _rdyWhyOpen = false; _rdyEditing = false;
  _rdySync(readiness);
  const primera = _rdyShown === null;
  const desde = primera ? 0 : _rdyShown;
  if (typeof gsap !== 'undefined' && desde !== readiness.score) {
    const ring = document.getElementById('rdy-ring'), num = document.getElementById('rdy-score');
    const dur = primera ? 1.2 : 0.5;   // el repintado es un ajuste, no una entrada
    const delay = primera ? 0.2 : 0;
    if (ring) gsap.fromTo(ring, { strokeDashoffset: _RING_C * (1 - desde / 100) },
      { strokeDashoffset: _RING_C * (1 - readiness.score / 100), duration: dur, ease: 'power3.out', delay });
    if (num) { const o = { v: desde }; gsap.to(o, { v: readiness.score, duration: dur, ease: 'power3.out', delay,
      onUpdate: () => { num.textContent = Math.round(o.v); }, onComplete: () => { num.textContent = readiness.score; } }); }
  }
  _rdyShown = readiness.score;
  clearInterval(_rdyTimer);
  _rdyTimer = setInterval(_rdyTick, 30000);
  if (!_rdyHooked) {
    _rdyHooked = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.getElementById('readiness-card')) _rdyRefresh(); });
  }
}

function _rdyTick() {
  if (!document.getElementById('readiness-card')) { clearInterval(_rdyTimer); _rdyTimer = null; return; }
  if (!_rdy) return;
  const lv = _rdyLive();
  if (Date.now() - _rdyAt > 5 * 60 * 1000 || (lv && lv.pct >= 100 && _rdy.mode !== 'antes')) return _rdyRefresh();
  if (!lv) return;
  const bar = document.getElementById('rdy-bar'), pct = document.getElementById('rdy-pct'), sub = document.getElementById('rdy-sub');
  if (bar) bar.style.width = lv.pct + '%';
  if (pct) pct.textContent = lv.pct + '%';
  if (sub && _rdy.recovery) sub.innerHTML = `Al 100% <b>${_fmtClock(_rdy.recovery.readyAtMs)}</b> · faltan ~${_fmtHM(lv.left)}`;
}

async function _rdyRefresh(animate) {
  if (_rdyBusy || !document.getElementById('readiness-card')) return;
  _rdyBusy = true;
  try {
    const r = await API.getReadinessScore();
    if (!r || r.score === undefined || !document.getElementById('readiness-card')) return;
    const prevLevel = _rdy && _rdy.level;
    _rdySync(r);
    const card = document.getElementById('readiness-card'), main = document.getElementById('rdy-main');
    if (card) card.style.borderColor = (_RDY_CFG[r.level] || _RDY_CFG.medio).hex + '44';
    if (main) main.innerHTML = _rdyMainHTML(r, _rdyAt);
    // El bloque de check-in solo se redibuja si cambió lo que falta — así nunca se borra lo que estás escribiendo.
    const ck = document.getElementById('rdy-checkin');
    if (ck && (animate || !ck.dataset.sig || ck.dataset.sig !== (r.missing || []).join(',') + '|' + (_rdyEditing ? 1 : 0))) {
      ck.innerHTML = _rdyCheckinHTML(r); ck.dataset.sig = (r.missing || []).join(',') + '|' + (_rdyEditing ? 1 : 0);
    }
    if (typeof gsap !== 'undefined' && (animate || prevLevel !== r.level)) {
      gsap.fromTo('#rdy-main', { opacity: 0.4, y: 4 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
      const ring = document.getElementById('rdy-ring');
      if (ring) gsap.fromTo(ring, { strokeDashoffset: _RING_C }, { strokeDashoffset: _RING_C * (1 - r.score / 100), duration: 0.9, ease: 'power3.out' });
    }
  } catch(e) { /* sin señal: se queda con lo último y reintenta en el siguiente ciclo */ }
  finally { _rdyBusy = false; }
}

function _rdyRepaintCheckin() { const ck = document.getElementById('rdy-checkin'); if (ck && _rdy) { ck.innerHTML = _rdyCheckinHTML(_rdy); ck.dataset.sig = (_rdy.missing || []).join(',') + '|' + (_rdyEditing ? 1 : 0); } }
function rdyToggleWhy() { _rdyWhyOpen = !_rdyWhyOpen; const w = document.getElementById('rdy-why'), a = document.getElementById('rdy-why-arrow'); if (w) w.style.display = _rdyWhyOpen ? 'block' : 'none'; if (a) a.textContent = _rdyWhyOpen ? '▾' : '▸'; if (_rdyWhyOpen && typeof gsap !== 'undefined' && w) gsap.from(w, { opacity: 0, y: -6, duration: 0.3 }); }
function rdyPick(kind, n) { Sounds.click(); _rdyForm[kind] = _rdyForm[kind] === n ? null : n; _rdyRepaintCheckin(); }
function rdyToggleAct(i) { Sounds.click(); const a = _REST_ACTS[i], k = _rdyForm.acts.indexOf(a); if (k >= 0) _rdyForm.acts.splice(k, 1); else _rdyForm.acts.push(a); _rdyRepaintCheckin(); }
function rdyEditCheckin() { _rdyEditing = true; _rdyRepaintCheckin(); }

async function rdySaveCheckin() {
  const rest = _isRestDayToday(), body = {};
  if (_rdyForm.sleep !== null) body.sleep = _rdyForm.sleep;
  if (_rdyForm.energy !== null) body.energy = _rdyForm.energy;
  if (rest && (_rdyForm.acts.length || _rdyForm.note.trim())) { body.restActivities = _rdyForm.acts; body.restNote = _rdyForm.note.trim(); }
  if (!Object.keys(body).length) { Toast.warning('Elige al menos una opción para guardar.'); return; }
  const btn = document.getElementById('rdy-save'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const res = await API.saveCheckin(body);
    if (res && res.success) {
      Sounds.serieDone(); Haptics.medium(); Toast.success('Check-in guardado ☀️');
      Utils.saveTodayCheckin({ sleep: _rdyForm.sleep, energy: _rdyForm.energy });
      _rdyEditing = false;
      API.clearCache();
      await _rdyRefresh(true);
      return;
    }
    Toast.warning((res && res.error) || 'No se pudo guardar el check-in.');
  } catch(e) { Toast.warning('Sin conexión — intenta de nuevo cuando tengas señal.'); }
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
}

function _pullUpMilestoneHTML(pullUp) {
  if (!pullUp || !pullUp.attempts) return '';
  if (pullUp.achieved) {
    // La celebración vive 14 días en el Dashboard; después queda en tus logros.
    const days = Math.round((new Date(Utils.today() + 'T00:00:00') - new Date(pullUp.achievedDate + 'T00:00:00')) / 86400000);
    if (days > 14) return '';
    return `
    <div class="card section" style="border-color:rgba(0,255,135,0.35);background:linear-gradient(135deg, rgba(0,255,135,0.08), transparent)">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:36px">🏆</div>
        <div>
          <div style="font-weight:800;font-size:15px;color:var(--accent)">¡Primera dominada libre lograda!</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px">${Utils.formatDate(pullUp.achievedDate)} · sin asistencia${pullUp.achievedReps > 1 ? ` · ${pullUp.achievedReps} repeticiones` : ''}</div>
        </div>
      </div>
    </div>`;
  }
  const prog = pullUp.lastAssist !== null && pullUp.firstAssist !== null
    ? `Vas en <b>${pullUp.lastAssist} ${pullUp.assistUnit}</b> de asistencia (empezaste con ${pullUp.firstAssist}). Cuando llegues a 0, es libre.`
    : `Intento #${pullUp.attempts} — todavía no, sigue así`;
  return `
    <div class="card section">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:32px">🎯</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px">Meta: primera dominada libre</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;line-height:1.5">${prog}</div>
        </div>
      </div>
    </div>`;
}

// Próximos logros con tu avance — para que se vea que la app sigue contando.
let _nextAch = [];
// ── MÚSICA POR DÍA DE ENTRENAMIENTO ────────────────────────────────────
// Se alimenta de la bitácora local de Spotify (js/spotify.js). Se oculta
// entera mientras no haya datos: una tarjeta vacía que dice "aún no hay
// nada" no aporta y le quita lugar a lo que sí importa.
// Las filas de MUSICA_SESION que trajo initDashboard. Vive aquí, como
// _nextAch, en vez de viajar como parámetro 15 de _renderDashboard.
let _musicRows = [];

// El saludo estaba escrito a mano como "Buenos días" y nunca cambiaba,
// aunque abrieras la app a las 11 de la noche.
function _saludo() {
  const h = new Date().getHours();
  if (h < 12) return '¡Buenos días';
  if (h < 19) return '¡Buenas tardes';
  return '¡Buenas noches';
}

function _musicByDayHTML() {
  if (typeof Spotify === 'undefined') return '';
  // Se arma con lo que está en el Sheet (la fuente de verdad, igual
  // desde cualquier dispositivo) más lo que este teléfono todavía no
  // ha subido — si no, justo después de entrenar la sesión de hoy no
  // aparecería hasta el siguiente envío.
  let rows = [];
  try {
    const delSheet = _musicRows || [];
    const pendientes = Spotify.getTrackLog?.() || [];
    rows = Spotify.topByDay({ limit: 3, entries: delSheet.concat(pendientes) }) || [];
  } catch (e) { return ''; }
  if (!rows.length) return '';

  const esc = Utils.escapeHtml;
  return `
    <div class="card section">
      <div class="card-header"><div>
        <div class="card-title">🎧 Lo que suena en cada entreno</div>
        <div class="card-subtitle">Lo más repetido en cada día del plan, según lo que de verdad sonó mientras entrenabas</div>
      </div></div>
      <div style="display:flex;flex-direction:column;gap:16px">
        ${rows.map(r => `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px">
              <span style="font-size:12px;font-weight:600">${r.icon} ${esc(r.label)}</span>
              <span style="font-size:10px;color:var(--text-4)">${r.total} registro${r.total === 1 ? '' : 's'}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${r.tracks.map((t, i) => `
                <div style="display:flex;align-items:center;gap:10px;font-size:12px">
                  <span style="color:var(--text-4);width:14px;text-align:right;flex-shrink:0">${i + 1}</span>
                  <div style="min-width:0;flex:1">
                    <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div>
                    <div style="font-size:10px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.artist)}</div>
                  </div>
                  <span style="font-size:10px;color:var(--text-4);flex-shrink:0">×${t.count}</span>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function _nextAchievementsHTML() {
  if (!_nextAch.length) return '';
  return `
    <div class="card section">
      <div class="card-header"><div><div class="card-title">🎯 Próximos logros</div><div class="card-subtitle">Lo que estás por desbloquear</div></div></div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${_nextAch.map(n => {
          const pct = n.binary ? 0 : Math.min(100, Math.round(n.current / n.target * 100));
          const nums = n.binary ? (n.hint || 'aún no') : `${Number(n.current).toLocaleString('es-MX')} / ${Number(n.target).toLocaleString('es-MX')}`;
          return `<div>
            <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:4px"><span>${n.icon} ${Utils.escapeHtml(n.label)}</span><span style="color:var(--text-3);text-align:right">${Utils.escapeHtml(nums)}</span></div>
            ${n.binary ? '' : `<div style="height:6px;background:var(--bg-input);border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;border-radius:99px;background:linear-gradient(90deg, var(--purple), var(--accent))"></div></div>`}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// Logros desbloqueados — fila de insignias con scroll horizontal, no
// ensucia el Dashboard cuando todavía no hay ninguno (se oculta
// entera). El detalle de cada uno sale al tocarlo.
function _achievementsHTML(achievements) {
  if (!achievements || !achievements.length) return '';
  return `
    <div class="card section">
      <div class="card-header">
        <div class="card-title">⭐ Logros (${achievements.length})</div>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">
        ${achievements.map(a => `
          <div onclick="Toast.success('${(a.detail || '').replace(/'/g, "\\'")}')" style="
            flex-shrink:0;width:72px;text-align:center;cursor:pointer;
            background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:10px 6px">
            <div style="font-size:26px">${a.icon}</div>
            <div style="font-size:9px;color:var(--text-3);margin-top:4px">${Utils.formatDate(a.date)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function Dashboard_onKmScroll(el) {
  const idx = Math.round(el.scrollLeft / el.clientWidth);
  el.parentElement.querySelectorAll('.km-dot').forEach((dot, i) => {
    dot.style.background = i === idx ? 'var(--accent)' : 'var(--border)';
  });
}

// Los mapas de Leaflet necesitan que su contenedor ya tenga tamaño
// real en el DOM — se inicializan después de que el HTML ya se pintó,
// igual que las gráficas de Chart.js más abajo.
// Los mapas de Leaflet necesitan que su contenedor ya tenga tamaño
// real en el DOM — se inicializan después de que el HTML ya se pintó,
// igual que las gráficas de Chart.js más abajo.
async function _initKmMaps() {
  if (typeof L === 'undefined') return;
  const card = document.getElementById('km-carousel'); if (!card) return;
  const homeLat = Number(card.dataset.homeLat), homeLng = Number(card.dataset.homeLng);
  const home = card.dataset.homeCity || 'tu casa';
  const els = Array.from(document.querySelectorAll('[id^="km-map-"]')).filter(el => !el.dataset.mapInit);
  if (!els.length) return;
  els.forEach(el => { el.dataset.mapInit = '1'; });
  let route; try { route = await _kmRoute(homeLat, homeLng); } catch(e) { return; }

  for (const el of els) {
    const km = Number(el.dataset.km) || 0;
    const { point, idx, beyond } = _kmPointAt(route, km);
    const done = route.pts.slice(0, idx + 1).concat([point]);
    try {
      const map = L.map(el.id, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false });
      // CARTO: mismo mapa base de OpenStreetMap, gratis y sin llave
      // (tile.openstreetmap.org bloquea el uso embebido en apps).
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 16 }).addTo(map);
      L.polyline(route.pts, { color: '#7C3AED', weight: 2, opacity: 0.35, dashArray: route.real ? null : '5,5' }).addTo(map); // la ruta completa, tenue
      L.polyline(done, { color: '#00FF87', weight: 4, opacity: 0.95 }).addTo(map);                                        // lo que ya recorriste
      L.circleMarker([homeLat, homeLng], { radius: 4, color: '#00FF87', fillColor: '#00FF87', fillOpacity: 1 }).addTo(map);
      L.circleMarker(point, { radius: 6, color: '#FFFFFF', weight: 2, fillColor: '#00FF87', fillOpacity: 1 }).addTo(map);
      map.fitBounds(L.latLngBounds(done).pad(0.35), { maxZoom: 14 });
    } catch(e) { /* un mapa que falle no tumba el Dashboard */ }

    const label = document.getElementById('km-place-' + el.dataset.period);
    if (!label) continue;
    const esc = Utils.escapeHtml;
    if (beyond) { label.innerHTML = `¡Ya recorriste toda la ruta de <b>${esc(home)}</b> hasta <b>Tijuana</b> por carretera!`; continue; }
    const name = await _kmPlaceName(point[0], point[1], km);
    label.innerHTML = name
      ? `Es como si hubieras corrido de <b>${esc(home)}</b> hasta <b>${esc(name)}</b> por carretera`
      : `Vas a ${Math.round(km)} km de ${esc(home)} por la carretera rumbo a CDMX`;
  }
}


async function initDashboard(container) {
  // Skeleton mientras carga
  container.innerHTML = `
    <div class="section">
      <div class="grid-4" style="margin-bottom:24px">
        ${[1,2,3,4].map(() => `<div class="skeleton" style="height:100px;border-radius:16px"></div>`).join('')}
      </div>
      <div class="grid-2">
        <div class="skeleton" style="height:280px;border-radius:16px"></div>
        <div class="skeleton" style="height:280px;border-radius:16px"></div>
      </div>
    </div>`;

  // Se piden sin caché — recién guardaste una sesión y necesitas ver
  // el dato fresco, no uno de hace 5 minutos.
  const [data, sesRes, recordsRes, metricsRes, cardioRes, streaksRes, overtrainingRes, insightsRes, profileRes, pullUpRes, achievementsRes, readinessRes, musicRes] = await Promise.all([
    API.getDashboard(),
    API.getSessions(30),
    API.getPersonalRecords(),
    API.getMetrics(),
    API.getCardio(30),
    API.getStreaks(),
    API.getOvertrainingStatus(),
    API.getAllInsights(),
    API.getProfile(),
    API.getPullUpMilestone(),
    API.getAchievements(),
    API.getReadinessScore(),
    API.getMusicLog(1500),
  ]);

  // Sesiones reales de esta semana (Lun-Dom), para marcar los días
  // correctos en "Plan de esta semana" — antes se adivinaba por fecha,
  // ahora se verifica contra lo que de verdad está guardado en el Sheet.
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  // Componentes locales, no toISOString() (evita el desfase de zona horaria)
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
  const weekSessions = (sesRes.sessions || []).filter(s => s.date >= mondayStr);
  const doneDayNames = new Set(weekSessions.map(s => s.day));

  // Última medición de METRICAS_CLAVE — para los objetivos de sprint,
  // dominadas, cadencia y dead hang (antes eran valores fijos de ejemplo).
  // metricsRes.history ya viene más-reciente-primero — [0] es lo último.
  const metricsHistory = metricsRes.history || [];
  // El último valor de CADA campo: con datos derivados de tus sesiones, la
  // fecha más reciente puede traer dead hang pero no sprint (o al revés).
  const latestMetrics = metricsHistory.length ? ['weight', 'pullUps', 'sprintSpeed', 'cadAvg', 'deadHang', 'plankMax'].reduce((acc, k) => {
    const h = metricsHistory.find(x => x[k] !== null && x[k] !== undefined); acc[k] = h ? h[k] : null; return acc;
  }, { date: metricsHistory[0].date }) : null;

  Store.set({ dashboard: data });
  _nextAch = (achievementsRes && achievementsRes.next) || [];
  _musicRows = (musicRes && musicRes.entries) || [];
  _renderDashboard(container, data, doneDayNames, recordsRes, sesRes.sessions || [], latestMetrics, cardioRes.sessions || [], streaksRes, overtrainingRes, insightsRes.insights || {}, profileRes.profile || {}, pullUpRes, achievementsRes.achievements || [], readinessRes);
}

function _renderDashboard(container, data, doneDayNames, records, allSessions, latestMetrics, allCardio, streaks, overtraining, insights, profile, pullUp, achievements, readiness) {
  _dashboardInsights = insights || {};
  const today     = new Date().getDay();
  const nextSes   = CONFIG.WEEK_PLAN[today] || CONFIG.WEEK_PLAN[(today + 1) % 7];
  const goals     = CONFIG.GOALS;
  const thisWeek  = data.thisWeek || { sessions: 0, target: 6, calories: 0, volume: 0 };
  const weekPct   = Math.round((thisWeek.sessions / thisWeek.target) * 100);
  const lastSes   = data.lastSession || {};
  // Combina fuerza + cardio correctamente para calorías y volumen —
  // antes "thisWeek.calories" (del backend) solo sumaba fuerza, y las
  // dos tarjetas no tenían comparativo contra la semana pasada.
  const wc = _weeklyComparison(allSessions, allCardio);
  const rec       = data.recentRecovery || { delta: -14 };
  const recClass  = rec.delta <= -10 ? 'up' : rec.delta <= -5 ? 'flat' : 'down';

  container.innerHTML = `
  <!-- Bienvenida -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
    <div>
      <h1 style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#fff,#B4B2CC);-webkit-background-clip:text;-webkit-text-fill-color:transparent">
        ${_saludo()}, Diego 💪
      </h1>
      <p style="color:var(--text-3);font-size:13px;margin-top:4px">
        ${Utils.formatDate(Utils.today())} · ${data.weekStreak || 0} días de racha · ${CONFIG.CURRENT_PHASE.name}
      </p>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-lg" onclick="Router.navigate('workout')" style="gap:8px">
        <span>⚡</span> Iniciar Sesión
      </button>
      <button class="btn btn-secondary btn-icon btn-lg" onclick="Router.navigate('plan')" title="Ver plan">📅</button>
    </div>
  </div>

  ${_readinessHTML(readiness)}

  <!-- Consejo del Coach IA — resumen corto de solo lectura, se genera
       únicamente con el botón del módulo Coach IA -->
  <div class="card card-accent section" style="display:flex;gap:14px;align-items:flex-start;cursor:pointer" id="coach-insight-card" onclick="Router.navigate('coach')">
    <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-glow);
      display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤖</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">
        Tu coach personal
      </div>
      <div style="font-size:13px;color:var(--text-1);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical" id="coach-insight-text">${data.dashboardInsight ? Utils.truncate(Utils.stripMarkdown(data.dashboardInsight), 160) : 'Sin consejo generado todavía — ve al módulo Coach IA y genera el de hoy.'}</div>
      <div style="font-size:11px;color:var(--accent);font-weight:600;margin-top:6px">${data.dashboardInsight ? 'Ver análisis completo →' : 'Ir a generar consejo →'}</div>
    </div>
  </div>

  <!-- KPI Cards -->
  <div class="grid-4 section">
    <!-- Semana actual -->
    <div class="metric-card" style="--accent-color:var(--accent)">
      <div class="metric-label">Esta semana</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin:8px 0">
        <span class="metric-value accent">${thisWeek.sessions}</span>
        <span style="color:var(--text-3);font-size:16px">/ ${thisWeek.target}</span>
      </div>
      <div class="progress-bar" style="margin-bottom:8px">
        <div class="progress-fill" style="width:${weekPct}%"></div>
      </div>
      <div style="font-size:11px;color:var(--text-3)">${weekPct}% completado · ${thisWeek.target - thisWeek.sessions} sesiones restantes</div>
    </div>

    <!-- Recuperación cardíaca -->
    <div class="metric-card" style="--accent-color:var(--z${rec.delta <= -10 ? 2 : rec.delta <= -5 ? 3 : 5})">
      <div class="metric-label">Recuperación FC</div>
      <div style="display:flex;align-items:baseline;gap:4px;margin:8px 0">
        <span class="metric-value" style="color:${rec.delta <= -10 ? 'var(--success)' : rec.delta <= -5 ? 'var(--warning)' : 'var(--danger)'}">${rec.delta}</span>
        <span class="metric-unit">bpm / 2min</span>
      </div>
      <div class="metric-delta ${recClass}">
        ${rec.delta <= -10 ? '🔥 Récord personal' : rec.delta <= -5 ? '📈 Mejorando' : '📊 En desarrollo'}
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:6px">Objetivo: -20 bpm · ${Utils.formatDateShort(rec.date)}</div>
    </div>

    <!-- Última sesión -->
    <div class="metric-card" style="--accent-color:var(--purple-light)">
      <div class="metric-label">Última sesión</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin:8px 0">
        <span class="metric-value" style="color:var(--purple-light)">${lastSes.fcAvg || '—'}</span>
        <span class="metric-unit">bpm FC prom</span>
      </div>
      <div class="metric-delta flat">${lastSes.type || '—'} · ${Utils.formatDateShort(lastSes.date)}</div>
      <div style="font-size:11px;color:var(--text-3);margin-top:6px">
        ${Utils.formatDuration(lastSes.duration)}${lastSes.calories !== null && lastSes.calories !== undefined ? ` · ${lastSes.calories} kcal` : ''}${lastSes.effort !== null && lastSes.effort !== undefined ? ` · esfuerzo ${lastSes.effort}/10` : ''}
      </div>
    </div>

    <!-- Calorías semana — ahora suma fuerza Y cardio (antes solo fuerza) -->
    <div class="metric-card" style="--accent-color:var(--warning)">
      <div class="metric-label">Calorías activas</div>
      <div style="display:flex;align-items:baseline;gap:4px;margin:8px 0">
        <span class="metric-value" style="color:var(--warning)">${Utils.formatNum(wc.thisWeek.calories)}</span>
        <span class="metric-unit">kcal</span>
      </div>
      ${wc.lastWeek.calories > 0 ? `
      <div class="metric-delta ${wc.thisWeek.calories >= wc.lastWeek.calories ? 'up' : 'down'}">
        ${wc.thisWeek.calories >= wc.lastWeek.calories ? '↑' : '↓'} ${Utils.formatNum(Math.abs(wc.thisWeek.calories - wc.lastWeek.calories))} kcal vs. semana pasada
      </div>` : `
      <div class="metric-delta ${wc.thisWeek.calories > 500 ? 'up' : 'flat'}">
        ${wc.thisWeek.calories > 1000 ? '🔥 Excelente semana' : wc.thisWeek.calories > 500 ? '💪 Buen ritmo' : '📅 Empieza la semana'}
      </div>`}
      <div style="font-size:11px;color:var(--text-3);margin-top:6px">Esta semana</div>
    </div>

    <!-- Volumen semana — antes vivía pegado a la tarjeta de calorías,
         sin relación entre sí; ahora tiene su propio espacio y comparativo -->
    <div class="metric-card" style="--accent-color:var(--purple-light)">
      <div class="metric-label">Volumen movido</div>
      <div style="display:flex;align-items:baseline;gap:4px;margin:8px 0">
        <span class="metric-value" style="color:var(--purple-light)">${Utils.formatNum(wc.thisWeek.volume)}</span>
        <span class="metric-unit">kg</span>
      </div>
      ${wc.lastWeek.volume > 0 ? `
      <div class="metric-delta ${wc.thisWeek.volume >= wc.lastWeek.volume ? 'up' : 'down'}">
        ${wc.thisWeek.volume >= wc.lastWeek.volume ? '↑' : '↓'} ${Utils.formatNum(Math.abs(wc.thisWeek.volume - wc.lastWeek.volume))} kg vs. semana pasada
      </div>` : ''}
      <div style="font-size:11px;color:var(--text-3);margin-top:6px">Esta semana</div>
    </div>
  </div>

  ${_achievementsHTML(achievements)}
  ${_nextAchievementsHTML()}
  ${_musicByDayHTML()}
  ${_pullUpMilestoneHTML(pullUp)}
  ${_kmCarouselHTML(data.distanceStats, profile)}

  <!-- Fila principal -->
  <div class="grid-2 section">

    <!-- Objetivos del programa -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Objetivos del programa</div>
          <div class="card-subtitle">${CONFIG.CURRENT_PHASE.name}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Router.navigate('metrics')">Ver más →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${Object.entries(goals).map(([key, g]) => {
          const current = key === 'hrRecovery'
            ? (records.fcRecovery?.value ?? rec.delta ?? null)
            : key === 'plank'
              ? (records.plankMax?.value || null)
              : _getCurrentGoalValue(key, latestMetrics, records);
          const baseline = CONFIG.BASELINE[_baselineKey(key)] ?? g.target * 0.5;
          const hasData = current !== null && current !== undefined;
          const pct = key === 'hrRecovery'
            ? Utils.progress(current ?? -5, -5, -20)
            : hasData ? Utils.progress(current, baseline, g.target) : 0;
          const color = _goalColor(key);
          // Con un rango grande (ej. 12→20 km/h) un avance real chico se
          // ve como 3-5% — casi invisible. Se pone un piso mínimo visible
          // para que se note que SÍ hay progreso, no que la barra está rota.
          const displayPct = (hasData || key === 'hrRecovery') ? Math.max(pct, 4) : 100;
          return `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:12px;font-weight:500;color:var(--text-2)">${g.label}</span>
              ${hasData ? `
              <div style="display:flex;align-items:baseline;gap:4px">
                <span style="font-weight:700;font-size:14px;color:${color}">${current}</span>
                <span style="font-size:11px;color:var(--text-3)">${g.unit}</span>
                <span style="font-size:11px;color:var(--text-4)">/ ${g.target}</span>
              </div>` : `
              <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:10px;color:var(--text-4)" onclick="Router.navigate('metrics')">
                Sin datos — Registrar →
              </button>`}
            </div>
            <div class="progress-bar">
              <div style="height:100%;border-radius:9999px;background:${hasData || key==='hrRecovery' ? color : 'var(--text-4)'};opacity:${hasData || key==='hrRecovery' ? 1 : 0.25};width:${hasData || key==='hrRecovery' ? displayPct : 100}%;transition:width 1s cubic-bezier(0.4,0,0.2,1);box-shadow:${hasData || key==='hrRecovery' ? `0 0 8px ${color}66` : 'none'}"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Próxima sesión + plan semana -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Plan de esta semana</div>
          <div class="card-subtitle">Semana ${CONFIG.CURRENT_PHASE.currentWeek} · 6 días</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Router.navigate('plan')">Ver plan →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${[1,2,3,4,5,6,0].map(day => {
          const info = CONFIG.WEEK_PLAN[day];
          const dayName = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][day];
          const dayFullName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][day];
          const isToday = day === today;
          const isDone  = doneDayNames.has(dayFullName);
          return `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:10px;
            background:${isToday ? 'var(--accent-glow)' : 'transparent'};
            border:1px solid ${isToday ? 'var(--border-accent)' : 'transparent'};
            transition:all 0.2s;cursor:${info.type !== 'rest' ? 'pointer' : 'default'}"
            ${info.type !== 'rest' ? `onclick="Router.navigate('workout')"` : ''}
            onmouseenter="if('${info.type}' !== 'rest') this.style.background='var(--bg-card-hover)'"
            onmouseleave="this.style.background='${isToday ? 'var(--accent-glow)' : 'transparent'}'">
            <div style="width:36px;height:36px;border-radius:8px;background:${info.color}22;
              display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">
              ${isDone ? '✅' : info.icon}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:${isToday ? 'var(--accent)' : isDone ? 'var(--text-3)' : 'var(--text-1)'};
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${info.name}</div>
              <div style="font-size:10px;color:var(--text-4)">${dayName}${isToday ? ' · HOY' : ''}</div>
            </div>
            ${isToday ? `<span style="font-size:10px;background:var(--accent);color:var(--bg-primary);padding:2px 8px;border-radius:99px;font-weight:700">HOY</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Roadmap de las 12 semanas del programa -->
  <div class="card section">
    <div class="card-header">
      <div>
        <div class="card-title">🗺️ Roadmap del programa</div>
        <div class="card-subtitle">${CONFIG.PROGRAM_WEEKS} semanas · vas en la ${CONFIG.CURRENT_PHASE.currentWeek}</div>
      </div>
    </div>
    <div style="display:flex;gap:4px;margin-bottom:14px">
      ${Array.from({length: CONFIG.PROGRAM_WEEKS}, (_, i) => i + 1).map(week => {
        const phase = CONFIG.PROGRAM_PHASES.find(p => week >= p.startWeek && week <= p.endWeek);
        const isPast = week < CONFIG.CURRENT_PHASE.currentWeek;
        const isCurrent = week === CONFIG.CURRENT_PHASE.currentWeek;
        const pending = phase?.pending;
        return `
        <div style="flex:1;text-align:center" title="${pending ? 'Fase por definir' : (phase?.name || '')}">
          <div style="height:8px;border-radius:4px;margin-bottom:5px;
            background:${pending ? 'transparent' : isCurrent ? 'var(--accent)' : isPast ? 'var(--accent)' : 'var(--bg-input)'};
            opacity:${pending ? 1 : isCurrent ? 1 : isPast ? 0.55 : 0.3};
            border:${pending ? '1px dashed var(--border)' : 'none'};
            ${isCurrent ? 'box-shadow:0 0 10px var(--accent);animation:pulse-glow 2s infinite;' : ''}"></div>
          <div style="font-size:9px;color:${isCurrent ? 'var(--accent)' : 'var(--text-4)'};font-weight:${isCurrent ? '700' : '500'}">${week}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${CONFIG.PROGRAM_PHASES.map(phase => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
          background:${phase.pending ? 'transparent' : 'var(--bg-input)'};
          border:${phase.pending ? '1px dashed var(--border)' : 'none'}">
          <div style="width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
            background:${phase.pending ? 'transparent' : 'var(--accent-glow)'};
            border:${phase.pending ? '1px dashed var(--text-4)' : 'none'};
            font-size:12px;font-weight:700;color:${phase.pending ? 'var(--text-4)' : 'var(--accent)'}">${phase.number ?? '?'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:${phase.pending ? 'var(--text-3)' : 'var(--text-1)'}">
              ${phase.pending ? 'Por definir' : `Fase ${phase.number} — ${phase.name}`}
              <span style="font-weight:400;color:var(--text-4)"> · Sem ${phase.startWeek}-${phase.endWeek}</span>
            </div>
            ${phase.focus ? `<div style="font-size:10px;color:var(--text-3)">${phase.focus}</div>` : ''}
          </div>
          ${(CONFIG.CURRENT_PHASE.currentWeek >= phase.startWeek && CONFIG.CURRENT_PHASE.currentWeek <= phase.endWeek) ? `
          <span style="font-size:9px;background:var(--accent);color:var(--bg-primary);padding:3px 8px;border-radius:99px;font-weight:700;flex-shrink:0">AQUÍ</span>` : ''}
        </div>`).join('')}
    </div>
  </div>

  <!-- Rachas y estado de recuperación -->
  <div class="grid-2 section">

    <!-- Rachas y consistencia -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">🔥 Rachas</div>
        ${_infoBtn('racha')}
      </div>
      <div class="grid-2" style="gap:10px;margin-bottom:14px">
        <div style="background:var(--bg-input);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:26px;font-weight:800;color:${streaks.currentStreak > 0 ? 'var(--accent)' : 'var(--text-3)'}">${streaks.currentStreak}</div>
          <div style="font-size:10px;color:var(--text-3)">racha actual</div>
        </div>
        <div style="background:var(--bg-input);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:26px;font-weight:800;color:var(--text-1)">${streaks.longestStreak}</div>
          <div style="font-size:10px;color:var(--text-3)">racha más larga</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:6px">
        <span>Esta semana</span>
        <span style="color:var(--text-2);font-weight:600">${streaks.weeklyTrained}/${streaks.weeklyPlanned} días</span>
      </div>
      <div style="height:6px;background:var(--bg-input);border-radius:99px;overflow:hidden">
        <div style="height:100%;background:var(--accent);border-radius:99px;width:${Math.min(100, Math.round(streaks.weeklyTrained / Math.max(streaks.weeklyPlanned,1) * 100))}%"></div>
      </div>
    </div>

    <!-- Estado de recuperación / sobreentrenamiento -->
    <div class="card" style="${overtraining.level === 'alerta' ? 'border-color:rgba(239,68,68,0.4)' : overtraining.level === 'atencion' ? 'border-color:rgba(245,158,11,0.4)' : ''}">
      <div class="card-header">
        <div class="card-title">
          ${overtraining.level === 'alerta' ? '🚨' : overtraining.level === 'atencion' ? '⚠️' : '✅'} Estado de recuperación
        </div>
      </div>
      ${overtraining.flags.length === 0 ? `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0">
          <span style="font-size:24px">💪</span>
          <div style="font-size:12px;color:var(--text-2)">Sin señales de sobrecarga — tus datos recientes se ven bien.</div>
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${overtraining.flags.map(f => `
            <div style="display:flex;gap:8px;font-size:11px;color:var(--text-2);line-height:1.5;background:var(--bg-input);border-radius:8px;padding:8px 10px">
              <span style="flex-shrink:0">${overtraining.level === 'alerta' ? '🚨' : '⚠️'}</span>
              <span>${f.text}</span>
            </div>`).join('')}
        </div>
        <div style="font-size:10px;color:var(--text-3);margin-top:10px">
          ${overtraining.level === 'alerta' ? 'Varias señales a la vez — considera un día de descarga.' : 'Una señal aislada — vale la pena tenerla en cuenta.'}
        </div>`}
    </div>

  </div>

  <!-- Fila secundaria -->
  <div class="grid-2 section">

    <!-- Récords personales -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">🏆 Récords Personales</div>
        <button class="btn btn-ghost btn-sm" onclick="Router.navigate('metrics')">Historial →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:0">
        ${_realRecordsList(records).map(r => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:20px;width:28px;text-align:center">${r.icon}</span>
            <div style="flex:1">
              <div style="font-size:12px;color:var(--text-3)">${r.label}</div>
              <div style="font-size:11px;color:var(--text-4)">${r.sub}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;font-size:14px;color:${r.color}">${r.value}</div>
              <div style="font-size:10px;color:var(--text-4)">${r.date}</div>
            </div>
          </div>`).join('')}
        <div style="border-bottom:none!important"></div>
      </div>
    </div>

    <!-- Evolución FC fuerza (mini chart) -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Tendencia cardiovascular</div>
          <div class="card-subtitle">FC promedio en fuerza · histórico</div>
        </div>
      </div>
      <div style="position:relative;height:160px;width:100%;overflow:hidden;flex-shrink:0">
        <canvas id="fc-trend-chart" style="display:block"></canvas>
      </div>
      <div id="fc-trend-footer" style="display:flex;justify-content:space-between;margin-top:16px"></div>
    </div>

  </div>

  <!-- Comparativa semanal — esta semana vs. la pasada -->
  ${(() => {
    const rows = [
      { label: 'Sesiones', unit: '', this: wc.thisWeek.sessions, last: wc.lastWeek.sessions, higherIsBetter: true, icon: '📅' },
      { label: 'Volumen movido', unit: 'kg', this: wc.thisWeek.volume, last: wc.lastWeek.volume, higherIsBetter: true, icon: '🏋️' },
      { label: 'FC promedio', unit: 'bpm', this: wc.thisWeek.avgFC, last: wc.lastWeek.avgFC, higherIsBetter: false, icon: '❤️' },
      { label: 'Esfuerzo promedio', unit: '/10', this: wc.thisWeek.avgEffort, last: wc.lastWeek.avgEffort, higherIsBetter: null, icon: '💦' },
    ];
    return `
    <div class="card section">
      <div class="card-header">
        <div>
          <div class="card-title">📈 Esta semana vs. la pasada</div>
          <div class="card-subtitle">Comparativa automática, sin IA — cálculo directo de tus datos</div>
        </div>
        ${_infoBtn('comparativa_semanal')}
      </div>
      <div class="grid-4" style="gap:10px">
        ${rows.map(r => {
          const hasBoth = r.this !== null && r.this !== undefined && r.last !== null && r.last !== undefined;
          const delta = hasBoth ? Math.round((r.this - r.last) * 10) / 10 : null;
          const isGood = delta !== null && r.higherIsBetter !== null && (r.higherIsBetter ? delta > 0 : delta < 0);
          const isBad  = delta !== null && r.higherIsBetter !== null && (r.higherIsBetter ? delta < 0 : delta > 0);
          return `
          <div style="background:var(--bg-input);border-radius:10px;padding:12px">
            <div style="font-size:10px;color:var(--text-3);margin-bottom:4px">${r.icon} ${r.label}</div>
            <div style="font-size:18px;font-weight:700;color:var(--text-1)">${r.this ?? '—'}<span style="font-size:10px;color:var(--text-3)"> ${r.unit}</span></div>
            <div style="font-size:10px;color:var(--text-4);margin-top:2px">Pasada: ${r.last ?? '—'} ${r.unit}</div>
            ${delta !== null ? `
            <div style="font-size:10px;font-weight:600;margin-top:3px;color:${isGood ? 'var(--success)' : isBad ? 'var(--danger)' : 'var(--text-4)'}">${delta >= 0 ? '↑ +' : '↓ '}${Math.abs(delta)} vs. semana pasada</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  })()}

  <!-- Quick Actions -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Acciones rápidas</div>
    </div>
    <div class="grid-4">
      ${[
        { icon:'💪', label:'Sesión de fuerza', sub:'Registrar ejercicios', page:'workout', color:'var(--purple)' },
        { icon:'🏃', label:'Cardio / HIT',     sub:'Timer + zonas',        page:'cardio',  color:'var(--danger)' },
        { icon:'📊', label:'Métricas clave',   sub:'Ver progreso',         page:'metrics', color:'var(--accent)' },
        { icon:'📚', label:'Bitácora',         sub:'Historial completo',   page:'history', color:'var(--cyan)' },
      ].map(a => `
        <div onclick="Router.navigate('${a.page}')" style="
          background:var(--bg-card);
          border:1px solid var(--border-card);
          border-radius:16px;
          padding:20px;
          cursor:pointer;
          transition:all 0.2s;
          display:flex;align-items:center;gap:14px"
          onmouseenter="this.style.cssText+='border-color:var(--border);transform:translateY(-2px);box-shadow:var(--shadow-md)'"
          onmouseleave="this.style.cssText='background:var(--bg-card);border:1px solid var(--border-card);border-radius:16px;padding:20px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:14px'">
          <div style="width:44px;height:44px;border-radius:12px;background:${a.color}22;
            display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;
            box-shadow:0 0 12px ${a.color}33">
            ${a.icon}
          </div>
          <div>
            <div style="font-weight:600;font-size:13px">${a.label}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">${a.sub}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;

  // Entrada en cascada — cada .section aparece con un retraso creciente
  // sobre la anterior. 90ms entre cada una (antes 60ms, se sentía más
  // como un parpadeo que como una cascada) y tope en 630ms — con la
  // animación de 550ms cada una, la cascada completa dura ~1.2s: se
  // alcanza a apreciar sin que abrir la app se sienta lento.
  Motion.staggerIn(container.querySelectorAll('.section'));

  // Renderizar chart FC tendencia — esperar a que el DOM esté pintado
  setTimeout(() => _renderFCChart(allSessions), 100);
  setTimeout(() => _initKmMaps(), 100);
  _rdyMount(readiness); // tarjeta de "listo para entrenar": aro animado + actualización automática

  // Pull-to-refresh — mismo efecto que el botón de sincronizar de la
  // barra lateral, pero con el gesto nativo de "jalar para refrescar".
  Gestures.enablePullToRefresh(container, async () => {
    API.clearCache();
    await initDashboard(container);
  });
}

// Construye la lista de récords reales — si no hay datos suficientes
// en el Sheet todavía, lo dice claramente en vez de mostrar algo falso.
function _realRecordsList(records) {
  const list = [];
  if (records?.fcRecovery?.value !== null && records?.fcRecovery?.value !== undefined) {
    list.push({ icon:'❤️', label:'Mejor recuperación FC', value:`${records.fcRecovery.value} bpm`, date:Utils.formatDateShort(records.fcRecovery.date), color:'var(--success)', sub:'2 min post-esfuerzo' });
  }
  if (records?.cadencePeak?.value > 0) {
    list.push({ icon:'🦵', label:'Pico de cadencia', value:`${records.cadencePeak.value} spm`, date:Utils.formatDateShort(records.cadencePeak.date), color:'var(--purple-light)', sub:'Sesión de cardio' });
  }
  if (records?.z3Time?.value > 0) {
    list.push({ icon:'⏱', label:'Mayor tiempo en Z3+', value:`${records.z3Time.value} min`, date:Utils.formatDateShort(records.z3Time.date), color:'var(--warning)', sub:'Zona cardiovascular alta' });
  }
  if (records?.sessionVolume?.value > 0) {
    list.push({ icon:'🏋️', label:'Mayor volumen sesión', value:`${Utils.formatNum(records.sessionVolume.value)} kg`, date:Utils.formatDateShort(records.sessionVolume.date), color:'var(--cyan)', sub:'Fuerza' });
  }
  if (records?.plankMax?.value > 0) {
    list.push({ icon:'📏', label:'Plancha máxima', value:`${records.plankMax.value} seg`, date:Utils.formatDateShort(records.plankMax.date), color:'var(--info)', sub:'Isométrica' });
  }
  if (list.length === 0) {
    return [{ icon:'🎯', label:'Sin récords todavía', value:'—', date:'', color:'var(--text-3)', sub:'Completa sesiones para ver tus marcas aquí' }];
  }
  return list;
}

// ── BOTÓN DE INFO (mismo estándar que Metrics) ─────────────────────────────
// dashboard.js no usa el patrón de módulo IIFE de los demás archivos —
// aquí todo son funciones globales, así que _dashboardInsights vive
// como variable de nivel superior en vez de estado privado.
let _dashboardInsights = {};

function _infoBtn(key) {
  return `<button class="btn btn-ghost btn-icon" style="width:26px;height:26px;font-size:13px;flex-shrink:0" onclick="showDashboardInsight('${key}')" title="Ver qué muestra esta tarjeta">ℹ️</button>`;
}

const _dashboardChartInfo = {
  racha: { title: '🔥 Rachas', desc: 'Días seguidos entrenando (fuerza o cardio) — la racha sigue viva aunque hoy todavía no hayas entrenado, solo se rompe si pasa más de un día.' },
  comparativa_semanal: { title: '📈 Esta semana vs. la pasada', desc: 'Sesiones, volumen, FC promedio y esfuerzo — comparado directo contra la semana anterior, calculado de tus datos sin usar IA.' },
};

function showDashboardInsight(key) {
  Sounds.click();
  const info = _dashboardChartInfo[key] || { title: 'Interpretación', desc: '' };
  const insight = _dashboardInsights[key];

  const body = `
    ${info.desc ? `<div style="font-size:12px;color:var(--text-3);line-height:1.6;margin-bottom:${insight && insight.texto ? '14px' : '0'}">${info.desc}</div>` : ''}
    ${insight && insight.texto ? `
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:10px;font-weight:600;color:var(--accent);margin-bottom:6px">🤖 LO QUE DICE EL COACH</div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.6">${insight.texto}</div>
        <div style="font-size:10px;color:var(--text-4);margin-top:10px">Generado el ${Utils.formatDate(insight.fecha)}</div>
      </div>
    ` : `
      <div style="border-top:1px solid var(--border);padding-top:12px;text-align:center">
        <div style="font-size:11px;color:var(--text-3)">Sin interpretación personalizada todavía — genera el consejo de hoy en Coach IA.</div>
      </div>`}`;

  Utils.showInfoModal(info.title, body);
}

function _renderFCChart(allSessions) {
  const canvas = document.getElementById('fc-trend-chart');
  const footer = document.getElementById('fc-trend-footer');
  if (!canvas || !window.Chart) return;

  // Destruir instancia previa si existe
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  // Sesiones de fuerza con FC registrada, en orden cronológico
  // (allSessions llega más reciente primero, hay que invertir).
  const strengthSessions = (allSessions || [])
    .filter(s => s.type === 'Fuerza' && s.fcAvg)
    .slice().reverse();

  if (strengthSessions.length === 0) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.offsetWidth || 400;
    canvas.height = 160;
    ctx.font = '12px Poppins';
    ctx.fillStyle = '#6E6D8A';
    ctx.textAlign = 'center';
    ctx.fillText('Sin sesiones con FC registrada todavía', canvas.width / 2, canvas.height / 2);
    if (footer) footer.innerHTML = `<div style="font-size:11px;color:var(--text-4);text-align:center;width:100%">Captura FC promedio al terminar una sesión para ver tu tendencia aquí</div>`;
    return;
  }

  const recent = strengthSessions.slice(-8); // últimas 8 para no saturar la gráfica
  const labels = recent.map(s => Utils.formatDateShort(s.date));
  const values = recent.map(s => s.fcAvg);

  // Forzar dimensiones antes de que Chart.js las lea. Nunca debe pasar
  // del ancho real de la pantalla — si la medición del contenedor
  // falla y cae al valor por defecto, ese valor puede ser más ancho
  // que un iPhone y rompe la página con scroll horizontal.
  const parent = canvas.parentElement;
  const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : 160;
  const wRaw = (parent && parent.offsetWidth  > 0) ? parent.offsetWidth  : 400;
  const w = Math.min(wRaw, document.documentElement.clientWidth - 48);
  canvas.width  = w;
  canvas.height = h;

  const minVal = Math.min(...values), maxVal = Math.max(...values);
  const yMin = Math.max(0, minVal - 10), yMax = maxVal + 10;

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239,68,68,0.08)',
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: values.map(v => v <= (minVal + (maxVal-minVal)*0.3) ? '#00FF87' : '#EF4444'),
        pointBorderColor: 'transparent',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      layout: { padding: { top: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#13131F',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#B4B2CC',
          bodyColor: '#FFFFFF',
          callbacks: { label: ctx => `${ctx.raw} bpm` }
        }
      },
      scales: {
        x: {
          ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 7 },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { display: false }
        },
        y: {
          min: yMin, max: yMax,
          ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' }, callback: v => v + ' bpm', maxTicksLimit: 4 },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { display: false }
        }
      }
    }
  });

  // Footer con datos reales: primera sesión registrada vs la más reciente
  if (footer) {
    const first = strengthSessions[0].fcAvg;
    const today = strengthSessions[strengthSessions.length - 1].fcAvg;
    const mejora = Math.round((today - first) * 10) / 10;
    footer.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--text-4)">Primera sesión</div>
        <div style="font-size:20px;font-weight:700;color:var(--danger)">${first}</div>
        <div style="font-size:10px;color:var(--text-4)">bpm</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--text-4)">Más reciente</div>
        <div style="font-size:20px;font-weight:700;color:var(--success)">${today}</div>
        <div style="font-size:10px;color:var(--text-4)">bpm</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--text-4)">Objetivo</div>
        <div style="font-size:20px;font-weight:700;color:var(--accent)">120</div>
        <div style="font-size:10px;color:var(--text-4)">bpm</div>
      </div>
      <div style="text-align:center;background:var(--accent-glow);border:1px solid var(--border-accent);border-radius:10px;padding:8px 14px">
        <div style="font-size:11px;color:var(--accent)">Cambio</div>
        <div style="font-size:20px;font-weight:700;color:var(--accent)">${mejora >= 0 ? '+' : ''}${mejora}</div>
        <div style="font-size:10px;color:var(--accent)">bpm</div>
      </div>`;
  }
}

// Helpers
// Comparativa esta semana vs. la pasada — cálculo puro con datos que ya
// tenemos en memoria, sin llamar a Gemini ni al Sheet de nuevo.
function _weeklyComparison(allSessions, allCardio) {
  const now = new Date();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  thisMonday.setHours(0,0,0,0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const thisMondayStr = fmt(thisMonday);
  const lastMondayStr = fmt(lastMonday);

  const all = [...(allSessions || []), ...(allCardio || [])];
  const thisWeek = all.filter(s => s.date >= thisMondayStr);
  const lastWeek = all.filter(s => s.date >= lastMondayStr && s.date < thisMondayStr);

  const summarize = (rows) => {
    const withFC = rows.filter(r => r.fcAvg);
    const withVol = rows.filter(r => r.volume);
    const withEffort = rows.filter(r => r.effort);
    // Las calorías vienen con nombre de campo distinto según la fuente
    // — "calories" en sesiones de fuerza (getSessions), "caloriasActivas"
    // en cardio (getCardio). Este era el bug real: aquí decía
    // "r.kcalAct", un campo que getSessions() nunca regresa así —
    // por eso NINGUNA sesión de fuerza contaba, sin importar si
    // Diego las llenaba bien o no.
    const calories = rows.reduce((sum, r) => sum + (Number(r.calories) || Number(r.caloriasActivas) || 0), 0);
    return {
      sessions: rows.length,
      volume: withVol.reduce((sum, r) => sum + (r.volume || 0), 0),
      calories: Math.round(calories),
      avgFC: withFC.length ? Math.round(withFC.reduce((s,r) => s + r.fcAvg, 0) / withFC.length) : null,
      avgEffort: withEffort.length ? Math.round((withEffort.reduce((s,r) => s + r.effort, 0) / withEffort.length) * 10) / 10 : null,
    };
  };

  return { thisWeek: summarize(thisWeek), lastWeek: summarize(lastWeek) };
}

function _getCurrentGoalValue(key, latestMetrics, records) {
  // Combina lo que Diego actualiza a mano en Métricas con lo mejor que
  // ya está registrado de verdad en las sesiones — así no depende de
  // que se acuerde de actualizar el número manual cada vez. Siempre
  // gana el que se acerque más a la meta (el mayor, en todos estos casos).
  const autoMap = {
    sprintSpeed: records?.sprintSpeedMax?.value,
    pullUps:     records?.pullUpsMax?.value,
    cadence:     records?.cadenceAvgMax?.value,
    deadHang:    records?.deadHangMax?.value,
  };
  const manualMap = {
    sprintSpeed: 'sprintSpeed',
    pullUps: 'pullUps',
    cadence: 'cadAvg',
    deadHang: 'deadHang',
  };
  const manualField = manualMap[key];
  const manualVal = (manualField && latestMetrics && latestMetrics[manualField] !== null && latestMetrics[manualField] !== undefined)
    ? latestMetrics[manualField] : null;
  const autoVal = (autoMap[key] !== undefined && autoMap[key] > 0) ? autoMap[key] : null;

  if (manualVal === null && autoVal === null) return null; // sin datos todavía — se muestra "—"
  if (manualVal === null) return autoVal;
  if (autoVal === null) return manualVal;
  return Math.max(manualVal, autoVal);
}

function _baselineKey(key) {
  const map = {
    sprintSpeed: 'speed',
    pullUps: 'pullUps',
    cadence: 'cadenceAvg',
    plank: 'plankMax',
  };
  return map[key] || key;
}

function _goalColor(key) {
  const map = {
    sprintSpeed: '#00FF87',
    pullUps: '#EF4444',
    hrRecovery: '#10B981',
    cadence: '#7C3AED',
    plank: '#06B6D4',
    deadHang: '#F59E0B',
  };
  return map[key] || '#00FF87';
}

// Fuerza a Gemini a re-analizar todo tu historial ahora mismo — útil si
// editaste datos directo en el Sheet y el consejo automático no se enteró.

