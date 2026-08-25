// ═══════════════════════════════════════════
// DASHBOARD MODULE
// ═══════════════════════════════════════════

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
  const [data, sesRes, recordsRes, metricsRes] = await Promise.all([
    API.getDashboard(),
    API.getSessions(30),
    API.getPersonalRecords(),
    API.getMetrics(),
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
  const metricsHistory = metricsRes.history || [];
  const latestMetrics = metricsHistory.length ? metricsHistory[metricsHistory.length - 1] : null;

  Store.set({ dashboard: data });
  _renderDashboard(container, data, doneDayNames, recordsRes, sesRes.sessions || [], latestMetrics);
}

function _renderDashboard(container, data, doneDayNames, records, allSessions, latestMetrics) {
  const today     = new Date().getDay();
  const nextSes   = CONFIG.WEEK_PLAN[today] || CONFIG.WEEK_PLAN[(today + 1) % 7];
  const goals     = CONFIG.GOALS;
  const thisWeek  = data.thisWeek || { sessions: 0, target: 6, calories: 0, volume: 0 };
  const weekPct   = Math.round((thisWeek.sessions / thisWeek.target) * 100);
  const lastSes   = data.lastSession || {};
  const rec       = data.recentRecovery || { delta: -14 };
  const recClass  = rec.delta <= -10 ? 'up' : rec.delta <= -5 ? 'flat' : 'down';

  container.innerHTML = `
  <!-- Bienvenida -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
    <div>
      <h1 style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#fff,#B4B2CC);-webkit-background-clip:text;-webkit-text-fill-color:transparent">
        ¡Buenos días, Diego 💪
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

  <!-- Consejo del Coach IA — resumen corto, el análisis completo vive en el módulo Coach IA -->
  <div class="card card-accent section" style="display:flex;gap:14px;align-items:flex-start;cursor:pointer" id="coach-insight-card" onclick="Router.navigate('coach')">
    <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-glow);
      display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤖</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.05em">
          Tu coach personal
        </div>
        <button class="btn btn-ghost btn-icon" style="width:24px;height:24px;font-size:13px" id="coach-refresh-btn"
          onclick="event.stopPropagation(); refreshDashboardCoach()" title="Recargar consejo con los datos más recientes del Sheet">🔄</button>
      </div>
      <div style="font-size:13px;color:var(--text-1);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical" id="coach-insight-text">${data.dashboardInsight ? Utils.truncate(data.dashboardInsight, 160) : 'Sin consejo generado todavía — se crea automáticamente al terminar tu primera sesión del día.'}</div>
      ${data.dashboardInsight ? `<div style="font-size:11px;color:var(--accent);font-weight:600;margin-top:6px">Ver análisis completo →</div>` : ''}
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

    <!-- Calorías semana -->
    <div class="metric-card" style="--accent-color:var(--warning)">
      <div class="metric-label">Calorías activas</div>
      <div style="display:flex;align-items:baseline;gap:4px;margin:8px 0">
        <span class="metric-value" style="color:var(--warning)">${Utils.formatNum(thisWeek.calories)}</span>
        <span class="metric-unit">kcal</span>
      </div>
      <div class="metric-delta ${thisWeek.calories > 500 ? 'up' : 'flat'}">
        ${thisWeek.calories > 1000 ? '🔥 Excelente semana' : thisWeek.calories > 500 ? '💪 Buen ritmo' : '📅 Empieza la semana'}
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:6px">Volumen: ${Utils.formatNum(thisWeek.volume)} kg movidos</div>
    </div>
  </div>

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
              : _getCurrentGoalValue(key, latestMetrics);
          const baseline = CONFIG.BASELINE[_baselineKey(key)] ?? g.target * 0.5;
          const hasData = current !== null && current !== undefined;
          const pct = key === 'hrRecovery'
            ? Utils.progress(current ?? -5, -5, -20)
            : hasData ? Utils.progress(current, baseline, g.target) : 0;
          const color = _goalColor(key);
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
              <div style="height:100%;border-radius:9999px;background:${hasData || key==='hrRecovery' ? color : 'var(--text-4)'};opacity:${hasData || key==='hrRecovery' ? 1 : 0.25};width:${hasData || key==='hrRecovery' ? pct : 100}%;transition:width 1s cubic-bezier(0.4,0,0.2,1);box-shadow:${hasData || key==='hrRecovery' ? `0 0 8px ${color}66` : 'none'}"></div>
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

  // Renderizar chart FC tendencia — esperar a que el DOM esté pintado
  setTimeout(() => _renderFCChart(allSessions), 100);
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

  // Forzar dimensiones antes de que Chart.js las lea
  const parent = canvas.parentElement;
  const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : 160;
  const w = (parent && parent.offsetWidth  > 0) ? parent.offsetWidth  : 400;
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
function _getCurrentGoalValue(key, latestMetrics) {
  const fieldMap = {
    sprintSpeed: 'sprintSpeed',
    pullUps: 'pullUps',
    cadence: 'cadAvg',
    deadHang: 'deadHang',
  };
  const field = fieldMap[key];
  if (field && latestMetrics && latestMetrics[field] !== null && latestMetrics[field] !== undefined) {
    return latestMetrics[field];
  }
  return null; // sin datos todavía — se muestra "—" en vez de un número inventado
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
async function refreshDashboardCoach() {
  const btn = document.getElementById('coach-refresh-btn');
  const textEl = document.getElementById('coach-insight-text');
  if (!btn || btn.disabled) return; // evita doble click mientras genera
  btn.disabled = true;
  btn.innerHTML = '<span class="animate-spin" style="display:inline-block">⏳</span>';
  Sounds.click();

  try {
    const res = await API.refreshDashboardInsight();
    API.clearCache();
    if (res.insight && textEl) {
      textEl.textContent = Utils.truncate(res.insight, 160);
      Sounds.serieDone(); Haptics.success();
      Toast.success('Consejo actualizado');
    } else {
      Toast.warning('No se pudo generar el consejo — revisa que tengas la API key configurada');
    }
  } catch(err) {
    Sounds.error();
    Toast.error('Error al recargar el consejo');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔄';
  }
}
