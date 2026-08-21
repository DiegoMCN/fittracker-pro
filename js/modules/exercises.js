// ═══════════════════════════════════════════
// EXERCISES MODULE — Catálogo con fotos/videos
// ═══════════════════════════════════════════

const Exercises = (() => {

  let _exercises = [];
  let _filter = 'all';
  let _search = '';
  let _usingMock = false;

  async function init(container) {
    container.innerHTML = `
      <div class="grid-auto">
        ${[1,2,3,4,5,6].map(() => `<div class="skeleton" style="height:200px;border-radius:16px"></div>`).join('')}
      </div>`;

    const res = await API.getExercises();
    _exercises = res.exercises || [];
    _usingMock = API.isMock();
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
  }

  function _exerciseCard(ex) {
    const tagMap = { 'Pecho':'chest','Espalda':'back','Biceps':'biceps','Triceps':'triceps','Hombro':'shoulder',
      'Cuadriceps':'legs','Isquiotibiales':'legs','Pantorrillas':'legs','Core':'core','Calistenia':'cali','Cardio':'cardio' };
    const tagCls = tagMap[ex.Grupo_Muscular] || 'core';
    const hasPhoto = ex.Foto_URL && ex.Foto_URL.trim();
    const hasVideo = ex.Video_URL && ex.Video_URL.trim();

    return `
    <div class="card" style="padding:0;overflow:hidden;cursor:pointer;transition:all 0.2s"
      onclick="Exercises.openDetail('${ex.ID}')"
      onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-md)'"
      onmouseleave="this.style.transform='';this.style.boxShadow=''">

      <div style="height:140px;background:var(--bg-input);position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden">
        ${hasPhoto
          ? `<img src="${ex.Foto_URL}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
             <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:32px">🏋️</div>`
          : `<div style="font-size:32px;opacity:0.4">🏋️</div>`}
        ${hasVideo ? `<div style="position:absolute;top:8px;right:8px;background:var(--bg-overlay);border-radius:8px;padding:4px 8px;font-size:10px;display:flex;align-items:center;gap:4px">▶ video</div>` : ''}
      </div>

      <div style="padding:14px">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${ex.Nombre}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <span class="tag tag-${tagCls}">${ex.Grupo_Muscular || '—'}</span>
          ${ex.Tipo ? `<span style="font-size:10px;color:var(--text-4)">${ex.Tipo}</span>` : ''}
        </div>
        ${ex.Notas ? `<div style="font-size:11px;color:var(--text-3);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ex.Notas}</div>` : ''}
      </div>
    </div>`;
  }

  function setFilter(g) { _filter = g; Sounds.click(); render(); }
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
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
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
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          <button class="btn btn-primary" onclick="Exercises.openEditor('${ex.ID}')">✏️ Editar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
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
    document.querySelector('.modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">${ex ? '✏️ Editar' : '+ Nuevo'} ejercicio</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
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
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
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
      document.querySelector('.modal-overlay')?.remove();
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
