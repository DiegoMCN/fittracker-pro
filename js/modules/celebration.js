// ═══════════════════════════════════════════
// RECORD CELEBRATION — Confeti + detección de PRs
// ═══════════════════════════════════════════

const RecordCelebration = (() => {

  // ── DETECCIÓN — FUERZA ────────────────────────────────────────────────
  async function checkStrength(payload) {
    try {
      const metrics = await API.getMetrics();
      const prs = metrics.records?.exercisePRs || {};
      const broken = [];

      (payload.exercises || []).forEach(ex => {
        const rec = prs[ex.name];
        const prevMax = rec ? Number(rec.maxKg) || 0 : 0;
        const prevMin = rec ? Number(rec.minKg) || 0 : 0;

        // Separa las series de esta sesión por tipo: la asistencia mejora
        // cuando BAJA (menos ayuda de la máquina); la carga mejora cuando SUBE.
        const loadKgs   = (ex.sets || []).filter(s => s.kind !== 'assist').map(s => {
          const raw = parseFloat(s.kg) || 0;
          return s.unit === 'lbs' ? Utils.lbsToKg(raw) : raw;
        }).filter(k => k > 0);
        const assistKgs = (ex.sets || []).filter(s => s.kind === 'assist').map(s => {
          const raw = parseFloat(s.kg) || 0;
          return s.unit === 'lbs' ? Utils.lbsToKg(raw) : raw;
        }).filter(k => k > 0);

        if (loadKgs.length > 0) {
          const newMax = Math.max(...loadKgs);
          if (newMax > prevMax) {
            broken.push({
              label: ex.name,
              value: `${Utils.formatNum(newMax)} kg`,
              prev: prevMax > 0 ? `antes: ${Utils.formatNum(prevMax)} kg` : 'primer registro',
            });
          }
        }

        if (assistKgs.length > 0) {
          const newMin = Math.min(...assistKgs);
          if (prevMin === 0 || newMin < prevMin) {
            broken.push({
              label: `${ex.name} (menos asistencia)`,
              value: `${Utils.formatNum(newMin)} kg de asistencia`,
              prev: prevMin > 0 ? `antes: ${Utils.formatNum(prevMin)} kg` : 'primer registro',
            });
          }
        }
      });

      if (broken.length > 0) show(broken);
    } catch(e) { /* silencioso — un fallo aquí no debe interrumpir el flujo de guardado */ }
  }

  // ── DETECCIÓN — CARDIO ───────────────────────────────────────────────
  async function checkCardio(stats) {
    try {
      const metrics = await API.getMetrics();
      const broken = [];

      const prevRec = metrics.records?.fcRecovery?.value;
      const newRec = (stats.fcPost1 && stats.fcPost2) ? Math.round(Number(stats.fcPost2) - Number(stats.fcPost1)) : null;
      if (newRec !== null && (prevRec === null || prevRec === undefined || newRec < prevRec)) {
        broken.push({
          label: 'Recuperación cardíaca (2 min)',
          value: `${newRec} bpm`,
          prev: (prevRec !== null && prevRec !== undefined) ? `antes: ${prevRec} bpm` : 'primer registro',
        });
      }

      const prevCad = Number(metrics.records?.cadencePeak?.value) || 0;
      const newCad = parseFloat(stats.cadPeak) || 0;
      if (newCad > 0 && newCad > prevCad) {
        broken.push({
          label: 'Pico de cadencia',
          value: `${newCad} spm`,
          prev: prevCad > 0 ? `antes: ${prevCad} spm` : 'primer registro',
        });
      }

      if (broken.length > 0) show(broken);
    } catch(e) { /* silencioso */ }
  }

  // ── OVERLAY VISUAL ────────────────────────────────────────────────────
  function show(records) {
    Sounds.newRecord(); Haptics.done();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;
      background:rgba(8,8,15,0.88);backdrop-filter:blur(8px);cursor:pointer;
      animation:fade-in 300ms forwards;padding:20px;
    `;
    overlay.innerHTML = `
      <canvas id="confetti-canvas" style="position:fixed;inset:0;pointer-events:none"></canvas>
      <div class="animate-bounce-in" style="text-align:center;max-width:380px;width:100%">
        <div style="font-size:72px;margin-bottom:10px">🏆</div>
        <div style="font-size:22px;font-weight:800;color:var(--accent);text-shadow:0 0 30px rgba(0,255,135,0.5);margin-bottom:4px">
          ¡Nuevo récord!
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:20px">
          ${records.length > 1 ? `Rompiste ${records.length} marcas personales` : 'Rompiste una marca personal'}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${records.map(r => `
            <div class="card card-accent" style="text-align:left">
              <div style="font-size:11px;color:var(--text-3)">${r.label}</div>
              <div style="font-size:18px;font-weight:700;color:var(--accent)">${r.value}</div>
              <div style="font-size:10px;color:var(--text-4);margin-top:2px">${r.prev}</div>
            </div>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-4);margin-top:20px">Toca en cualquier lado para continuar</div>
      </div>`;

    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
    _confetti(document.getElementById('confetti-canvas'));

    setTimeout(() => overlay.remove(), 7000);
  }

  // ── CONFETI (canvas puro, sin librerías) ─────────────────────────────
  function _confetti(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#00FF87', '#7C3AED', '#F59E0B', '#3B82F6', '#EC4899'];
    const particles = Array.from({ length: 130 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.6,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 12,
    }));

    let frame = 0;
    function loop() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (frame < 260) requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    loop();
  }

  return { checkStrength, checkCardio };
})();
