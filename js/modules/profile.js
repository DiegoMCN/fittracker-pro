// ═══════════════════════════════════════════
// PROFILE MODULE — Datos básicos + composición corporal
// ═══════════════════════════════════════════

const Profile = (() => {

  let _profile = null;
  let _history = [];
  let _usingMock = false;

  const FIELDS = [
    { key: 'bmi',                label: 'IMC',                       unit: '',    color: 'var(--info)' },
    { key: 'visceralFat',        label: 'Grasa visceral',            unit: '',    color: 'var(--warning)' },
    { key: 'bodyFatPct',         label: 'Grasa corporal',            unit: '%',   color: 'var(--danger)' },
    { key: 'subcutaneousFatPct', label: 'Grasa subcutánea',          unit: '%',   color: 'var(--danger)' },
    { key: 'metabolicAge',       label: 'Edad metabólica',           unit: 'años',color: 'var(--purple-light)' },
    { key: 'leanBodyMass',       label: 'Peso libre de grasa',       unit: 'kg',  color: 'var(--accent)' },
    { key: 'waterPct',           label: 'Agua corporal',             unit: '%',   color: 'var(--cyan)' },
    { key: 'skeletalMusclePct',  label: 'Músculo esquelético',       unit: '%',   color: 'var(--accent)' },
    { key: 'boneMass',           label: 'Masa ósea',                 unit: 'kg',  color: 'var(--text-2)' },
    { key: 'proteinPct',         label: 'Proteína',                  unit: '%',   color: 'var(--info)' },
    { key: 'bmr',                label: 'BMR (metabolismo basal)',   unit: 'kcal',color: 'var(--warning)' },
    { key: 'muscleMass',         label: 'Masa muscular',             unit: 'kg',  color: 'var(--accent)' },
  ];

  async function init(container) {
    container.innerHTML = `
      <div class="grid-2" style="margin-bottom:24px">
        ${[1,2].map(() => `<div class="skeleton" style="height:180px;border-radius:16px"></div>`).join('')}
      </div>
      <div class="skeleton" style="height:300px;border-radius:16px"></div>`;

    const [profRes, histRes] = await Promise.all([API.getProfile(), API.getBodyComposition(30)]);
    _profile = profRes.profile;
    _history = histRes.history || [];
    _usingMock = API.isMock();
    render();
  }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    // getBodyComposition() ya regresa más reciente primero (igual que
    // el resto de la app) — antes esto asumía orden ascendente al revés.
    const latest = _history[0] || null;
    const prev   = _history.length > 1 ? _history[1] : null;

    container.innerHTML = `
      <div style="max-width:900px;margin:0 auto">

        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div><strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.</div>
          </div>
        </div>` : ''}

        <div class="grid-2" style="margin-bottom:24px">

          <!-- Datos básicos -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Datos básicos</div>
              <button class="btn btn-ghost btn-sm" onclick="Profile.editBasics()">✏️ Editar</button>
            </div>
            <div class="grid-2" style="gap:12px">
              <div>
                <div style="font-size:11px;color:var(--text-3)">Peso</div>
                <div style="font-size:20px;font-weight:700">${_profile?.Peso_kg || '—'}<span style="font-size:12px;color:var(--text-3)"> kg</span></div>
              </div>
              <div>
                <div style="font-size:11px;color:var(--text-3)">Altura</div>
                <div style="font-size:20px;font-weight:700">${_profile?.Altura_cm || '—'}<span style="font-size:12px;color:var(--text-3)"> cm</span></div>
              </div>
              <div>
                <div style="font-size:11px;color:var(--text-3)">Edad</div>
                <div style="font-size:20px;font-weight:700">${_profile?.Edad || '—'}<span style="font-size:12px;color:var(--text-3)"> años</span></div>
              </div>
              <div>
                <div style="font-size:11px;color:var(--text-3)">Sexo</div>
                <div style="font-size:20px;font-weight:700">${_profile?.Sexo || '—'}</div>
              </div>
            </div>
            ${_profile?.Fecha_Actualizacion ? `<div style="font-size:10px;color:var(--text-4);margin-top:12px">Actualizado: ${Utils.formatDate(_profile.Fecha_Actualizacion)}</div>` : ''}
          </div>

          <!-- Última composición -->
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Última composición corporal</div>
                <div class="card-subtitle">${latest ? Utils.formatDate(latest.date) : 'Sin registros todavía'}</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="Profile.openComposition()">+ Nueva medición</button>
            </div>
            ${latest ? `
              <div class="grid-2" style="gap:12px">
                <div>
                  <div style="font-size:11px;color:var(--text-3)">Grasa corporal</div>
                  <div style="font-size:20px;font-weight:700;color:var(--danger)">${latest.bodyFatPct ?? '—'}<span style="font-size:12px"> %</span></div>
                </div>
                <div>
                  <div style="font-size:11px;color:var(--text-3)">Masa muscular</div>
                  <div style="font-size:20px;font-weight:700;color:var(--accent)">${latest.muscleMass ?? '—'}<span style="font-size:12px"> kg</span></div>
                </div>
              </div>
              ${latest.aiAnalysis ? `
              <div style="margin-top:14px;display:flex;gap:10px;align-items:flex-start;background:var(--accent-glow);border:1px solid var(--border-accent);border-radius:8px;padding:10px 12px">
                <span style="font-size:16px;flex-shrink:0">🤖</span>
                <div style="font-size:12px;color:var(--text-1);line-height:1.5">${latest.aiAnalysis}</div>
              </div>` : ''}` : `
              <div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">
                Registra tu primera medición de la báscula inteligente
              </div>`}
          </div>
        </div>

        <!-- Todos los indicadores -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div>
              <div class="card-title">Composición corporal completa</div>
              <div class="card-subtitle">${latest ? Utils.formatDate(latest.date) : 'Sin datos'}</div>
            </div>
          </div>
          ${latest ? `
            <div class="grid-4" style="gap:12px">
              ${FIELDS.map(f => {
                const val = latest[f.key];
                const prevVal = prev ? prev[f.key] : null;
                const delta = (val !== null && prevVal !== null && val !== undefined && prevVal !== undefined)
                  ? Math.round((val - prevVal) * 10) / 10 : null;
                return `
                <div style="background:var(--bg-input);border-radius:10px;padding:12px">
                  <div style="font-size:10px;color:var(--text-3);margin-bottom:4px">${f.label}</div>
                  <div style="font-size:16px;font-weight:700;color:${f.color}">${val ?? '—'}<span style="font-size:10px;color:var(--text-3)"> ${f.unit}</span></div>
                  ${delta !== null ? `<div style="font-size:9px;color:var(--text-4);margin-top:2px">${delta >= 0 ? '+' : ''}${delta} vs anterior</div>` : ''}
                </div>`;
              }).join('')}
            </div>` : `
            <div style="text-align:center;padding:40px 20px;color:var(--text-3)">
              <div style="font-size:36px;margin-bottom:10px">📊</div>
              <div style="font-size:13px">Todavía no tienes mediciones registradas</div>
              <button class="btn btn-primary" style="margin-top:16px" onclick="Profile.openComposition()">+ Registrar primera medición</button>
            </div>`}
        </div>

        <!-- Gráfica de tendencia — peso y grasa corporal en el tiempo -->
        ${_history.length >= 2 ? `
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div>
              <div class="card-title">Tendencia</div>
              <div class="card-subtitle">Peso y grasa corporal · últimas ${Math.min(_history.length, 10)} mediciones</div>
            </div>
          </div>
          <div style="position:relative;height:200px;width:100%;overflow:hidden">
            <canvas id="body-trend-chart"></canvas>
          </div>
        </div>` : ''}

        <!-- Historial -->
        ${_history.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Historial de mediciones</div>
            <div class="card-subtitle">${_history.length} registro${_history.length !== 1 ? 's' : ''}</div>
          </div>
          <div style="display:flex;flex-direction:column">
            ${_history.map((h, i) => `
              <div style="display:flex;align-items:center;gap:14px;padding:10px 0;${i < _history.length-1 ? 'border-bottom:1px solid var(--border)' : ''}">
                <div style="font-size:11px;color:var(--text-3);min-width:70px">${Utils.formatDateShort(h.date)}</div>
                <div style="flex:1;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--text-2)">
                  ${h.weight ? `<span>⚖️ ${h.weight} kg</span>` : ''}
                  ${h.bodyFatPct ? `<span>🔥 ${h.bodyFatPct}% grasa</span>` : ''}
                  ${h.muscleMass ? `<span>💪 ${h.muscleMass} kg músculo</span>` : ''}
                  ${h.bmr ? `<span>⚡ ${h.bmr} kcal BMR</span>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>`;

    setTimeout(_renderTrendChart, 100);
  }

  // ── EDITAR DATOS BÁSICOS ──────────────────────────────────────────────
  function editBasics() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <div class="modal-title">✏️ Datos básicos</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Peso (kg)</label>
              <input class="input" type="number" step="0.1" id="pf-weight" value="${_profile?.Peso_kg || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Altura (cm)</label>
              <input class="input" type="number" id="pf-height" value="${_profile?.Altura_cm || ''}">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Edad</label>
              <input class="input" type="number" id="pf-age" value="${_profile?.Edad || ''}">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Sexo</label>
              <select class="input" id="pf-sex">
                <option value="Masculino" ${_profile?.Sexo === 'Masculino' ? 'selected' : ''}>Masculino</option>
                <option value="Femenino" ${_profile?.Sexo === 'Femenino' ? 'selected' : ''}>Femenino</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="pf-save-btn" onclick="Profile.saveBasics()">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  let _savingBasics = false;

  async function saveBasics() {
    if (_savingBasics) return;
    _savingBasics = true;
    const btn = document.getElementById('pf-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const payload = {
      weight: document.getElementById('pf-weight').value,
      height: document.getElementById('pf-height').value,
      age: document.getElementById('pf-age').value,
      sex: document.getElementById('pf-sex').value,
    };

    try {
      const result = await API.saveProfile(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — guardado localmente, se sincronizará solo');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success('Perfil actualizado');
      }
      _profile = { Peso_kg: payload.weight, Altura_cm: payload.height, Edad: payload.age, Sexo: payload.sex, Fecha_Actualizacion: Utils.today() };
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    } finally {
      _savingBasics = false;
    }
  }

  // ── NUEVA MEDICIÓN DE COMPOSICIÓN ─────────────────────────────────────
  function openComposition() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">📊 Nueva medición</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:11px;color:var(--text-3)">Captura lo que te dé tu báscula inteligente. El IMC se calcula solo si dejas peso y ya tienes tu altura en el perfil.</p>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Peso (kg)</label>
              <input class="input" type="number" step="0.1" id="bc-weight">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Grasa visceral</label>
              <input class="input" type="number" step="0.1" id="bc-visceral">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Grasa corporal (%)</label>
              <input class="input" type="number" step="0.1" id="bc-bodyfat">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Grasa subcutánea (%)</label>
              <input class="input" type="number" step="0.1" id="bc-subfat">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Edad metabólica</label>
              <input class="input" type="number" id="bc-metabage">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Peso libre de grasa (kg)</label>
              <input class="input" type="number" step="0.1" id="bc-leanmass">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Agua corporal (%)</label>
              <input class="input" type="number" step="0.1" id="bc-water">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Músculo esquelético (%)</label>
              <input class="input" type="number" step="0.1" id="bc-skmuscle">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">Masa ósea (kg)</label>
              <input class="input" type="number" step="0.1" id="bc-bone">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Proteína (%)</label>
              <input class="input" type="number" step="0.1" id="bc-protein">
            </div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1">
              <label class="input-label">BMR (kcal)</label>
              <input class="input" type="number" id="bc-bmr">
            </div>
            <div class="input-group" style="flex:1">
              <label class="input-label">Masa muscular (kg)</label>
              <input class="input" type="number" step="0.1" id="bc-musclemass">
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">Notas</label>
            <input class="input" id="bc-notes" placeholder="Opcional">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="bc-save-btn" onclick="Profile.saveComposition()">Guardar en Sheet</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  let _savingComposition = false;

  async function saveComposition() {
    if (_savingComposition) return;
    _savingComposition = true;
    const btn = document.getElementById('bc-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const val = id => document.getElementById(id)?.value || '';
    const weight = parseFloat(val('bc-weight')) || null;
    const heightCm = parseFloat(_profile?.Altura_cm) || null;
    const bmi = (weight && heightCm) ? Math.round((weight / ((heightCm/100) ** 2)) * 10) / 10 : '';

    const payload = {
      date: Utils.today(),
      weight: weight || '',
      bmi,
      visceralFat: val('bc-visceral'),
      bodyFatPct: val('bc-bodyfat'),
      subcutaneousFatPct: val('bc-subfat'),
      metabolicAge: val('bc-metabage'),
      leanBodyMass: val('bc-leanmass'),
      waterPct: val('bc-water'),
      skeletalMusclePct: val('bc-skmuscle'),
      boneMass: val('bc-bone'),
      proteinPct: val('bc-protein'),
      bmr: val('bc-bmr'),
      muscleMass: val('bc-musclemass'),
      notes: val('bc-notes'),
    };

    try {
      const result = await API.saveBodyComposition(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — guardado localmente, se sincronizará solo');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success('Medición guardada');
      }
      // Se agrega al INICIO — el arreglo se mantiene más reciente
      // primero, igual que como llega del backend.
      _history.unshift({
        date: payload.date, weight: payload.weight, bmi: payload.bmi,
        visceralFat: payload.visceralFat, bodyFatPct: payload.bodyFatPct,
        subcutaneousFatPct: payload.subcutaneousFatPct, metabolicAge: payload.metabolicAge,
        leanBodyMass: payload.leanBodyMass, waterPct: payload.waterPct,
        skeletalMusclePct: payload.skeletalMusclePct, boneMass: payload.boneMass,
        proteinPct: payload.proteinPct, bmr: payload.bmr, muscleMass: payload.muscleMass,
        notes: payload.notes, aiAnalysis: result.aiAnalysis || '',
      });
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar en el Sheet');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar en Sheet'; }
    } finally {
      _savingComposition = false;
    }
  }

  // ── GRÁFICA DE TENDENCIA (peso + grasa corporal) ──────────────────────
  function _renderTrendChart() {
    const canvas = document.getElementById('body-trend-chart');
    if (!canvas || !window.Chart) return;

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    // _history viene más-reciente-primero — para la gráfica se necesita
    // orden cronológico (viejo → nuevo), y solo las últimas 10.
    const chronological = _history.slice(0, 10).slice().reverse();
    const labels = chronological.map(h => Utils.formatDateShort(h.date));
    const weights = chronological.map(h => h.weight);
    const fats = chronological.map(h => h.bodyFatPct);

    const parent = canvas.parentElement;
    const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : 200;
    const w = (parent && parent.offsetWidth  > 0) ? parent.offsetWidth  : 400;
    canvas.width = w; canvas.height = h;

    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Peso (kg)', data: weights, yAxisID: 'y',
            borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)',
            tension: 0.4, fill: true, pointRadius: 4, borderWidth: 2,
            pointBackgroundColor: '#3B82F6', pointBorderColor: 'transparent',
            spanGaps: true,
          },
          {
            label: 'Grasa corporal (%)', data: fats, yAxisID: 'y1',
            borderColor: '#EF4444', backgroundColor: 'transparent',
            tension: 0.4, fill: false, pointRadius: 4, borderWidth: 2,
            pointBackgroundColor: '#EF4444', pointBorderColor: 'transparent',
            borderDash: [4, 3], spanGaps: true,
          },
        ]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        layout: { padding: { top: 4, bottom: 4 } },
        plugins: {
          legend: { display: true, labels: { color: '#B4B2CC', font: { size: 10, family: 'Poppins' }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
            titleColor: '#B4B2CC', bodyColor: '#FFFFFF',
          }
        },
        scales: {
          x: {
            ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 8 },
            grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
          },
          y: {
            type: 'linear', position: 'left',
            ticks: { color: '#3B82F6', font: { size: 10, family: 'Poppins' }, callback: v => v + 'kg' },
            grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
          },
          y1: {
            type: 'linear', position: 'right',
            ticks: { color: '#EF4444', font: { size: 10, family: 'Poppins' }, callback: v => v + '%' },
            grid: { display: false }, border: { display: false },
          },
        }
      }
    });
  }

  return { init, editBasics, saveBasics, openComposition, saveComposition };
})();

function initProfile(container) { Profile.init(container); }
