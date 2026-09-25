// ═══════════════════════════════════════════
// WRAPPED — resumen compartible estilo "Spotify Wrapped"
// Genera una imagen (PNG) con tus números del periodo elegido, lista
// para subir a redes. El HTML se construye a 360×640 (proporción de
// historia, 9:16) y se exporta a 3x de resolución (1080×1920) con
// html2canvas — se ve nítido incluso en pantalla completa.
// ═══════════════════════════════════════════

const Wrapped = (() => {

  const PERIOD_LABELS = {
    day: 'Hoy', week: 'Esta semana', month: 'Este mes', year: 'Este año', phase: 'Esta fase',
  };

  let _generating = false;

  function openPicker() {
    Sounds.click();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:340px">
        <div class="modal-header">
          <div class="modal-title">📸 Resumen para compartir</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:8px">
          ${Object.entries(PERIOD_LABELS).map(([key, label]) => `
            <button class="btn btn-secondary" style="width:100%;justify-content:flex-start" onclick="this.closest('.modal-overlay').remove();Wrapped.generate('${key}')">${label}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function generate(period) {
    if (_generating) return;
    _generating = true;
    Toast.success('Generando tu resumen...');

    try {
      const data = await API.getWrappedSummary(period);
      const cardEl = _buildCard(data);
      document.body.appendChild(cardEl);

      // scale:3 → el DOM se construye a 360×640 (fácil de diseñar) y
      // sale como imagen a 1080×1920, nítida a pantalla completa.
      const canvas = await html2canvas(cardEl, { scale: 3, backgroundColor: null, useCORS: true });
      cardEl.remove();

      _showPreview(canvas, data);
    } catch(e) {
      Toast.error('No se pudo generar el resumen');
      console.error(e);
    } finally {
      _generating = false;
    }
  }

  function _statBlock(icon, value, label, color) {
    return `
      <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:14px 10px;text-align:center">
        <div style="font-size:22px;margin-bottom:2px">${icon}</div>
        <div style="font-size:26px;font-weight:800;color:${color};line-height:1.1;font-family:'Poppins',sans-serif">${value}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">${label}</div>
      </div>`;
  }

  function _buildCard(data) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;left:-9999px;top:0;width:360px;height:640px;
      font-family:'Poppins',sans-serif;overflow:hidden;
      background:
        radial-gradient(circle at 15% 8%, rgba(0,255,135,0.35), transparent 45%),
        radial-gradient(circle at 90% 15%, rgba(124,58,237,0.35), transparent 45%),
        radial-gradient(circle at 20% 95%, rgba(124,58,237,0.25), transparent 40%),
        #0A0A12;
      display:flex;flex-direction:column;padding:28px 22px;color:#fff;box-sizing:border-box;
    `;

    const achievementIcons = { racha:'🔥', pr:'🏆', hit:'📈', fase:'🎯', sesiones:'📅', volumen:'🏋️', dominada:'💪' };
    const topAchievements = (data.achievementsInPeriod || []).slice(0, 3);

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,0.5);text-transform:uppercase">FitTracker Pro</div>
        <div style="background:rgba(0,255,135,0.15);border:1px solid rgba(0,255,135,0.4);border-radius:99px;padding:4px 12px;font-size:10px;font-weight:700;color:#00FF87">${data.label}</div>
      </div>

      <div style="margin-top:28px">
        <div style="font-size:13px;color:rgba(255,255,255,0.6);font-weight:500">Sesiones completadas</div>
        <div style="font-size:76px;font-weight:800;line-height:1;background:linear-gradient(135deg,#00FF87,#7C3AED);-webkit-background-clip:text;background-clip:text;color:transparent;margin-top:2px">${data.totalSessions}</div>
        ${data.currentStreak > 1 ? `<div style="font-size:12px;color:#F97316;font-weight:600;margin-top:4px">🔥 ${data.currentStreak} días de racha activa</div>` : ''}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px">
        ${_statBlock('🏋️', Utils.formatNum(data.totalVolume), 'kg movidos', '#00FF87')}
        ${_statBlock('🏃', data.totalKm > 0 ? data.totalKm + ' km' : '—', 'corridos', '#3B82F6')}
        ${_statBlock('🔥', Utils.formatNum(data.totalCalories), 'kcal activas', '#F97316')}
        ${_statBlock('⏱', Math.round(data.totalMinutes / 60 * 10) / 10 + 'h', 'entrenando', '#7C3AED')}
      </div>

      ${(data.prsInPeriod > 0 || topAchievements.length > 0) ? `
      <div style="margin-top:20px;flex:1">
        <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Destacados</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${data.prsInPeriod > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border-radius:12px;padding:8px 12px">
            <span style="font-size:16px">🏆</span>
            <span style="font-size:11px;font-weight:600">${data.prsInPeriod} récord${data.prsInPeriod === 1 ? '' : 'es'} personal${data.prsInPeriod === 1 ? '' : 'es'} rot${data.prsInPeriod === 1 ? 'o' : 'os'}</span>
          </div>` : ''}
          ${topAchievements.map(a => `
          <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border-radius:12px;padding:8px 12px">
            <span style="font-size:16px">${achievementIcons[a.tipo] || '⭐'}</span>
            <span style="font-size:11px;font-weight:600">${a.detalle}</span>
          </div>`).join('')}
        </div>
      </div>` : `<div style="flex:1"></div>`}

      <div style="text-align:center;padding-top:14px;border-top:1px solid rgba(255,255,255,0.1)">
        <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7)">${data.phaseLabel}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px">${data.diasActivos} día${data.diasActivos === 1 ? '' : 's'} activo${data.diasActivos === 1 ? '' : 's'} · ${Utils.formatDate(data.startDate)} – ${Utils.formatDate(data.endDate)}</div>
      </div>
    `;
    return el;
  }

  function _showPreview(canvas, data) {
    const dataUrl = canvas.toDataURL('image/png');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-header">
          <div class="modal-title">Tu resumen — ${data.label}</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="text-align:center">
          <img src="${dataUrl}" style="width:100%;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.4)">
        </div>
        <div class="modal-footer" style="display:flex;gap:8px">
          <button class="btn btn-secondary" style="flex:1" onclick="Wrapped.download('${dataUrl}','${data.period}')">⬇️ Descargar</button>
          <button class="btn btn-primary" style="flex:1" onclick="Wrapped.share('${dataUrl}','${data.period}')">📤 Compartir</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function download(dataUrl, period) {
    Sounds.click();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `fittracker-resumen-${period}-${Utils.today()}.png`;
    a.click();
  }

  // Web Share API — en móvil abre el selector nativo (Instagram,
  // WhatsApp, etc.) directo con la imagen ya adjunta. Si el navegador
  // no lo soporta (la mayoría de escritorio), cae a descargar.
  async function share(dataUrl, period) {
    Sounds.click();
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `fittracker-resumen-${period}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi resumen de entrenamiento' });
        return;
      }
    } catch(e) { /* cae a descarga abajo */ }
    download(dataUrl, period);
    Toast.warning('Tu navegador no soporta compartir directo — se descargó la imagen, súbela tú desde tu galería.');
  }

  return { openPicker, generate, download, share };
})();
