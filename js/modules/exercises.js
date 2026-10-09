// ═══════════════════════════════════════════
// EXERCISES MODULE — Catálogo con fotos/videos
// ═══════════════════════════════════════════

const Exercises = (() => {

  let _exercises = [];
  let _mods = {};            // progreso por ejercicio, indexado por nombre normalizado
  let _detailChart = null;
  let _filter = 'all';
  let _search = '';
  let _usingMock = false;
  let _shouldStagger = false; // true solo en la carga inicial y al cambiar de filtro — NO al escribir en el buscador, que re-renderiza en cada tecla y se vería parpadeante si recascadeara cada vez

  async function init(container) {
    container.innerHTML = `
      <div class="grid-auto">
        ${[1,2,3,4,5,6].map(() => `<div class="skeleton" style="height:200px;border-radius:16px"></div>`).join('')}
      </div>`;

    const [res, modRes] = await Promise.all([API.getExercises(), API.getExerciseModules().catch(() => ({ modules: [] }))]);
    _exercises = res.exercises || [];
    _mods = {};
    ((modRes && modRes.modules) || []).forEach(m => { _mods[_norm(m.name)] = m; });
    _usingMock = API.isMock();
    _shouldStagger = true;
    render();
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    let list = _exercises;
    if (_filter !== 'all') list = list.filter(e => e.Grupo_Muscular === _filter);
    if (_search) list = list.filter(e => (e.Nombre || '').toLowerCase().includes(_search.toLowerCase()));

    const groups = ['all', ...new Set(_exercises.map(e => e.Grupo_Muscular).filter(Boolean))];

    container.innerHTML = `
      <div style="max-width:1100px;margin:0 auto">

        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div><strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.</div>
          </div>
        </div>` : ''}

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          <div>
            <div style="font-size:12px;color:var(--text-3)">${_exercises.length} ejercicios en tu catálogo</div>
          </div>
          <button class="btn btn-primary" onclick="Exercises.openEditor()">+ Nuevo ejercicio</button>
        </div>

        <!-- Búsqueda y filtros -->
        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
          <input class="input" style="max-width:280px" placeholder="🔍 Buscar ejercicio..."
            value="${_search}" oninput="Exercises.setSearch(this.value)">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${groups.map(g => `
              <button class="btn ${_filter === g ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="Exercises.setFilter('${g}')">
                ${g === 'all' ? 'Todos' : g}
              </button>`).join('')}
          </div>
        </div>

        <!-- Grid -->
        ${list.length === 0 ? `
          <div style="text-align:center;padding:60px 20px;color:var(--text-3)">
            <div style="font-size:40px;margin-bottom:12px">🎯</div>
            <div>${_exercises.length === 0 ? 'Tu catálogo está vacío' : 'Sin resultados para ese filtro'}</div>
            ${_exercises.length === 0 ? `<button class="btn btn-primary" style="margin-top:16px" onclick="Exercises.openEditor()">+ Agregar primer ejercicio</button>` : ''}
          </div>` : `
        <div class="grid-auto">
          ${list.map(ex => _exerciseCard(ex)).join('')}
        </div>`}

      </div>`;

    if (_shouldStagger) Motion.staggerIn(container.querySelectorAll('.exercise-card'));
    _shouldStagger = false;
  }

  // Mismo criterio que el backend: sin acentos, minúsculas, espacios simples.
  function _norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  const _fmtV = (v) => Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString();
  const _valTxt = (m, p) => p ? `${_fmtV(p.value)} ${m.unit}` : '—';
  function _ago(d) { return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} d`; }
  const _TREND = { mejora: ['📈', 'mejora', 'var(--accent)'], estable: ['➡️', 'estable', 'var(--text-3)'], baja: ['📉', 'baja', 'var(--danger)'] };

  // ── ESTANCADO, RETROCESO O BAJÓN ─────────────────────────────────────
  // Antes los tres salían como "⚠️ Meseta" con el mismo consejo (cambia
  // el estímulo), y para un retroceso ese consejo está al revés: si vas
  // bajando, lo primero es mirar fatiga y sueño, no meterle más variedad.
  const _PL = {
    estancado: { badge: '⚠️ Estancado', bg: 'rgba(245,158,11,0.18)', fg: '#F59E0B' },
    retroceso: { badge: '🔻 Bajando',   bg: 'rgba(239,68,68,0.18)',  fg: '#EF4444' },
    caida:     { badge: '❗ Bajón',      bg: 'rgba(168,85,247,0.18)', fg: '#A855F7' },
  };
  const _plOf = (k) => _PL[k] || _PL.estancado;
  const _plBadge = (k) => _plOf(k).badge;
  const _plBg = (k) => _plOf(k).bg;
  const _plFg = (k) => _plOf(k).fg;
  function _plTexto(m) {
    const pct = (m.plateauPct === null || m.plateauPct === undefined) ? '' : ` (${m.plateauPct > 0 ? '+' : ''}${m.plateauPct}%)`;
    if (m.plateauKind === 'retroceso') {
      return `🔻 <b>Vienes bajando${pct}:</b> no es falta de variedad, es que la carga está cediendo. Revisa primero sueño, fatiga y cuánto estás acumulando esta semana; si todo eso está bien, baja el peso y vuelve a construir desde ahí.`;
    }
    if (m.plateauKind === 'caida') {
      return `❗ <b>La última sesión se cayó${pct}</b> respecto a las anteriores, aunque la tendencia venía bien. Si fue a propósito (descarga, cambio de enfoque), todo en orden; si no, vale la pena recordar qué pasó ese día.`;
    }
    return `⚠️ <b>Estancado${pct}:</b> ${m.mode === 'tiempo' || m.mode === 'reps' ? 'sin marca nueva en tus últimas 4 sesiones.' : 'la carga no se movió en las últimas sesiones.'} Cambia el estímulo (rango de repeticiones, descanso o variante) para romperlo.`;
  }

  // Mini-gráfica de progreso. La línea escala con el ancho de la tarjeta (el
  // trazo mantiene su grosor), y el punto de la última sesión es un div aparte
  // para que no se deforme al estirar el SVG.
  function _sparkline(m, id) {
    const pts = m.series;
    if (!pts.length) return '';
    const W = 200, H = 44, PX = 5, PY = 7;
    const vals = pts.map(p => p.value), lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
    const flip = m.higherIsBetter ? 1 : -1;               // en asistencia, MENOS es mejor → más arriba
    const xy = pts.map((p, i) => {
      const x = pts.length === 1 ? W / 2 : PX + (W - PX * 2) * i / (pts.length - 1);
      const t = (p.value - lo) / span;                    // 0..1
      const y = H - PY - (H - PY * 2) * (flip === 1 ? t : 1 - t);
      return [x, y];
    });
    const color = m.trend === 'baja' ? '#EF4444' : m.trend === 'mejora' ? '#00FF87' : '#3B82F6';
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`;
    const [lx, ly] = xy[xy.length - 1];
    return `
      <div style="position:relative;height:${H}px;margin:2px 0 4px">
        <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block">
          <defs><linearGradient id="spk-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
          ${pts.length > 1 ? `<path d="${area}" fill="url(#spk-${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}
        </svg>
        <div class="ex-spk-dot" style="position:absolute;left:calc(${(lx / W * 100).toFixed(2)}% - 4px);top:${(ly / H * 100).toFixed(2)}%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 0 3px ${color}33"></div>
      </div>`;
  }

  function _exerciseCard(ex) {
    const tagMap = { 'Pecho':'chest','Espalda':'back','Biceps':'biceps','Triceps':'triceps','Hombro':'shoulder',
      'Cuadriceps':'legs','Isquiotibiales':'legs','Pantorrillas':'legs','Core':'core','Calistenia':'cali','Cardio':'cardio' };
    const tagCls = tagMap[ex.Grupo_Muscular] || 'core';
    const hasPhoto = ex.Foto_URL && ex.Foto_URL.trim();
    const hasVideo = ex.Video_URL && ex.Video_URL.trim();
    const m = _mods[_norm(ex.Nombre)];
    const tr = m && m.trend ? _TREND[m.trend] : null;

    return `
    <div class="card exercise-card" style="padding:0;overflow:hidden;cursor:pointer"
      onclick="Exercises.openDetail('${ex.ID}')">

      <div style="height:96px;background:var(--bg-input);position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden">
        ${hasPhoto
          ? `<img src="${ex.Foto_URL}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
             <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:32px">🏋️</div>`
          : `<div style="font-size:32px;opacity:0.4">🏋️</div>`}
        ${hasVideo ? `<div style="position:absolute;top:8px;right:8px;background:var(--bg-overlay);border-radius:8px;padding:4px 8px;font-size:10px;display:flex;align-items:center;gap:4px">▶ video</div>` : ''}
        ${m && m.plateau ? `<div style="position:absolute;top:8px;left:8px;background:${_plBg(m.plateauKind)};color:${_plFg(m.plateauKind)};border-radius:8px;padding:4px 8px;font-size:10px;font-weight:600">${_plBadge(m.plateauKind)}</div>` : ''}
      </div>

      <div style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
          <div style="min-width:0;flex:1">
            <div style="font-weight:600;font-size:13px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ex.Nombre}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span class="tag tag-${tagCls}">${ex.Grupo_Muscular || '—'}</span>
              ${ex.Tipo ? `<span style="font-size:10px;color:var(--text-4)">${ex.Tipo}</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="ex-count" style="font-size:30px;font-weight:800;line-height:1;color:${m ? 'var(--accent)' : 'var(--text-4)'};font-variant-numeric:tabular-nums">${m ? m.sessions : 0}</div>
            <div style="font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">${m && m.sessions === 1 ? 'sesión' : 'sesiones'}</div>
          </div>
        </div>

        ${m ? `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--text-3);margin-top:10px">
            <span>${m.metricLabel}</span>
            ${tr ? `<span style="color:${tr[2]};font-weight:600">${tr[0]} ${tr[1]}</span>` : `<span>${m.series.length < 4 ? 'pocas sesiones aún' : ''}</span>`}
          </div>
          ${_sparkline(m, ex.ID)}
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
            <div><div style="font-size:9px;color:var(--text-4)">Mejor</div><div style="font-size:12px;font-weight:700">${_valTxt(m, m.best)}</div></div>
            <div><div style="font-size:9px;color:var(--text-4)">Última · ${_ago(m.daysSinceLast)}</div><div style="font-size:12px;font-weight:700">${_valTxt(m, m.last)}${(m.mode === 'carga' || m.mode === 'asistencia') && m.last ? ` <span style="font-weight:500;color:var(--text-3)">×${m.last.reps}</span>` : ''}</div></div>
            <div><div style="font-size:9px;color:var(--text-4)">Desde la 1ª</div><div style="font-size:12px;font-weight:700;color:${m.changePct > 0 ? 'var(--accent)' : m.changePct < 0 ? 'var(--danger)' : 'var(--text-2)'}">${m.changePct === null ? '—' : (m.changePct > 0 ? '▲ +' : m.changePct < 0 ? '▼ ' : '') + m.changePct + '%'}</div></div>
          </div>` : `
          <div style="font-size:11px;color:var(--text-4);margin-top:12px;line-height:1.5">Aún sin sesiones registradas. Cuando lo hagas, aquí verás tu progreso.</div>`}
        ${ex.Notas ? `<div style="font-size:11px;color:var(--text-3);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:10px">${ex.Notas}</div>` : ''}
      </div>
    </div>`;
  }

  function setFilter(g) { _filter = g; _shouldStagger = true; Sounds.click(); render(); }
  function setSearch(v) { _search = v; render(); _focusSearch(); }
  function _focusSearch() {
    requestAnimationFrame(() => {
      const el = document.querySelector('input[placeholder*="Buscar"]');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }

  // ── DETALLE ───────────────────────────────────────────────────────────
  function openDetail(id) {
    const ex = _exercises.find(e => e.ID === id);
    if (!ex) return;
    Sounds.click();

    const hasPhoto = ex.Foto_URL && ex.Foto_URL.trim();
    const hasVideo = ex.Video_URL && ex.Video_URL.trim();
    const embedVideo = hasVideo ? _toEmbedUrl(ex.Video_URL) : null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <div class="modal-title">${ex.Nombre}</div>
          <button class="btn btn-ghost btn-icon" onclick="Motion.closeModal(this.closest('.modal-overlay'))">✕</button>
        </div>
        <div class="modal-body">
          ${embedVideo
            ? `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;margin-bottom:16px">
                 <iframe src="${embedVideo}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen></iframe>
               </div>`
            : hasPhoto
              ? `<img src="${ex.Foto_URL}" style="width:100%;border-radius:12px;margin-bottom:16px;max-height:280px;object-fit:cover">`
              : ''}

          <div style="display:flex;gap:6px;margin-bottom:14px">
            <span class="tag">${ex.Grupo_Muscular || '—'}</span>
            ${ex.Tipo ? `<span class="tag">${ex.Tipo}</span>` : ''}
          </div>

          ${_progressHTML(_mods[_norm(ex.Nombre)])}

          ${ex.Descripcion ? `<p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:14px">${ex.Descripcion}</p>` : ''}

          ${ex.Instrucciones ? `
            <div style="margin-bottom:14px">
              <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Técnica</div>
              <div style="font-size:13px;color:var(--text-2);line-height:1.6">${ex.Instrucciones}</div>
            </div>` : ''}

          ${ex.Notas ? `
            <div style="background:var(--accent-glow);border:1px solid var(--border-accent);border-radius:10px;padding:12px 14px">
              <div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:4px">💡 Notas de progreso</div>
              <div style="font-size:12px;color:var(--text-2);line-height:1.5">${ex.Notas}</div>
            </div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Motion.closeModal(this.closest('.modal-overlay'))">Cerrar</button>
          <button class="btn btn-primary" onclick="Exercises.openEditor('${ex.ID}')">✏️ Editar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    _drawDetailChart(_mods[_norm(ex.Nombre)]);
  }

  function _progressHTML(m) {
    if (!m) return `<div style="margin-bottom:16px;padding:14px;border-radius:12px;background:var(--bg-input);font-size:12px;color:var(--text-3);line-height:1.5">📈 Aún no has registrado este ejercicio. Cuando lo hagas, aquí aparecerá tu progreso sesión por sesión.</div>`;
    const tr = m.trend ? _TREND[m.trend] : null;
    const cell = (label, big, sub, color) => `<div style="background:var(--bg-input);border-radius:12px;padding:10px 6px;text-align:center"><div style="font-size:${big.length > 6 ? 16 : 20}px;font-weight:800;color:${color || 'var(--text-1)'};font-variant-numeric:tabular-nums">${big}</div><div style="font-size:10px;font-weight:600;margin-top:2px">${label}</div><div style="font-size:9px;color:var(--text-4);margin-top:1px">${sub}</div></div>`;
    return `
      <div style="margin-bottom:16px">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
          ${cell('Sesiones', String(m.sessions), `desde ${Utils.formatDateShort(m.firstDate)}`, 'var(--accent)')}
          ${cell('Mejor', _valTxt(m, m.best), m.best ? Utils.formatDateShort(m.best.date) : '')}
          ${cell('Desde la 1ª', m.changePct === null ? '—' : (m.changePct > 0 ? '+' : '') + m.changePct + '%', tr ? `${tr[0]} ${tr[1]}` : 'pocas sesiones', m.changePct > 0 ? 'var(--accent)' : m.changePct < 0 ? 'var(--danger)' : 'var(--text-1)')}
        </div>
        ${m.plateau ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:10px;background:${_plBg(m.plateauKind)};border:1px solid ${_plFg(m.plateauKind)}55;font-size:12px;line-height:1.5">${_plTexto(m)}</div>` : ''}
        <div style="font-size:11px;color:var(--text-3);margin-bottom:6px">${m.metricLabel} por sesión${m.higherIsBetter ? '' : ' · <b>menos asistencia = más arriba = mejor</b>'}</div>
        <div style="position:relative;height:170px"><canvas id="ex-detail-chart"></canvas></div>
        <div style="margin-top:12px">
          ${m.series.slice(-6).reverse().map(p => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-3)">${Utils.formatDateShort(p.date)}</span>
              <span style="font-weight:600">${_fmtV(p.value)} ${m.unit}${(m.mode === 'carga' || m.mode === 'asistencia') ? ` <span style="color:var(--text-3);font-weight:500">× ${p.reps}</span>` : ''}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function _drawDetailChart(m) {
    const canvas = document.getElementById('ex-detail-chart');
    if (_detailChart) { try { _detailChart.destroy(); } catch(e) {} _detailChart = null; }
    if (!canvas || !m || !m.series.length || typeof Chart === 'undefined') return;
    const color = m.trend === 'baja' ? '#EF4444' : m.trend === 'mejora' ? '#00FF87' : '#3B82F6';
    _detailChart = new Chart(canvas, {
      type: 'line',
      data: { labels: m.series.map(p => Utils.formatDateShort(p.date)), datasets: [{ data: m.series.map(p => p.value), borderColor: color, backgroundColor: color + '22', fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: color, pointBorderColor: 'transparent' }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
          callbacks: { label: (c) => { const p = m.series[c.dataIndex]; return ` ${_fmtV(p.value)} ${m.unit}${(m.mode === 'carga' || m.mode === 'asistencia') ? ' × ' + p.reps + ' reps' : ''}`; } } } },
        scales: {
          x: { ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 6 }, grid: { display: false }, border: { display: false } },
          y: { reverse: !m.higherIsBetter, ticks: { color: '#6E6D8A', font: { size: 10, family: 'Poppins' } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
        },
      },
    });
  }

  function _toEmbedUrl(url) {
    // YouTube
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    // Vimeo
    const vim = url.match(/vimeo\.com\/(\d+)/);
    if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
    return null; // otro tipo de link — no se puede embeber, se ignora
  }

  // ── EDITOR (crear / editar) ──────────────────────────────────────────
  function openEditor(id) {
    const ex = id ? _exercises.find(e => e.ID === id) : null;
    Motion.closeModal(document.querySelector('.modal-overlay'));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">${ex ? '✏️ Editar' : '+ Nuevo'} ejercicio</div>
          <button class="btn btn-ghost btn-icon" onclick="Motion.closeModal(this.closest('.modal-overlay'))">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="input-group">
            <label class="input-label">Nombre</label>
            <input class="input" id="ed-name" value="${ex?.Nombre || ''}" placeholder="Ej. Press militar">
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Grupo muscular</label>
              <select class="input" id="ed-group">
                ${CONFIG.MUSCLE_GROUPS.map(g => `<option value="${g}" ${ex?.Grupo_Muscular === g ? 'selected' : ''}>${g}</option>`).join('')}
              </select>
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Tipo</label>
              <select class="input" id="ed-type">
                ${['Máquina','Polea','Peso libre','Mancuernas','Calistenia','Pliometría','Accesorio'].map(t => `<option value="${t}" ${ex?.Tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">Foto (URL)</label>
            <input class="input" id="ed-photo" value="${ex?.Foto_URL || ''}" placeholder="https://...">
          </div>
          <div class="input-group">
            <label class="input-label">Video (URL de YouTube o Vimeo)</label>
            <input class="input" id="ed-video" value="${ex?.Video_URL || ''}" placeholder="https://youtube.com/watch?v=...">
          </div>
          <div class="input-group">
            <label class="input-label">Descripción</label>
            <textarea class="input" id="ed-desc" rows="2" style="resize:vertical">${ex?.Descripcion || ''}</textarea>
          </div>
          <div class="input-group">
            <label class="input-label">Instrucciones / técnica</label>
            <textarea class="input" id="ed-instructions" rows="2" style="resize:vertical">${ex?.Instrucciones || ''}</textarea>
          </div>
          <div class="input-group">
            <label class="input-label">Notas de progreso</label>
            <input class="input" id="ed-notes" value="${ex?.Notas || ''}" placeholder="Ej. Baseline: 20kg">
            <div style="font-size:10px;color:var(--text-4);margin-top:4px">Se actualiza sola después de cada sesión — puedes editarla a mano si quieres.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Motion.closeModal(this.closest('.modal-overlay'))">Cancelar</button>
          <button class="btn btn-primary" id="ed-save-btn" onclick="Exercises.save(${ex ? `'${ex.ID}'` : 'null'})">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('ed-name').focus();
  }

  let _savingExercise = false;

  async function save(id) {
    if (_savingExercise) return; // evita doble click / doble guardado
    const val = k => document.getElementById(k)?.value.trim() || '';
    const name = val('ed-name');
    if (!name) { Sounds.error(); Toast.error('El nombre es obligatorio'); return; }

    _savingExercise = true;
    const btn = document.getElementById('ed-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const payload = {
      id: id || undefined,
      name,
      group: val('ed-group'),
      type: val('ed-type'),
      description: val('ed-desc'),
      photoUrl: val('ed-photo'),
      videoUrl: val('ed-video'),
      instructions: val('ed-instructions'),
      notes: val('ed-notes'),
    };

    try {
      const result = await API.saveExercise(payload);
      API.clearCache();
      Motion.closeModal(document.querySelector('.modal-overlay'));
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — guardado localmente, se sincronizará solo');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success(`"${name}" guardado`);
      }
      // Actualiza localmente sin esperar refetch completo
      if (id) {
        const idx = _exercises.findIndex(e => e.ID === id);
        if (idx > -1) _exercises[idx] = { ID: id, Nombre: name, Grupo_Muscular: payload.group, Tipo: payload.type,
          Descripcion: payload.description, Foto_URL: payload.photoUrl, Video_URL: payload.videoUrl,
          Instrucciones: payload.instructions, Notas: payload.notes };
      } else {
        _exercises.push({ ID: 'temp_' + Utils.uid(), Nombre: name, Grupo_Muscular: payload.group, Tipo: payload.type,
          Descripcion: payload.description, Foto_URL: payload.photoUrl, Video_URL: payload.videoUrl,
          Instrucciones: payload.instructions, Notas: payload.notes });
      }
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar en el Sheet');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    } finally {
      _savingExercise = false;
    }
  }

  return { init, setFilter, setSearch, openDetail, openEditor, save };
})();

function initExercises(container) { Exercises.init(container); }
