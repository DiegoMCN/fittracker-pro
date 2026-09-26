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
        <div class="card stagger-in">
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
      </div>`;
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

  return { init, geocode, confirmSave, clearLocalData };
})();

function initConfiguracion(container) { Configuracion.init(container); }
