// ═══════════════════════════════════════════
// CALENDARIO MODULE — Vista mensual de toda tu actividad
// ═══════════════════════════════════════════

const Calendario = (() => {

  let _sessions = [];
  let _cardio = [];
  let _viewDate = new Date(); // mes que se está mostrando
  let _usingMock = false;

  const DOW = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  async function init(container) {
    container.innerHTML = `<div class="skeleton" style="height:500px;border-radius:16px"></div>`;
    const [sesRes, cardioRes] = await Promise.all([API.getSessions(90), API.getCardio(60)]);
    _sessions = sesRes.sessions || [];
    _cardio = cardioRes.sessions || [];
    _usingMock = API.isMock();
    render();
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

        <div class="card" style="margin-bottom:20px">
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
              const hasStrength = _sessions.some(s => s.date === dateStr);
              const hasCardio = _cardio.some(c => c.date === dateStr);
              const hasAny = hasStrength || hasCardio;

              return `
              <div onclick="${hasAny ? `Calendario.openDay('${dateStr}')` : ''}"
                style="aspect-ratio:1;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
                cursor:${hasAny ? 'pointer' : 'default'};
                background:${isToday ? 'var(--accent-glow)' : hasAny ? 'var(--bg-input)' : 'transparent'};
                border:${isToday ? '1.5px solid var(--accent)' : '1px solid transparent'};
                transition:transform 0.1s"
                ${hasAny ? `onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'"` : ''}>
                <div style="font-size:11px;font-weight:${isToday ? '700' : '500'};color:${isToday ? 'var(--accent)' : hasAny ? 'var(--text-1)' : 'var(--text-4)'}">${d}</div>
                <div style="display:flex;gap:2px;height:6px">
                  ${hasStrength ? `<div style="width:5px;height:5px;border-radius:50%;background:var(--accent)"></div>` : ''}
                  ${hasCardio ? `<div style="width:5px;height:5px;border-radius:50%;background:var(--info)"></div>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>

          <div style="display:flex;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:10px;color:var(--text-3)">
            <div style="display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:50%;background:var(--accent)"></div>Fuerza</div>
            <div style="display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:50%;background:var(--info)"></div>Cardio</div>
          </div>
        </div>

        <div class="card">
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
  }

  function openDay(dateStr) {
    Sounds.click();
    const daySessions = _sessions.filter(s => s.date === dateStr);
    const dayCardio = _cardio.filter(c => c.date === dateStr);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <div class="modal-title">${Utils.formatDate(dateStr)}</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
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
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" style="width:100%" onclick="Router.navigate('history')">Ver en Bitácora →</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  return { init, changeMonth, goToday, openDay };
})();

function initCalendario(container) { Calendario.init(container); }
