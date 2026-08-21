// ═══════════════════════════════════════════
// IMPORT MODULE — Carga masiva desde CSV (Apple Watch / histórico)
// ═══════════════════════════════════════════

const Import = (() => {

  const TEMPLATE_HEADERS = [
    'Fecha','Tipo','Nombre','Duracion_min','Kcal_Activas','Kcal_Totales',
    'FC_Promedio','FC_Pico','FC_Minima','Esfuerzo_1_10',
    'Zona1_min','Zona2_min','Zona3_min','Zona4_min','Zona5_min',
    'FC_Post_0min','FC_Post_1min','FC_Post_2min',
    'Distancia_km','Cadencia_Prom','Cadencia_Pico','Velocidad_Max_kmh','Notas'
  ];

  let _rows = [];       // filas parseadas del CSV
  let _importing = false;

  function init(container) {
    render(container);
  }

  function render(container) {
    container = container || document.getElementById('page-content');
    container.innerHTML = `
      <div style="max-width:800px;margin:0 auto">

        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <div>
              <div class="card-title">📥 Importar desde CSV</div>
              <div class="card-subtitle">Para cargar historial del Apple Watch o poner al día sesiones pasadas</div>
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-3);line-height:1.6;margin-bottom:16px">
            Un mismo archivo sirve para sesiones de <strong>Fuerza</strong> y <strong>Cardio</strong> — la columna
            <code>Tipo</code> decide a qué hoja va cada fila. Descarga la plantilla, llénala con lo que veas
            en la app Fitness/Salud del iPhone (pantalla "Workout Details" → "Heart Rate"), y súbela de vuelta.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-secondary" onclick="Import.downloadTemplate()">⬇ Descargar plantilla CSV</button>
            <label class="btn btn-primary" style="cursor:pointer">
              📂 Elegir archivo CSV
              <input type="file" accept=".csv" style="display:none" onchange="Import.handleFile(this.files[0])">
            </label>
          </div>
        </div>

        <div id="import-preview"></div>
      </div>`;
  }

  // ── PLANTILLA DESCARGABLE ─────────────────────────────────────────────
  function downloadTemplate() {
    Sounds.click();
    const example1 = ['2026-08-21','Fuerza','Espalda + Hombro','47','306','395','124','157','94','7',
      '45:35','01:36','00:15','00:00','00:00','117','121','116','','','','','Buena sesión, subí cargas'];
    const example2 = ['2026-08-20','Cardio','HIT Nivel 1','18','141','','158','194','','7',
      '','','','','','','','','1.42','109','186','12','Primera Z5 registrada'];

    const csv = [TEMPLATE_HEADERS.join(','), example1.join(','), example2.join(',')].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'FitTracker_Plantilla_Import.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.success('Plantilla descargada — ábrela en Sheets o Excel');
  }

  // ── PARSEO DE CSV (maneja comillas y comas dentro de campos) ──────────
  function _parseCSVLine(line) {
    const result = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { result.push(cur); cur = ''; }
        else cur += c;
      }
    }
    result.push(cur);
    return result.map(s => s.trim());
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result.replace(/^\uFEFF/, ''); // quita BOM si viene de Excel
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) { Toast.error('El archivo está vacío o solo tiene encabezados'); return; }

        const headers = _parseCSVLine(lines[0]);
        _rows = lines.slice(1).map(line => {
          const cells = _parseCSVLine(line);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i] : ''; });
          return obj;
        }).filter(r => r['Fecha']); // ignora filas totalmente vacías

        Sounds.click();
        _renderPreview();
      } catch(err) {
        Sounds.error();
        Toast.error('No se pudo leer el archivo. Verifica que sea un CSV válido.');
        console.error(err);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function _renderPreview() {
    const el = document.getElementById('import-preview');
    if (!el) return;

    if (_rows.length === 0) {
      el.innerHTML = `<div class="card"><div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">Sin filas válidas para mostrar</div></div>`;
      return;
    }

    const fuerzaCount = _rows.filter(r => (r['Tipo'] || '').toLowerCase().startsWith('fuerza')).length;
    const cardioCount = _rows.filter(r => (r['Tipo'] || '').toLowerCase().startsWith('cardio')).length;
    const otherCount  = _rows.length - fuerzaCount - cardioCount;

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Vista previa — ${_rows.length} filas</div>
            <div class="card-subtitle">${fuerzaCount} Fuerza · ${cardioCount} Cardio${otherCount ? ` · ⚠ ${otherCount} con Tipo desconocido (se omiten)` : ''}</div>
          </div>
        </div>

        <div style="max-height:280px;overflow-y:auto;margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead style="position:sticky;top:0;background:var(--bg-card)">
              <tr style="text-align:left;color:var(--text-3)">
                <th style="padding:6px 8px">Fecha</th>
                <th style="padding:6px 8px">Tipo</th>
                <th style="padding:6px 8px">Nombre</th>
                <th style="padding:6px 8px">Duración</th>
                <th style="padding:6px 8px">FC prom</th>
              </tr>
            </thead>
            <tbody>
              ${_rows.map(r => `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:6px 8px">${r['Fecha'] || '—'}</td>
                  <td style="padding:6px 8px">
                    <span class="tag ${(r['Tipo']||'').toLowerCase().startsWith('fuerza') ? 'tag-back' : (r['Tipo']||'').toLowerCase().startsWith('cardio') ? 'tag-cardio' : ''}">${r['Tipo'] || '—'}</span>
                  </td>
                  <td style="padding:6px 8px">${r['Nombre'] || '—'}</td>
                  <td style="padding:6px 8px">${r['Duracion_min'] || '—'} min</td>
                  <td style="padding:6px 8px">${r['FC_Promedio'] || '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div id="import-progress" style="display:none;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:6px">
            <span>Importando...</span>
            <span id="import-progress-text">0 / ${_rows.length}</span>
          </div>
          <div class="progress-bar"><div id="import-progress-fill" class="progress-fill" style="width:0%"></div></div>
        </div>

        <button class="btn btn-primary" style="width:100%" id="import-btn" onclick="Import.runImport()">
          ⬆ Importar ${fuerzaCount + cardioCount} registros a tu Sheet
        </button>
      </div>`;
  }

  // ── IMPORTACIÓN EN LOTE ────────────────────────────────────────────────
  async function runImport() {
    if (_importing) return; // evita doble click / doble importación
    _importing = true;

    const btn = document.getElementById('import-btn');
    const progressBox = document.getElementById('import-progress');
    const progressFill = document.getElementById('import-progress-fill');
    const progressText = document.getElementById('import-progress-text');
    if (btn) btn.disabled = true;
    if (progressBox) progressBox.style.display = 'block';

    const valid = _rows.filter(r => {
      const t = (r['Tipo'] || '').toLowerCase();
      return t.startsWith('fuerza') || t.startsWith('cardio');
    });

    let ok = 0, failed = 0;

    for (let i = 0; i < valid.length; i++) {
      const r = valid[i];
      try {
        if ((r['Tipo'] || '').toLowerCase().startsWith('fuerza')) {
          await API.saveSession(_buildStrengthPayload(r));
        } else {
          await API.saveCardio(_buildCardioPayload(r));
        }
        ok++;
      } catch(err) {
        failed++;
        console.error('Error importando fila', r, err);
      }

      const pct = Math.round(((i + 1) / valid.length) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressText) progressText.textContent = `${i + 1} / ${valid.length}`;
    }

    API.clearCache();
    _importing = false;
    _rows = [];

    if (failed === 0) {
      Sounds.sessionDone(); Haptics.done();
      Toast.success(`✅ ${ok} registros importados correctamente`);
    } else {
      Sounds.error();
      Toast.warning(`${ok} importados, ${failed} fallaron — revisa la consola`);
    }

    render();
  }

  function _dayNameFromDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d.getDay()];
  }

  function _buildStrengthPayload(r) {
    return {
      date: r['Fecha'],
      day: _dayNameFromDate(r['Fecha']),
      type: 'Fuerza',
      week: CONFIG.CURRENT_PHASE.currentWeek,
      phase: CONFIG.CURRENT_PHASE.name,
      duration: r['Duracion_min'] || '',
      kcalAct: r['Kcal_Activas'] || '',
      kcalTot: r['Kcal_Totales'] || '',
      fcAvg: r['FC_Promedio'] || '',
      fcPeak: r['FC_Pico'] || '',
      fcMin: r['FC_Minima'] || '',
      effort: r['Esfuerzo_1_10'] || '',
      zone1: r['Zona1_min'] || '', zone2: r['Zona2_min'] || '', zone3: r['Zona3_min'] || '',
      zone4: r['Zona4_min'] || '', zone5: r['Zona5_min'] || '',
      fcPost0: r['FC_Post_0min'] || '', fcPost1: r['FC_Post_1min'] || '', fcPost2: r['FC_Post_2min'] || '',
      notes: r['Notas'] || r['Nombre'] || 'Importado de CSV',
      exercises: [],
    };
  }

  function _buildCardioPayload(r) {
    // Aproximación: Z1/Z2 igual, Z3+ suma zonas 3-5 (el esquema de
    // cardio agrupa más grueso que el de fuerza).
    const z1 = r['Zona1_min'] || '';
    const z2 = r['Zona2_min'] || '';
    const z3plus = [r['Zona3_min'], r['Zona4_min'], r['Zona5_min']].filter(Boolean).join('+') || '';
    const fcPost1 = r['FC_Post_1min'] || '';
    const fcPost2 = r['FC_Post_2min'] || '';
    const rec2min = (fcPost1 && fcPost2) ? Math.round(Number(fcPost2) - Number(fcPost1)) : '';

    return {
      date: r['Fecha'],
      week: CONFIG.CURRENT_PHASE.currentWeek,
      phase: CONFIG.CURRENT_PHASE.name,
      type: r['Nombre'] || 'Cardio',
      protocol: r['Nombre'] || '',
      duration: r['Duracion_min'] || '',
      distance: r['Distancia_km'] || '',
      fcAvg: r['FC_Promedio'] || '',
      fcPeak: r['FC_Pico'] || '',
      fcPost1, fcPost2, rec2min,
      cadAvg: r['Cadencia_Prom'] || '',
      cadPeak: r['Cadencia_Pico'] || '',
      velMax: r['Velocidad_Max_kmh'] || '',
      z1, z2, z3plus,
      notes: r['Notas'] || 'Importado de CSV',
    };
  }

  return { init, downloadTemplate, handleFile, runImport };
})();

function initImport(container) { Import.init(container); }
