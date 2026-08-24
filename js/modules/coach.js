// ═══════════════════════════════════════════
// COACH MODULE — Consejo diario del Coach IA
// ═══════════════════════════════════════════

const Coach = (() => {

  let _history = [];
  let _usingMock = false;

  async function init(container) {
    container.innerHTML = `
      <div style="max-width:700px;margin:0 auto">
        <div class="skeleton" style="height:180px;border-radius:16px;margin-bottom:20px"></div>
        ${[1,2,3].map(() => `<div class="skeleton" style="height:70px;border-radius:14px;margin-bottom:10px"></div>`).join('')}
      </div>`;

    const res = await API.getCoachHistory(30);
    _history = (res.history || []).slice().reverse(); // más reciente primero
    _usingMock = API.isMock();
    render();
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const today = _history[0] && _history[0].date === Utils.today() ? _history[0] : null;
    const past = today ? _history.slice(1) : _history;

    container.innerHTML = `
      <div style="max-width:700px;margin:0 auto">

        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div><strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.</div>
          </div>
        </div>` : ''}

        <!-- Consejo de hoy -->
        <div class="card card-accent" style="margin-bottom:24px">
          <div style="display:flex;gap:16px;align-items:flex-start">
            <div style="width:48px;height:48px;border-radius:14px;background:var(--accent-glow);
              display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🤖</div>
            <div style="flex:1">
              <div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
                Consejo de hoy · ${Utils.formatDate(Utils.today())}
              </div>
              ${today
                ? `<div style="font-size:14px;color:var(--text-1);line-height:1.6">${today.note}</div>`
                : `<div style="font-size:13px;color:var(--text-3);line-height:1.6">
                    Todavía no hay consejo para hoy — se genera automáticamente en cuanto termines
                    tu primera sesión del día (fuerza o cardio). Analiza tu historial completo:
                    fuerza, cardio, velocidad de sprint, dominadas, y composición corporal.
                  </div>`}
            </div>
          </div>
        </div>

        <!-- Cómo funciona -->
        <div class="card" style="margin-bottom:24px;background:var(--bg-input);border-color:transparent">
          <div style="display:flex;gap:10px;align-items:flex-start;font-size:12px;color:var(--text-3);line-height:1.6">
            <span style="font-size:16px">💡</span>
            <div>
              Este consejo se genera <strong>una vez al día</strong>, justo después de terminar tu
              sesión del día — y considera <strong>todo tu historial</strong>: sesiones de fuerza y
              cardio recientes, tus mediciones de velocidad de sprint / dominadas / cadencia / dead
              hang, tu peso y composición corporal, siempre comparado contra los objetivos reales
              de tu programa de 12 semanas.
            </div>
          </div>
        </div>

        <!-- Historial -->
        ${past.length > 0 ? `
        <div class="section-header">
          <div class="section-title">Historial de consejos</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${past.map(h => `
            <div class="card">
              <div style="font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
                ${Utils.formatDate(h.date)}
              </div>
              <div style="font-size:13px;color:var(--text-2);line-height:1.6">${h.note}</div>
            </div>`).join('')}
        </div>` : (today ? '' : `
        <div style="text-align:center;padding:40px 20px;color:var(--text-3)">
          <div style="font-size:36px;margin-bottom:10px">📅</div>
          <div style="font-size:12px">Todavía no hay historial de consejos — vuelve después de tu próxima sesión.</div>
        </div>`)}

      </div>`;
  }

  return { init };
})();

function initCoach(container) { Coach.init(container); }
