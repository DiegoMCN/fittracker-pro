// ═══════════════════════════════════════════
// SESSION SHARE — tarjeta compartible de UNA sesión (mismo motor que Wrapped)
// Wrapped resume un PERIODO completo; esto resume la sesión que Diego
// acaba de terminar. Reutiliza la misma idea (HTML a 360×640, exportado
// a 3x con html2canvas, Web Share API con fallback a descarga) para que
// las dos se vean como parte de la misma familia visual — pero el
// contenido y el disparador son distintos: esto se ofrece justo en la
// pantalla de resumen post-sesión (workout.js y cardio.js), no desde un
// selector de periodo.
// ═══════════════════════════════════════════

const SessionShare = (() => {
  const KIND_META = {
    Fuerza: { badge: 'FUERZA', accent: '#00FF87' },
    Cardio: { badge: 'CARDIO', accent: '#3B82F6' },
    HIT:    { badge: 'HIT',    accent: '#F97316' },
  };
  const ACHIEVEMENT_ICONS = { racha: '🔥', pr: '🏆', hit: '📈', fase: '🎯', sesiones: '📅', volumen: '🏋️', dominada: '💪' };

  let _generating = false;

  // data = {
  //   kind: 'Fuerza'|'Cardio'|'HIT', title: string, date: 'YYYY-MM-DD', durationMin: number,
  //   hero: { value, unit, label }, stats: [{icon,value,label,color}, ...] (máx 4),
  //   achievements: [{tipo, detalle}, ...], weather: {tempC, humidityPct} | null,
  // }
  async function generate(data) {
    if (_generating) return;
    _generating = true;
    Toast.success('Generando tu tarjeta...');

    try {
      const cardEl = _buildCard(data);
      document.body.appendChild(cardEl);
      const canvas = await html2canvas(cardEl, { scale: 3, backgroundColor: null, useCORS: true });
      cardEl.remove();
      _showPreview(canvas, data);
    } catch(e) {
      Toast.error('No se pudo generar la tarjeta');
      console.error(e);
    } finally {
      _generating = false;
    }
  }

  function _statBlock(icon, value, label, color) {
    return `
      <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:14px 10px;text-align:center">
        <div style="font-size:22px;margin-bottom:2px">${icon}</div>
        <div style="font-size:22px;font-weight:800;color:${color};line-height:1.1;font-family:'Poppins',sans-serif">${value}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">${label}</div>
      </div>`;
  }

  function _buildCard(data) {
    const meta = KIND_META[data.kind] || KIND_META.Fuerza;
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;left:-9999px;top:0;width:360px;height:640px;
      font-family:'Poppins',sans-serif;overflow:hidden;
      background:
        radial-gradient(circle at 15% 8%, ${meta.accent}59, transparent 45%),
        radial-gradient(circle at 90% 15%, rgba(124,58,237,0.35), transparent 45%),
        radial-gradient(circle at 20% 95%, rgba(124,58,237,0.25), transparent 40%),
        #0A0A12;
      display:flex;flex-direction:column;padding:28px 22px;color:#fff;box-sizing:border-box;
    `;

    const achievements = (data.achievements || []).slice(0, 3);

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,0.5);text-transform:uppercase">FitTracker Pro</div>
        <div style="background:${meta.accent}26;border:1px solid ${meta.accent}66;border-radius:99px;padding:4px 12px;font-size:10px;font-weight:700;color:${meta.accent}">${meta.badge}</div>
      </div>

      <div style="margin-top:28px">
        <div style="font-size:13px;color:rgba(255,255,255,0.6);font-weight:500">${data.title}</div>
        <div style="font-size:64px;font-weight:800;line-height:1;background:linear-gradient(135deg,${meta.accent},#7C3AED);-webkit-background-clip:text;background-clip:text;color:transparent;margin-top:2px">${data.hero.value}<span style="font-size:26px">${data.hero.unit}</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);font-weight:500;margin-top:4px">${data.hero.label}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:24px">
        ${(data.stats || []).slice(0, 4).map(s => _statBlock(s.icon, s.value, s.label, s.color)).join('')}
      </div>

      ${achievements.length > 0 ? `
      <div style="margin-top:20px;flex:1">
        <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Destacados</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${achievements.map(a => `
          <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border-radius:12px;padding:8px 12px">
            <span style="font-size:16px">${ACHIEVEMENT_ICONS[a.tipo] || '⭐'}</span>
            <span style="font-size:11px;font-weight:600">${a.detalle}</span>
          </div>`).join('')}
        </div>
      </div>` : `<div style="flex:1"></div>`}

      <div style="text-align:center;padding-top:14px;border-top:1px solid rgba(255,255,255,0.1)">
        <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7)">${Utils.formatDuration(data.durationMin)}${data.weather ? ` · ${data.weather.tempC}°C / ${data.weather.humidityPct}% humedad` : ''}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px">${Utils.formatDate(data.date)}</div>
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
          <div class="modal-title">Tu sesión — ${data.title}</div>
          <button class="btn btn-ghost btn-icon" onclick="Motion.closeModal(this.closest('.modal-overlay'))">✕</button>
        </div>
        <div class="modal-body" style="text-align:center">
          <img src="${dataUrl}" style="width:100%;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.4)">
        </div>
        <div class="modal-footer" style="display:flex;gap:8px">
          <button class="btn btn-secondary" style="flex:1" onclick="SessionShare.download('${dataUrl}','${data.date}')">⬇️ Descargar</button>
          <button class="btn btn-primary" style="flex:1" onclick="SessionShare.share('${dataUrl}','${data.date}')">📤 Compartir</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function download(dataUrl, date) {
    Sounds.click();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `fittracker-sesion-${date}.png`;
    a.click();
  }

  async function share(dataUrl, date) {
    Sounds.click();
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `fittracker-sesion-${date}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi sesión de entrenamiento' });
        return;
      }
    } catch(e) { /* cae a descarga abajo */ }
    download(dataUrl, date);
    Toast.warning('Tu navegador no soporta compartir directo — se descargó la imagen, súbela tú desde tu galería.');
  }

  return { generate, download, share };
})();
