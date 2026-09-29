// ═══════════════════════════════════════════
// CONFIGURACIÓN MODULE — Preferencias de la app
// Por ahora solo tiene la ciudad de "casa" (para la tarjeta de
// kilómetros comparados con distancias reales) — pensado para
// crecer con más ajustes más adelante.
// ═══════════════════════════════════════════

const Configuracion = (() => {

  let _profile = null;
  let _geocodeResult = null; // resultado crudo de Nominatim mientras se confirma, antes de guardar

  async function init(container) {
    container.innerHTML = `<div class="skeleton" style="height:220px;border-radius:16px;max-width:520px;margin:0 auto"></div>`;

    const res = await API.getProfile();
    _profile = res.profile || {};
    _geocodeResult = null;
    _render(container);
  }

  function _render(container) {
    const savedCity = _profile?.Ciudad_Origen || '';
    const savedLat  = _profile?.Ciudad_Lat;
    const savedLng  = _profile?.Ciudad_Lng;
    const pendingCount = typeof OfflineQueue !== 'undefined' ? OfflineQueue.count() : 0;

    container.innerHTML = `
      <div style="max-width:520px;margin:0 auto">
        <div class="card animate-slide-up">
          <div class="card-header">
            <div>
              <div class="card-title">🏠 Ciudad de origen ("casa")</div>
              <div class="card-subtitle">Se usa como punto de partida para comparar los kilómetros que corres contra distancias reales</div>
            </div>
          </div>

          ${savedCity ? `
          <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">📍</span>
            <div>
              <div style="font-weight:600;font-size:13px">${savedCity}</div>
              ${savedLat && savedLng ? `<div style="font-size:11px;color:var(--text-3)">${Number(savedLat).toFixed(4)}, ${Number(savedLng).toFixed(4)}</div>` : ''}
            </div>
          </div>` : `
          <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">Todavía no has configurado tu ciudad.</div>
          `}

          <div class="input-group">
            <label class="input-label">Busca tu ciudad</label>
            <input class="input" id="cfg-city-input" placeholder="Ej. Playa del Carmen, México" value="${savedCity}">
          </div>
          <button class="btn btn-secondary" style="width:100%;margin-top:10px" onclick="Configuracion.geocode()">
            🔍 Buscar
          </button>

          <div id="cfg-geocode-result"></div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <div>
              <div class="card-title">🧹 Mantenimiento</div>
              <div class="card-subtitle">Datos guardados en este teléfono que todavía no se han subido</div>
            </div>
          </div>
          <div id="cfg-queue-status" style="font-size:12px;color:var(--text-3);margin-bottom:12px">
            ${pendingCount > 0
              ? `${pendingCount} elemento${pendingCount === 1 ? '' : 's'} esperando a subirse`
              : 'No hay nada pendiente por subir ahora mismo'}
          </div>
          <button class="btn btn-secondary" style="width:100%" onclick="Configuracion.clearLocalData()">
            🗑️ Borrar datos guardados localmente
          </button>
        </div>

        ${_motionPanelHTML()}
      </div>`;
  }

  // ── MOVIMIENTO Y DISEÑO ──────────────────────────────────────────
  // Controla Motion (js/motion.js): duraciones, personalidad de la
  // curva, intensidad del vidrio y redondez de tarjetas. Cada control
  // llama su setter de Motion directo — ese ya aplica el cambio Y lo
  // guarda en localStorage, aquí solo se arma la interfaz.
  // Se guarda por dispositivo, no viaja entre celular y compu — así
  // se decidió a propósito, para mantenerlo simple.

  const _DURATION_ROWS = [
    { key: 'fast',    label: 'Toques y respuestas rápidas', min: 80,  max: 300 },
    { key: 'base',    label: 'Transiciones generales',      min: 100, max: 500 },
    { key: 'slow',    label: 'Cambios más notorios',        min: 200, max: 800 },
    { key: 'spring',  label: 'Rebote al soltar botones',    min: 250, max: 900 },
    { key: 'premium', label: 'Cambio de pantalla',          min: 150, max: 500 },
    { key: 'stagger', label: 'Cascada de tarjetas al cargar', min: 300, max: 900 },
  ];

  const _MOTION_PRESETS = {
    ios:      { fittrackerFast: '0.4, 0, 0.2, 1',    fittrackerSpring: '0.34, 1.56, 0.64, 1', fittrackerPremium: '0.16, 1, 0.3, 1' },
    material: { fittrackerFast: '0.4, 0, 0.2, 1',    fittrackerSpring: '0.25, 0.46, 0.45, 0.94', fittrackerPremium: '0.25, 0.46, 0.45, 0.94' },
    sharp:    { fittrackerFast: '0.2, 0, 0, 1',      fittrackerSpring: '0.2, 0, 0, 1',         fittrackerPremium: '0.2, 0, 0, 1' },
  };
  const _PRESET_LABELS = { ios: 'iOS (con rebote)', material: 'Suave (sin rebote)', sharp: 'Directo' };

  // Detecta qué preset coincide con las curvas actuales, para resaltar
  // el botón correcto — si el usuario ya jugó con esto antes y volvió
  // a entrar, no debe verse como si ninguno estuviera activo.
  function _currentPreset(eases) {
    for (const [name, curves] of Object.entries(_MOTION_PRESETS)) {
      if (curves.fittrackerFast === eases.fittrackerFast && curves.fittrackerSpring === eases.fittrackerSpring) return name;
    }
    return null; // el usuario movió algo a mano — ningún preset calza exacto, y está bien
  }

  function _motionPanelHTML() {
    const s = Motion.getSettings();
    const activePreset = _currentPreset(s.eases);
    const glassPct = Math.round(s.glassIntensity * 100);

    return `
        <div class="card animate-slide-up" style="margin-top:20px">
          <div class="card-header">
            <div>
              <div class="card-title">🎬 Movimiento y diseño</div>
              <div class="card-subtitle">Cada cambio se aplica al momento — pruébalo en cualquier pantalla después de ajustar</div>
            </div>
          </div>

          <div class="input-group">
            <label class="input-label">Personalidad del movimiento</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              ${Object.keys(_MOTION_PRESETS).map(name => `
                <button class="btn ${activePreset === name ? 'btn-primary' : 'btn-secondary'} btn-sm"
                  onclick="Configuracion.setMotionPreset('${name}')">${_PRESET_LABELS[name]}</button>
              `).join('')}
            </div>
          </div>

          <div style="margin-top:18px;display:flex;flex-direction:column;gap:14px">
            ${_DURATION_ROWS.map(row => {
              const ms = Math.round(s.durations[row.key] * 1000);
              return `
              <div class="input-group">
                <label class="input-label">${row.label} <span id="cfg-dur-${row.key}-val" style="color:var(--text-3)">${ms}ms</span></label>
                <input type="range" min="${row.min}" max="${row.max}" step="10" value="${ms}"
                  oninput="Configuracion.setMotionDuration('${row.key}', this.value)">
              </div>`;
            }).join('')}
          </div>

          <div class="input-group" style="margin-top:18px">
            <label class="input-label">Intensidad del vidrio <span id="cfg-glass-val" style="color:var(--text-3)">${glassPct}%</span></label>
            <input type="range" min="30" max="200" step="5" value="${glassPct}" oninput="Configuracion.setGlassIntensity(this.value)">
          </div>

          <div class="input-group" style="margin-top:14px">
            <label class="input-label">Redondez de tarjetas <span id="cfg-radius-val" style="color:var(--text-3)">${s.cardRadius}px</span></label>
            <input type="range" min="4" max="32" step="1" value="${s.cardRadius}" oninput="Configuracion.setCardRadius(this.value)">
          </div>

          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:18px" onclick="Configuracion.resetMotion()">
            ↺ Restablecer movimiento y diseño
          </button>
        </div>`;
  }

  // Arrastrar el slider dispara oninput muchas veces por segundo — se
  // actualiza solo el numerito de al lado por DOM directo, sin volver
  // a renderizar todo el panel (eso perdería el foco del slider a
  // media arrastrada y se sentiría trabado).
  function setMotionDuration(key, ms) {
    Motion.setDuration(key, Number(ms) / 1000);
    const el = document.getElementById(`cfg-dur-${key}-val`);
    if (el) el.textContent = `${ms}ms`;
  }
  function setGlassIntensity(pct) {
    Motion.setGlassIntensity(Number(pct) / 100);
    const el = document.getElementById('cfg-glass-val');
    if (el) el.textContent = `${pct}%`;
  }
  function setCardRadius(px) {
    Motion.setCardRadius(Number(px));
    const el = document.getElementById('cfg-radius-val');
    if (el) el.textContent = `${px}px`;
  }
  // Elegir un preset SÍ vuelve a pintar el panel completo — es una
  // acción discreta (un tap, no un arrastre), y así el botón activo
  // se resalta correctamente.
  function setMotionPreset(name) {
    const curves = _MOTION_PRESETS[name];
    if (!curves) return;
    Sounds.click();
    Object.entries(curves).forEach(([easeName, bezier]) => Motion.setEase(easeName, bezier));
    _render(document.getElementById('page-content'));
  }
  function resetMotion() {
    if (!confirm('¿Restablecer movimiento y diseño a los valores originales de la app?')) return;
    Sounds.click();
    Motion.resetSettings();
    _render(document.getElementById('page-content'));
    Toast.success('Restablecido');
  }

  // Nominatim (OpenStreetMap) — geocoding gratis, sin API key. Se
  // llama directo desde el navegador (no hace falta pasar por Apps
  // Script para esto). Solo se GUARDA cuando Diego confirma el
  // resultado — así si el nombre de la ciudad es ambiguo, no se
  // guarda el lugar equivocado sin que lo revise.
  async function geocode() {
    const query = document.getElementById('cfg-city-input')?.value?.trim();
    if (!query) return;
    Sounds.click();

    const resultDiv = document.getElementById('cfg-geocode-result');
    resultDiv.innerHTML = `<div style="font-size:12px;color:var(--text-3);margin-top:12px">Buscando...</div>`;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const data = await res.json();

      if (!data.length) {
        resultDiv.innerHTML = `<div style="font-size:12px;color:var(--danger);margin-top:12px">No se encontró esa ciudad — prueba con un nombre más específico (ej. agrega el país).</div>`;
        return;
      }

      _geocodeResult = { name: data[0].display_name, lat: Number(data[0].lat), lng: Number(data[0].lon) };
      resultDiv.innerHTML = `
        <div style="background:var(--accent-glow);border:1px solid var(--border-accent);border-radius:10px;padding:12px 14px;margin-top:12px">
          <div style="font-size:12px;color:var(--text-2);margin-bottom:8px">¿Es este el lugar correcto?</div>
          <div style="font-weight:600;font-size:13px;margin-bottom:10px">${_geocodeResult.name}</div>
          <button class="btn btn-primary btn-sm" style="width:100%" onclick="Configuracion.confirmSave()">✓ Sí, guardar esta ciudad</button>
        </div>`;
    } catch(e) {
      resultDiv.innerHTML = `<div style="font-size:12px;color:var(--danger);margin-top:12px">No se pudo buscar — revisa tu conexión e intenta de nuevo.</div>`;
    }
  }

  async function confirmSave() {
    if (!_geocodeResult) return;
    Sounds.click();
    try {
      await API.saveHomeCity({ cityName: _geocodeResult.name, lat: _geocodeResult.lat, lng: _geocodeResult.lng });
      API.clearCache();
      Router.invalidateAll();
      Toast.success('Ciudad guardada');
      const container = document.getElementById('page-content');
      await init(container);
    } catch(e) {
      Toast.warning('No se pudo guardar — intenta de nuevo');
    }
  }

  // Escape manual — ver el comentario en OfflineQueue.clearAll()
  // (offline.js). Confirma primero mostrando cuántos elementos hay,
  // porque esto SÍ puede perder una sesión que aún no se subió.
  function clearLocalData() {
    const n = typeof OfflineQueue !== 'undefined' ? OfflineQueue.count() : 0;
    const msg = n > 0
      ? `Hay ${n} elemento${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'} localmente que todavía no se ha${n === 1 ? '' : 'n'} subido. Si los borras, se pierden para siempre. ¿Continuar?`
      : 'No hay nada pendiente, pero esto de todas formas limpia cualquier dato guardado localmente. ¿Continuar?';
    if (!confirm(msg)) return;

    Sounds.click();
    if (typeof OfflineQueue !== 'undefined') OfflineQueue.clearAll();
    Toast.success('Datos locales borrados');
    _render(document.getElementById('page-content'));
  }

  return {
    init, geocode, confirmSave, clearLocalData,
    setMotionDuration, setGlassIntensity, setCardRadius, setMotionPreset, resetMotion,
  };
})();

function initConfiguracion(container) { Configuracion.init(container); }
