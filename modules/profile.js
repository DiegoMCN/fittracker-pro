// ═══════════════════════════════════════════
// PROFILE MODULE — Datos básicos + composición corporal
// ═══════════════════════════════════════════

const Profile = (() => {

  let _profile = null;
  let _history = [];
  let _measurements = [];
  let _insights = {};
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

    const [profRes, histRes, measRes, insightsRes] = await Promise.all([API.getProfile(), API.getBodyComposition(30), API.getMeasurements(30), API.getAllInsights()]);
    _profile = profRes.profile;
    _history = histRes.history || [];
    _measurements = measRes.history || [];
    _insights = insightsRes.insights || {};
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
              <div style="cursor:pointer" onclick="Profile.showFieldInsight('peso', ${_profile?.Peso_kg ? _profile.Peso_kg : 'null'})">
                <div style="font-size:11px;color:var(--text-3)">Peso ℹ️</div>
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
                <div style="cursor:pointer" onclick="Profile.showFieldInsight('bodyFatPct', ${latest.bodyFatPct ?? 'null'})">
                  <div style="font-size:11px;color:var(--text-3)">Grasa corporal ℹ️</div>
                  <div style="font-size:20px;font-weight:700;color:var(--danger)">${latest.bodyFatPct ?? '—'}<span style="font-size:12px"> %</span></div>
                </div>
                <div style="cursor:pointer" onclick="Profile.showFieldInsight('muscleMass', ${latest.muscleMass ?? 'null'})">
                  <div style="font-size:11px;color:var(--text-3)">Masa muscular ℹ️</div>
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
                const hasInfo = !!_fieldInfo[f.key];
                return `
                <div style="background:var(--bg-input);border-radius:10px;padding:12px;${hasInfo ? 'cursor:pointer' : ''}" ${hasInfo ? `onclick="Profile.showFieldInsight('${f.key}', ${val ?? 'null'})"` : ''}>
                  <div style="font-size:10px;color:var(--text-3);margin-bottom:4px">${f.label}${hasInfo ? ' ℹ️' : ''}</div>
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

        ${_insightCard('composicion_corporal', '🤖 Lo que dice el Coach')}

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

        <!-- Medidas con cinta métrica -->
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <div>
              <div class="card-title">📏 Medidas corporales</div>
              <div class="card-subtitle">${_measurements.length ? `Última: ${Utils.formatDate(_measurements[0].date)}` : 'Cinta métrica — cintura, pecho, brazos, piernas'}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="Profile.openMeasurements()">+ Nueva medida</button>
          </div>
          ${_measurements.length === 0 ? `
            <div style="text-align:center;padding:30px 20px;color:var(--text-3)">
              <div style="font-size:32px;margin-bottom:10px">📏</div>
              <div style="font-size:12px">Registra tu primera medida para empezar a ver tu evolución</div>
            </div>` : (() => {
              const latest = _measurements[0];
              const prev = _measurements.length > 1 ? _measurements[1] : null;
              const fields = [
                { key: 'cintura', label: 'Cintura' }, { key: 'pecho', label: 'Pecho' },
                { key: 'cadera', label: 'Cadera' }, { key: 'brazoIzq', label: 'Brazo izq.' },
                { key: 'brazoDer', label: 'Brazo der.' }, { key: 'musloIzq', label: 'Muslo izq.' },
                { key: 'musloDer', label: 'Muslo der.' }, { key: 'pantorrilla', label: 'Pantorrilla' },
              ];
              // Ratio cintura/cadera — indicador de riesgo cardiovascular,
              // gratis una vez que ya tienes ambos datos capturados.
              const whr = (latest.cintura && latest.cadera) ? Math.round((latest.cintura / latest.cadera) * 100) / 100 : null;
              return `
              ${whr ? `
              <div style="background:var(--bg-input);border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="Profile.showFieldInsight('whr', ${whr})">
                <div style="font-size:11px;color:var(--text-3)">Ratio cintura/cadera ℹ️</div>
                <div style="font-size:15px;font-weight:700;color:${whr <= 0.9 ? 'var(--success)' : whr <= 0.95 ? 'var(--warning)' : 'var(--danger)'}">${whr} <span style="font-size:10px;color:var(--text-4);font-weight:400">${whr <= 0.9 ? '(bajo riesgo)' : whr <= 0.95 ? '(riesgo moderado)' : '(riesgo elevado)'}</span></div>
              </div>` : ''}
              <div class="grid-4" style="gap:10px;margin-bottom:16px">
                ${fields.filter(f => latest[f.key]).map(f => {
                  const delta = (prev && prev[f.key]) ? Math.round((latest[f.key] - prev[f.key]) * 10) / 10 : null;
                  const hasInfo = !!_fieldInfo[f.key];
                  return `
                  <div style="background:var(--bg-input);border-radius:10px;padding:10px;${hasInfo ? 'cursor:pointer' : ''}" ${hasInfo ? `onclick="Profile.showFieldInsight('${f.key}', ${latest[f.key]})"` : ''}>
                    <div style="font-size:9px;color:var(--text-3);margin-bottom:3px">${f.label}${hasInfo ? ' ℹ️' : ''}</div>
                    <div style="font-size:15px;font-weight:700;color:var(--text-1)">${latest[f.key]}<span style="font-size:9px;color:var(--text-3)"> cm</span></div>
                    ${delta !== null ? `<div style="font-size:9px;color:${delta < 0 ? 'var(--success)' : delta > 0 ? 'var(--text-3)' : 'var(--text-4)'}">${delta > 0 ? '+' : ''}${delta} cm</div>` : ''}
                  </div>`;
                }).join('')}
              </div>
              ${_measurements.length >= 2 ? `
              <div style="position:relative;height:180px;width:100%;overflow:hidden;margin-bottom:6px">
                <canvas id="measurements-chart"></canvas>
              </div>` : ''}`;
            })()}
        </div>

        ${_insightCard('medidas_corporales', '🤖 Lo que dice el Coach')}
      </div>`;

    setTimeout(_renderTrendChart, 100);
    setTimeout(_renderMeasurementsChart, 100);
  }

  // ── EDITAR DATOS BÁSICOS ──────────────────────────────────────────────
  // Tarjeta con la interpretación que ya generó el Coach para esto —
  // viene de IA_INSIGHTS, no gasta ninguna solicitud extra.
  function _insightCard(key, title) {
    const insight = _insights[key];
    if (!insight || !insight.texto) return '';
    return `
      <div class="card card-accent" style="margin-bottom:24px">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:16px;flex-shrink:0">🤖</span>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:4px">${title}</div>
            <div style="font-size:12px;color:var(--text-2);line-height:1.6">${insight.texto}</div>
          </div>
        </div>
      </div>`;
  }

  // Descripción de qué es cada dato — no depende de la IA, siempre
  // disponible. Los que tienen "who" muestran además el termómetro con
  // rangos fijos de la OMS; los que tienen "insightKey" agregan la
  // interpretación personalizada del Coach cuando ya se generó.
  const _fieldInfo = {
    bmi:                { title: 'IMC — Índice de Masa Corporal', desc: 'Tu peso relativo a tu estatura. Es un indicador general de población, no distingue músculo de grasa — un atleta musculoso puede salir "sobrepeso" sin serlo.', who: 'bmiGeneral', min: 15, max: 40 },
    visceralFat:        { title: 'Grasa visceral', desc: 'La grasa alrededor de tus órganos internos, no la que se ve/pellizca. Niveles altos se asocian a mayor riesgo cardiovascular independientemente del peso total.' },
    bodyFatPct:         { title: 'Grasa corporal', desc: 'Qué porcentaje de tu peso total es grasa (el resto es músculo, agua, hueso, órganos). Es más preciso que el peso solo para ver composición real.', who: 'bodyFatMale', min: 5, max: 35, insightKey: 'grasa_corporal' },
    subcutaneousFatPct: { title: 'Grasa subcutánea', desc: 'La grasa justo debajo de la piel, la que sí se pellizca — distinta de la visceral, y menos relacionada con riesgo cardiovascular.' },
    metabolicAge:       { title: 'Edad metabólica', desc: 'Compara tu metabolismo basal contra el promedio de otras edades — una edad metabólica menor a la real suele reflejar buena composición corporal.' },
    leanBodyMass:       { title: 'Peso libre de grasa', desc: 'Todo tu peso que NO es grasa: músculo, hueso, órganos, agua. Súbelo (o mantenlo) mientras bajas grasa es la meta de una recomposición sana.' },
    waterPct:           { title: 'Agua corporal', desc: 'Qué porcentaje de tu peso es agua. Varía bastante con hidratación del momento — no te preocupes por cambios de un día a otro.' },
    skeletalMusclePct:  { title: 'Músculo esquelético', desc: 'El músculo que puedes entrenar y hacer crecer (excluye músculo liso de órganos). Subir este número con el tiempo es una señal directa de que tu entrenamiento de fuerza está funcionando.' },
    boneMass:           { title: 'Masa ósea', desc: 'El peso estimado de tu esqueleto. Cambia muy poco en el tiempo — no esperes variaciones grandes de una medición a otra.' },
    proteinPct:         { title: 'Proteína corporal', desc: 'Qué porcentaje de tu peso es proteína — se relaciona con tu masa muscular total.' },
    bmr:                { title: 'BMR — Metabolismo basal', desc: 'Las calorías que quemas solo por existir, sin moverte — la base de cualquier cálculo de cuánto necesitas comer al día.' },
    muscleMass:         { title: 'Masa muscular', desc: 'El peso total de tu músculo (esquelético + liso + cardíaco). Súbelo con el tiempo confirma que el entrenamiento de fuerza está dando resultado.', insightKey: 'composicion_corporal' },
    peso: { title: 'Peso corporal', desc: 'Tu peso total — sube o baja por grasa, músculo, agua y hasta lo que comiste ese día. Míralo en tendencia de semanas, no día a día.', insightKey: 'composicion_corporal' },
    cintura:      { title: 'Cintura', desc: 'La circunferencia de tu cintura — uno de los mejores indicadores individuales de riesgo cardiovascular, más que el peso solo.', who: 'waistMale', min: 60, max: 120, insightKey: 'cintura' },
    pecho:        { title: 'Pecho', desc: 'Circunferencia de pecho — más útil para ver tu progreso de desarrollo muscular que para salud general.' },
    cadera:       { title: 'Cadera', desc: 'Circunferencia de cadera — se usa junto con la cintura para calcular tu ratio cintura/cadera.' },
    brazoIzq:     { title: 'Brazo izquierdo', desc: 'Circunferencia de brazo — compárala con el derecho para detectar asimetrías de desarrollo entre lados.' },
    brazoDer:     { title: 'Brazo derecho', desc: 'Circunferencia de brazo — compárala con el izquierdo para detectar asimetrías de desarrollo entre lados.' },
    musloIzq:     { title: 'Muslo izquierdo', desc: 'Circunferencia de muslo — compárala con el derecho para detectar asimetrías de desarrollo entre lados.' },
    musloDer:     { title: 'Muslo derecho', desc: 'Circunferencia de muslo — compárala con el izquierdo para detectar asimetrías de desarrollo entre lados.' },
    pantorrilla:  { title: 'Pantorrilla', desc: 'Circunferencia de pantorrilla — un grupo muscular que suele responder más lento al entrenamiento que otros.' },
    whr:          { title: 'Ratio cintura/cadera', desc: 'Tu cintura dividida entre tu cadera — la OMS lo usa como indicador de dónde acumulas grasa, más ligado a riesgo cardiovascular que el peso o el IMC solos.', who: 'whrMale', min: 0.7, max: 1.2, insightKey: 'ratio_cintura_cadera' },
  };

  function showFieldInsight(key, currentValue) {
    Sounds.click();
    const info = _fieldInfo[key];
    if (!info) return;
    const insight = info.insightKey ? _insights[info.insightKey] : null;

    const gaugeHtml = (info.who && currentValue !== null && currentValue !== undefined)
      ? Utils.gaugeHTML({ value: currentValue, min: info.min, max: info.max, unit: key === 'whr' ? '' : (info.who === 'bodyFatMale' ? '%' : info.who === 'bmiGeneral' ? '' : 'cm'), zones: Utils.WHO_RANGES[info.who] })
      : '';

    const body = `
      <div style="font-size:12px;color:var(--text-3);line-height:1.6;margin-bottom:${gaugeHtml || (insight && insight.texto) ? '10px' : '0'}">${info.desc}</div>
      ${gaugeHtml ? `<div style="font-size:9px;color:var(--text-4);text-align:center;margin-top:2px">Rangos de referencia de la OMS</div>${gaugeHtml}` : ''}
      ${insight && insight.texto ? `
        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:${gaugeHtml ? '4px' : '10px'}">
          <div style="font-size:10px;font-weight:600;color:var(--accent);margin-bottom:6px">🤖 LO QUE DICE EL COACH</div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.6">${insight.texto}</div>
          <div style="font-size:10px;color:var(--text-4);margin-top:10px">Generado el ${Utils.formatDate(insight.fecha)}</div>
        </div>` : (info.insightKey ? `
        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:10px;text-align:center">
          <div style="font-size:11px;color:var(--text-3)">Sin interpretación personalizada todavía — genera el consejo de hoy en Coach IA.</div>
        </div>` : '')}`;

    Utils.showInfoModal(info.title, body);
  }

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
    const wRaw = (parent && parent.offsetWidth  > 0) ? parent.offsetWidth  : 400;
    const w = Math.min(wRaw, document.documentElement.clientWidth - 48);
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

  // ── GRÁFICA DE MEDIDAS (cintura, pecho, brazo, muslo) ─────────────────
  function _renderMeasurementsChart() {
    const canvas = document.getElementById('measurements-chart');
    if (!canvas || !window.Chart) return;

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    const chronological = _measurements.slice(0, 10).slice().reverse();
    const labels = chronological.map(h => Utils.formatDateShort(h.date));

    const parent = canvas.parentElement;
    const h = (parent && parent.offsetHeight > 0) ? parent.offsetHeight : 180;
    const wRaw = (parent && parent.offsetWidth  > 0) ? parent.offsetWidth  : 400;
    const w = Math.min(wRaw, document.documentElement.clientWidth - 48);
    canvas.width = w; canvas.height = h;

    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Cintura', data: chronological.map(m => m.cintura), borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.06)', fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#EF4444', pointBorderColor: 'transparent', spanGaps: true },
          { label: 'Pecho', data: chronological.map(m => m.pecho), borderColor: '#3B82F6', backgroundColor: 'transparent', tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#3B82F6', pointBorderColor: 'transparent', borderDash: [4,3], spanGaps: true },
          { label: 'Brazo der.', data: chronological.map(m => m.brazoDer), borderColor: '#00FF87', backgroundColor: 'transparent', tension: 0.4, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#00FF87', pointBorderColor: 'transparent', borderDash: [2,2], spanGaps: true },
        ]
      },
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        layout: { padding: { top: 4, bottom: 4 } },
        plugins: {
          legend: { display: true, labels: { color: '#B4B2CC', font: { size: 10, family: 'Poppins' }, boxWidth: 10 } },
          tooltip: { backgroundColor: '#13131F', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#B4B2CC', bodyColor: '#FFFFFF' }
        },
        scales: {
          x: { ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, maxRotation: 0, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
          y: { ticks: { color: '#6E6D8A', font: { size: 9, family: 'Poppins' }, callback: v => v + 'cm' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
        }
      }
    });
  }

  // ── REGISTRAR MEDIDAS ──────────────────────────────────────────────
  function openMeasurements() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-header">
          <div class="modal-title">📏 Nueva medida</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:11px;color:var(--text-3)">Todo en centímetros. Llena solo lo que midas hoy — no es necesario todo cada vez.</p>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Cintura</label><input class="input" type="number" step="0.1" id="me-cintura"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Pecho</label><input class="input" type="number" step="0.1" id="me-pecho"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Cadera</label><input class="input" type="number" step="0.1" id="me-cadera"></div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Brazo izq.</label><input class="input" type="number" step="0.1" id="me-brazoizq"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Brazo der.</label><input class="input" type="number" step="0.1" id="me-brazoder"></div>
          </div>
          <div class="input-row">
            <div class="input-group" style="flex:1"><label class="input-label">Muslo izq.</label><input class="input" type="number" step="0.1" id="me-musloizq"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Muslo der.</label><input class="input" type="number" step="0.1" id="me-musloder"></div>
            <div class="input-group" style="flex:1"><label class="input-label">Pantorrilla</label><input class="input" type="number" step="0.1" id="me-pantorrilla"></div>
          </div>
          <div class="input-group"><label class="input-label">Notas (opcional)</label><input class="input" id="me-notes"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="me-save-btn" onclick="Profile.saveMeasurements()">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  let _savingMeasurements = false;

  async function saveMeasurements() {
    if (_savingMeasurements) return;
    _savingMeasurements = true;
    const btn = document.getElementById('me-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const val = id => document.getElementById(id)?.value || '';
    const payload = {
      date: Utils.today(),
      cintura: val('me-cintura'), pecho: val('me-pecho'), cadera: val('me-cadera'),
      brazoIzq: val('me-brazoizq'), brazoDer: val('me-brazoder'),
      musloIzq: val('me-musloizq'), musloDer: val('me-musloder'),
      pantorrilla: val('me-pantorrilla'), notes: val('me-notes'),
    };

    try {
      const result = await API.saveMeasurements(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — se sincronizará solo');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success('Medidas guardadas');
      }
      _measurements.unshift({
        date: payload.date,
        cintura: Number(payload.cintura) || null, pecho: Number(payload.pecho) || null,
        cadera: Number(payload.cadera) || null, brazoIzq: Number(payload.brazoIzq) || null,
        brazoDer: Number(payload.brazoDer) || null, musloIzq: Number(payload.musloIzq) || null,
        musloDer: Number(payload.musloDer) || null, pantorrilla: Number(payload.pantorrilla) || null,
        notes: payload.notes,
      });
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    } finally {
      _savingMeasurements = false;
    }
  }

  return { init, editBasics, saveBasics, openComposition, saveComposition, openMeasurements, saveMeasurements, showFieldInsight };
})();

function initProfile(container) { Profile.init(container); }
