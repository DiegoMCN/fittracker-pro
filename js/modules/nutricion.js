// ═══════════════════════════════════════════
// NUTRICIÓN MODULE — Registro diario, plan de la nutrióloga, marcas
// ═══════════════════════════════════════════

const Nutricion = (() => {

  const MEAL_KEYS = ['desayuno', 'comida', 'snack1', 'cena'];
  const MEAL_LABELS = { desayuno: 'Desayuno', comida: 'Comida', snack1: 'Snack', cena: 'Cena' };
  const MEAL_ICONS = { desayuno: '☀️', comida: '🍽️', snack1: '🍎', cena: '🌙' };

  let _tab = 'hoy';
  let _mealLog = [];
  let _brands = [];
  let _usingMock = false;
  let _pendingPhoto = null; // { base64, mimeType, previewUrl } mientras se llena el modal
  let _editingMeals = new Set(); // comidas ya registradas que se están volviendo a elegir

  let _plan = null; // viene de getNutritionPlan() — editable en el Sheet

  async function init(container) {
    container.innerHTML = `<div class="skeleton" style="height:400px;border-radius:16px"></div>`;
    const [logRes, brandsRes, planRes] = await Promise.all([
      API.getMealLog(30),
      API.getBrandChoices(),
      API.getNutritionPlan(),
    ]);
    _mealLog = logRes.log || [];
    _brands = brandsRes.brands || [];
    _plan = planRes;
    _usingMock = API.isMock();
    render();
  }

  function setTab(tab) { _tab = tab; render(); }

  function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:800px;margin:0 auto">
        ${_usingMock ? `
        <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)">
            <span style="font-size:18px">⚠️</span>
            <div><strong>Sin conexión con tu Google Sheet.</strong> Mostrando datos de ejemplo.</div>
          </div>
        </div>` : ''}

        <div style="display:flex;gap:8px;margin-bottom:20px;overflow-x:auto">
          <button class="btn ${_tab==='hoy'?'btn-primary':'btn-secondary'} btn-sm" onclick="Nutricion.setTab('hoy')">📋 Hoy</button>
          <button class="btn ${_tab==='plan'?'btn-primary':'btn-secondary'} btn-sm" onclick="Nutricion.setTab('plan')">📖 Plan y equivalentes</button>
          <button class="btn ${_tab==='marcas'?'btn-primary':'btn-secondary'} btn-sm" onclick="Nutricion.setTab('marcas')">🏷️ Marcas</button>
        </div>

        ${_tab === 'hoy' ? _renderHoy() : _tab === 'plan' ? _renderPlan() : _renderMarcas()}
      </div>`;
  }

  // ── TAB: HOY ────────────────────────────────────────────────────────
  function _renderHoy() {
    const today = Utils.today();
    const todayLog = _mealLog.filter(m => m.date === today);
    const np = _plan;

    return `
      <!-- Recomendaciones generales — arriba de todo, siempre visibles -->
      <div class="card card-accent" style="margin-bottom:20px">
        <div class="card-header"><div class="card-title">💡 Recomendaciones generales</div></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${np.generalRecommendations.map(r => `
            <div style="display:flex;gap:8px;font-size:12px;color:var(--text-2);line-height:1.5">
              <span style="color:var(--accent);flex-shrink:0">•</span><span>${r}</span>
            </div>`).join('')}
        </div>
      </div>

      <div style="font-size:11px;color:var(--text-3);margin-bottom:16px">${Utils.formatDate(today)}</div>

      <div style="display:flex;flex-direction:column;gap:22px;margin-bottom:24px">
        ${MEAL_KEYS.map(key => {
          const label = MEAL_LABELS[key];
          const logged = todayLog.find(m => m.comida === label);
          const showOptions = !logged || _editingMeals.has(key);

          // Ya registrada y no se está cambiando — resumen compacto
          if (!showOptions) {
            return `
            <div class="card" style="display:flex;align-items:center;gap:12px">
              <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-glow);
                display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">✅</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text-1)">${label}</div>
                <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${logged.opcion && logged.opcion !== 'Personalizado' ? `Opción ${logged.opcion}` : (logged.descripcion || 'Registrado')}</div>
              </div>
              ${logged.fotoUrl ? `<img src="${logged.fotoUrl}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0">` : ''}
              <button class="btn btn-ghost btn-sm" onclick="Nutricion.editMeal('${key}')">Cambiar</button>
            </div>`;
          }

          // Sin registrar (o cambiando) — tarjetas de opciones para elegir
          const options = np.meals[label] || [];
          return `
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:18px">${MEAL_ICONS[key]}</span>
              <span style="font-size:14px;font-weight:700;color:var(--text-1)">${label}</span>
              ${logged ? `<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="Nutricion.cancelEdit('${key}')">Cancelar</button>` : ''}
            </div>
            <div class="grid-2" style="gap:10px">
              ${options.map(opt => `
                <div class="card nutri-option-card" onclick="Nutricion.selectOption('${key}','${label}',${opt.id})">
                  <div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px">OPCIÓN ${opt.id}</div>
                  <div style="font-size:11px;color:var(--text-2);line-height:1.5">${opt.items.join(' · ')}</div>
                </div>`).join('')}
              <div class="card nutri-option-card" style="border-style:dashed;display:flex;align-items:center;justify-content:center;text-align:center"
                onclick="Nutricion.selectOption('${key}','${label}','Personalizado')">
                <div style="font-size:11px;color:var(--text-3)">✏️<br>Otra cosa<br>(personalizado)</div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="section-header"><div class="section-title">Historial reciente</div></div>
      ${_mealLog.length === 0 ? `
        <div style="text-align:center;padding:30px;color:var(--text-3);font-size:12px">Todavía no registras comidas</div>` : `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${_mealLog.slice(0, 12).map(m => `
            <div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px">
              ${m.fotoUrl ? `<img src="${m.fotoUrl}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0">` : `<div style="width:36px;height:36px;border-radius:8px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🍽️</div>`}
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:var(--text-1)">${m.comida}${m.opcion && m.opcion !== 'Personalizado' ? ` · Opción ${m.opcion}` : ''}</div>
                <div style="font-size:10px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.descripcion || ''}</div>
              </div>
              <div style="font-size:10px;color:var(--text-4);flex-shrink:0">${Utils.formatDateShort(m.date)}</div>
            </div>`).join('')}
        </div>`}
    `;
  }

  function editMeal(key) { _editingMeals.add(key); render(); }
  function cancelEdit(key) { _editingMeals.delete(key); render(); }

  // ── TAB: PLAN Y EQUIVALENTES ──────────────────────────────────────────
  function _renderPlan() {
    const np = _plan;
    return `
      <div class="card" style="margin-bottom:20px;background:var(--bg-input);border-color:transparent">
        <div style="font-size:11px;color:var(--text-3);line-height:1.6">
          Plan de <strong style="color:var(--text-2)">${CONFIG.NUTRITION_META.nutritionist}</strong> · ${Utils.formatDate(CONFIG.NUTRITION_META.planDate)}
          · próxima cita: ${Utils.formatDate(CONFIG.NUTRITION_META.nextAppointment)}
        </div>
      </div>

      ${MEAL_KEYS.map(key => {
        const label = MEAL_LABELS[key];
        const options = np.meals[label] || [];
        if (options.length === 0) return '';
        return `
        <div style="margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="font-size:16px">${MEAL_ICONS[key]}</span>
            <span style="font-size:13px;font-weight:700;color:var(--text-1)">${label}</span>
          </div>
          <div class="grid-2" style="gap:10px">
            ${options.map(opt => `
              <div class="card">
                <div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px">OPCIÓN ${opt.id}</div>
                <div style="font-size:11px;color:var(--text-2);line-height:1.6">
                  ${opt.items.map(i => `<div>• ${i}</div>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>`;
      }).join('')}

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🔄 Grupos de alimentos equivalentes</div>
            <div class="card-subtitle">Se intercambian entre sí respetando la porción — ej. 1 tortilla = 1 rebanada de pan integral = ¼ taza de arroz</div>
          </div>
        </div>
        ${Object.keys(np.equivalents).length === 0 ? `
          <div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">Sin datos — corre setupSheets() en Apps Script para sembrar el plan</div>` :
        Object.entries(np.equivalents).map(([grupo, items]) => `
          <details style="margin-bottom:10px">
            <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--text-1);padding:8px 0">${_equivIcon(grupo)} ${grupo} (${items.length})</summary>
            <table style="width:100%;border-collapse:collapse;margin:4px 0 10px">
              <thead>
                <tr style="border-bottom:1px solid var(--border)">
                  <th style="text-align:left;font-size:9px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.04em;padding:4px 8px 6px 0">Alimento</th>
                  <th style="text-align:right;font-size:9px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.04em;padding:4px 0 6px">Porción</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, i) => `<tr style="${i < items.length-1 ? 'border-bottom:1px solid var(--border)' : ''}">
                    <td style="font-size:11px;color:var(--text-2);padding:6px 8px 6px 0">${item.name}</td>
                    <td style="font-size:11px;color:var(--text-3);text-align:right;padding:6px 0;white-space:nowrap">${item.portion}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </details>`).join('')}
      </div>
    `;
  }

  function _equivIcon(grupo) {
    const icons = {
      'Frutas': '🍓', 'Verduras': '🥦', 'Cereales sin grasa': '🌾',
      'AOA muy bajo en grasa': '🍗', 'AOA bajo en grasa': '🥩', 'AOA moderado en grasa': '🥓',
      'Leguminosas': '🫘', 'Grasas y aceites': '🫒', 'Grasas con proteína': '🥜',
      'Lácteos': '🥛', 'Sin energía (libres)': '🧂',
    };
    return icons[grupo] || '📦';
  }

  // ── TAB: MARCAS ────────────────────────────────────────────────────
  function _renderMarcas() {
    const np = _plan;
    return `
      <div class="card" style="margin-bottom:20px;background:var(--bg-input);border-color:transparent">
        <div style="font-size:11px;color:var(--text-3);line-height:1.6">
          Tu nutrióloga no da nombres de marca exactos — da <strong style="color:var(--text-2)">criterios</strong> para elegir bien en el súper.
          Aquí guardas las marcas reales que vas comprando y que sí cumplen.
        </div>
      </div>

      ${Object.entries(np.brandGuides).map(([key, guide]) => {
        const logged = _brands.filter(b => b.category === guide.label);
        return `
        <div class="card" style="margin-bottom:14px">
          <div class="card-header">
            <div class="card-title">${guide.label}</div>
            <button class="btn btn-primary btn-sm" onclick="Nutricion.openBrandModal('${guide.label.replace(/'/g, "\\'")}')">+ Marca</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:${logged.length ? '14px' : '0'}">
            ${guide.criteria.map(c => `
              <div style="display:flex;gap:8px;font-size:11px;color:var(--text-3);line-height:1.5">
                <span style="color:var(--accent);flex-shrink:0">✓</span><span>${c}</span>
              </div>`).join('')}
          </div>
          ${logged.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${logged.map(b => `
              <div style="background:var(--accent-glow);border:1px solid var(--border-accent);border-radius:99px;padding:4px 12px;font-size:11px;color:var(--accent);font-weight:600">
                ${b.brand}${b.product ? ` — ${b.product}` : ''}
              </div>`).join('')}
          </div>` : ''}
        </div>`;
      }).join('')}
    `;
  }

  // ── REGISTRAR COMIDA ──────────────────────────────────────────────────
  function selectOption(mealKey, label, optionId) {
    _pendingPhoto = null;
    Sounds.click();
    const isCustom = optionId === 'Personalizado';
    const option = isCustom ? null : (_plan.meals[label] || []).find(o => o.id === optionId);
    const defaultDescription = isCustom ? '' : option.items.join(', ');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-header">
          <div class="modal-title">${MEAL_ICONS[mealKey]} ${label}${isCustom ? '' : ` — Opción ${optionId}`}</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          ${!isCustom ? `
          <div style="background:var(--bg-input);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--text-2);line-height:1.5">
            ${option.items.join(' · ')}
          </div>` : ''}
          <div class="input-group">
            <label class="input-label">${isCustom ? '¿Qué comiste?' : 'Ajustes o descripción (opcional)'}</label>
            <input class="input" id="ml-descripcion" placeholder="${isCustom ? 'Ej. torta de jamón' : 'Ej. le agregué un poco más de arroz'}" value="${defaultDescription.replace(/"/g,'&quot;')}">
          </div>
          <div class="input-group">
            <label class="input-label">Foto de tu comida (opcional)</label>
            <input type="file" accept="image/*" capture="environment" id="ml-photo-input" style="display:none" onchange="Nutricion._handlePhotoSelect(event)">
            <div id="ml-photo-preview" style="display:flex;align-items:center;gap:10px">
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('ml-photo-input').click()">📷 Tomar/subir foto</button>
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">Notas (opcional)</label>
            <input class="input" id="ml-notes" placeholder="Ej. tenía mucha hambre hoy">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="ml-save-btn" onclick="Nutricion.saveMealLog('${mealKey}', '${label}', '${optionId}')">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  // Comprime la imagen en el navegador antes de subirla — una foto de
  // cámara puede pesar varios MB, esto la reduce a algo razonable para
  // no saturar la conexión del gym.
  function _handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 900;
        let { width, height } = img;
        if (width > maxWidth) { height = Math.round(height * (maxWidth / width)); width = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        _pendingPhoto = { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', previewUrl: dataUrl };

        const preview = document.getElementById('ml-photo-preview');
        if (preview) {
          preview.innerHTML = `
            <img src="${dataUrl}" style="width:60px;height:60px;border-radius:8px;object-fit:cover">
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('ml-photo-input').click()">Cambiar foto</button>`;
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  let _savingMealLog = false;

  async function saveMealLog(mealKey, label, optionId) {
    if (_savingMealLog) return; // evita doble click / doble guardado
    _savingMealLog = true;
    const btn = document.getElementById('ml-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const val = id => document.getElementById(id)?.value || '';
    const today = Utils.today();

    try {
      let fotoUrl = '';
      if (_pendingPhoto) {
        try {
          const photoRes = await API.saveMealPhoto({ date: today, comida: label, imageBase64: _pendingPhoto.base64, mimeType: _pendingPhoto.mimeType });
          if (photoRes.success) fotoUrl = photoRes.url;
          else Toast.warning('La comida se guardó, pero la foto no se pudo subir');
        } catch(e) {
          Toast.warning('La comida se guardó, pero la foto no se pudo subir');
        }
      }

      const payload = {
        date: today, comida: label,
        opcion: optionId, descripcion: val('ml-descripcion'),
        fotoUrl, notes: val('ml-notes'),
      };

      const result = await API.saveMealLog(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();

      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — guardado localmente. Se sincronizará solo.');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success(`${label} registrado 🍽️`);
      }

      // Actualiza localmente para no esperar un refetch completo
      _mealLog = _mealLog.filter(m => !(m.date === today && m.comida === label));
      _mealLog.unshift({ date: today, comida: label, ...payload });
      _pendingPhoto = null;
      _editingMeals.delete(mealKey);
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar la comida');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    } finally {
      _savingMealLog = false;
    }
  }

  // ── REGISTRAR MARCA ────────────────────────────────────────────────
  function openBrandModal(category) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <div class="modal-title">🏷️ Nueva marca — ${category}</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="input-group">
            <label class="input-label">Marca</label>
            <input class="input" id="mb-brand" placeholder="Ej. Silver">
          </div>
          <div class="input-group">
            <label class="input-label">Producto específico (opcional)</label>
            <input class="input" id="mb-product" placeholder="Ej. Pan integral 100% trigo">
          </div>
          <div class="input-group">
            <label class="input-label">Notas (opcional)</label>
            <input class="input" id="mb-notes" placeholder="Ej. lo encontré en Chedraui">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" id="mb-save-btn" onclick="Nutricion.saveBrand('${category.replace(/'/g,"\\'")}')">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  let _savingBrand = false;

  async function saveBrand(category) {
    if (_savingBrand) return;
    const brand = document.getElementById('mb-brand')?.value || '';
    if (!brand.trim()) { Toast.error('Escribe el nombre de la marca'); return; }

    _savingBrand = true;
    const btn = document.getElementById('mb-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Guardando...'; }

    const val = id => document.getElementById(id)?.value || '';
    const payload = { category, brand, product: val('mb-product'), notes: val('mb-notes') };

    try {
      const result = await API.saveBrandChoice(payload);
      API.clearCache();
      document.querySelector('.modal-overlay')?.remove();
      if (result.queued) {
        Sounds.click(); Haptics.medium();
        Toast.warning('Sin conexión — se sincronizará solo');
      } else {
        Sounds.serieDone(); Haptics.success();
        Toast.success('Marca guardada');
      }
      _brands.unshift({ date: Utils.today(), ...payload });
      render();
    } catch(err) {
      Sounds.error();
      Toast.error('Error al guardar la marca');
      console.error(err);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    } finally {
      _savingBrand = false;
    }
  }

  return {
    init, setTab, selectOption, editMeal, cancelEdit, saveMealLog, openBrandModal, saveBrand,
    _handlePhotoSelect,
  };
})();

function initNutricion(container) { Nutricion.init(container); }
