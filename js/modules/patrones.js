// ═══════════════════════════════════════════
// LO QUE TUS DATOS DICEN DE TI — tus reglas personales
// ═══════════════════════════════════════════
// Todo el cálculo vive en el backend (12_Patrones.gs). Aquí solo se
// cuenta la historia: lo confirmado, lo que está en observación y lo que
// tus datos ya descartaron — sin vender coincidencias.

const Patrones = (() => {
  let _d = null;
  const esc = (s) => Utils.escapeHtml(s);
  const ICON = { forma: '🔮', descanso: '🛌', sueno: '😴', calor: '🌡️', humedad: '💧' };
  const OUT_ICON = { fuerza: '🏋️', recuperacion: '❤️', cadencia: '👟' };
  const pctText = (q) => q < 0.001 ? 'menos de 0.1%' : (q * 100).toFixed(q < 0.01 ? 1 : 0) + '%';

  async function init(container) {
    container.innerHTML = `<div style="max-width:760px;margin:0 auto">${[200, 240, 200].map(h => `<div class="skeleton" style="height:${h}px;border-radius:var(--card-radius);margin-bottom:16px"></div>`).join('')}</div>`;
    try { _d = await API.getPersonalPatterns(); } catch(e) { _d = null; }
    if (!_d || !_d.meta) {
      container.innerHTML = `<div class="card" style="max-width:560px;margin:0 auto;text-align:center;padding:32px 20px"><div style="font-size:40px">🧬</div><div style="font-size:15px;font-weight:700;margin-top:6px">No se pudo analizar tu historial</div><div style="font-size:12px;color:var(--text-3);margin-top:6px">Revisa tu conexión e intenta de nuevo.</div></div>`;
      return;
    }
    render(container);
  }

  function render(container) {
    const d = _d, n = d.rules.length;
    container.innerHTML = `
    <div style="max-width:760px;margin:0 auto;padding-bottom:40px">

      <div class="card section" style="text-align:center;position:relative;overflow:hidden">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 0%, rgba(124,58,237,0.18), transparent 60%);pointer-events:none"></div>
        <div id="pt-dna" style="font-size:42px">🧬</div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-top:4px">Reglas confirmadas con tu historial</div>
        <div id="pt-count" style="font-size:52px;font-weight:800;color:${n ? 'var(--accent)' : 'var(--text-2)'};line-height:1.1">0</div>
        <div style="font-size:13px;color:var(--text-2);max-width:460px;margin:6px auto 0;line-height:1.55">
          ${n ? `Cosas que de verdad cambian cómo rindes — comprobadas contra el azar con ${d.meta.strengthSessions + d.meta.cardioSessions} sesiones tuyas.`
              : `Todavía ninguna — y eso es buena señal: no te vendo coincidencias. Con cada sesión que registras, esto se vuelve a revisar.`}
        </div>
        <div style="display:flex;justify-content:center;gap:18px;margin-top:14px;font-size:11px;color:var(--text-3)">
          <span><b style="color:var(--text-1)">${d.watching.length}</b> en observación</span>
          <span><b style="color:var(--text-1)">${d.noRelation.length}</b> descartadas</span>
          <span><b style="color:var(--text-1)">${d.meta.tested}</b> ya probadas</span>
        </div>
      </div>

      ${d.rules.map(_ruleCard).join('')}

      ${d.watching.length ? `
      <div class="card section">
        <div class="card-header"><div><div class="card-title">🔭 En observación</div><div class="card-subtitle">Relaciones que todavía no tienen datos suficientes para probarse en serio</div></div></div>
        <div style="display:flex;flex-direction:column;gap:12px">${d.watching.map(_watchRow).join('')}</div>
      </div>` : ''}

      ${d.noRelation.length ? `
      <div class="card section">
        <div class="card-header"><div><div class="card-title">🧹 Descartadas (por ahora)</div><div class="card-subtitle">Ya hay datos suficientes y no se ve un efecto real — también es información útil</div></div></div>
        <div style="display:flex;flex-direction:column;gap:10px">${d.noRelation.map(_noRow).join('')}</div>
      </div>` : ''}

      <div class="card section">
        <button class="btn btn-ghost btn-sm" style="width:100%" onclick="Patrones.toggleHow()"><span id="pt-how-arrow">▸</span> ¿Cómo lo sabe? (y por qué puedes confiar)</button>
        <div id="pt-how" style="display:none;font-size:12px;color:var(--text-2);line-height:1.65;margin-top:12px">
          <p><b>1. Contra ti mismo.</b> Tu fuerza del día se mide como qué tan arriba o abajo quedaste de <b>tu propia línea de progreso</b> en cada ejercicio. Así no se confunde "estás progresando" con "ese día rendiste más".</p>
          <p style="margin-top:8px"><b>2. Contra el azar.</b> Para cada relación se revuelven tus datos ${d.meta.perms.toLocaleString('es-MX')} veces y se ve qué tan seguido aparece un patrón igual de fuerte por pura casualidad. Si sale seguido, no es regla.</p>
          <p style="margin-top:8px"><b>3. Sin pescar.</b> Probar muchas relaciones a la vez hace que alguna "salga" por suerte. Por eso se controla la tasa de falsos descubrimientos: a lo mucho 1 de cada ${Math.round(1 / d.meta.fdr)} reglas mostradas podría ser casualidad.</p>
          <p style="margin-top:8px"><b>4. Que importe.</b> Además debe tener un efecto real (correlación de al menos ${d.meta.minRho}), y al menos ${d.meta.minN} sesiones con el dato.</p>
          <p style="margin-top:8px;color:var(--text-3)">Es correlación, no causa garantizada: si dos cosas van juntas, la regla te dice dónde poner atención. Y cada sesión nueva la vuelve a poner a prueba.</p>
        </div>
      </div>
    </div>`;

    if (typeof Motion !== 'undefined') Motion.staggerIn(container.querySelectorAll('.section'));
    _animate();
  }

  function _ruleCard(r) {
    const vals = r.means.map(Math.abs), max = Math.max(...vals, 0.1);
    const better = r.betterGroup;
    const bar = (i) => {
      const w = Math.max(8, Math.round(Math.abs(r.means[i]) / max * 100));
      const isBest = i === better;
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:3px"><span>${esc(r.groups[i])}</span><span style="color:${isBest ? 'var(--accent)' : 'var(--text-2)'};font-weight:700">${r.means[i] > 0 ? '+' : ''}${r.means[i]}${esc(r.unit)}</span></div>
        <div style="height:10px;background:var(--bg-input);border-radius:99px;overflow:hidden"><div class="pt-bar" data-w="${w}" style="height:100%;width:0%;border-radius:99px;background:${isBest ? 'linear-gradient(90deg, var(--purple), var(--accent))' : 'var(--text-4)'}"></div></div>
        <div style="font-size:10px;color:var(--text-4);margin-top:2px">${r.nGroups[i]} sesiones</div>
      </div>`;
    };
    return `
      <div class="card section" style="border-color:rgba(0,255,135,0.25)">
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">
          <div style="font-size:26px;line-height:1">${ICON[r.predictor] || '🧬'}</div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700;line-height:1.4">${esc(r.headline)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${r.strength === 'fuerte' ? 'rgba(0,255,135,0.15)' : 'rgba(59,130,246,0.15)'};color:${r.strength === 'fuerte' ? 'var(--accent)' : 'var(--info)'}">Evidencia ${esc(r.strength)}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:var(--bg-input);color:var(--text-3)">${OUT_ICON[r.outcome] || ''} ${esc(r.outcomeLabel)}</span>
            </div>
          </div>
        </div>
        ${bar(0)}${bar(1)}
        <div style="font-size:11px;color:var(--text-3);margin:4px 0 10px;line-height:1.5">Basado en ${r.n} sesiones tuyas · probabilidad de que sea casualidad: ${pctText(r.q)}</div>
        <div style="font-size:12px;line-height:1.55;padding:10px 12px;border-radius:10px;background:var(--bg-input)">💡 <b>Qué hacer con esto:</b> ${esc(r.tip)}</div>
      </div>`;
  }

  function _watchRow(w) {
    const total = w.n + w.needed, pct = Math.round(w.n / total * 100);
    return `<div>
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:4px">
        <span>${OUT_ICON[w.outcome] || ''} ${esc(w.outcomeLabel)} <span style="color:var(--text-4)">↔</span> ${ICON[w.predictor] || ''} ${esc(w.predictorLabel)}</span>
        <span style="color:var(--text-3);white-space:nowrap">${w.n}/${total}</span>
      </div>
      <div style="height:6px;background:var(--bg-input);border-radius:99px;overflow:hidden"><div class="pt-bar" data-w="${pct}" style="height:100%;width:0%;border-radius:99px;background:var(--purple)"></div></div>
      <div style="font-size:10px;color:var(--text-4);margin-top:3px">${w.needed === 1 ? 'Falta 1 sesión' : `Faltan ${w.needed} sesiones`} — ${esc(w.reason.replace(/^faltan sesiones /, ''))}</div>
    </div>`;
  }

  function _noRow(r) {
    return `<div style="font-size:12px;line-height:1.5;padding:8px 10px;border-radius:10px;background:var(--bg-input)">
      ${OUT_ICON[r.outcome] || ''} <b>${esc(r.outcomeLabel)}</b> no cambia de forma clara con ${esc(r.predictorLabel)}
      <div style="font-size:10px;color:var(--text-4);margin-top:2px">${r.n} sesiones · ${esc(r.groups[0])}: ${r.means[0] > 0 ? '+' : ''}${r.means[0]}${esc(r.unit)} vs. ${esc(r.groups[1])}: ${r.means[1] > 0 ? '+' : ''}${r.means[1]}${esc(r.unit)} — diferencia dentro de lo que da el azar</div>
    </div>`;
  }

  function _animate() {
    const target = _d.rules.length, el = document.getElementById('pt-count');
    const bars = document.querySelectorAll('.pt-bar');
    if (typeof gsap === 'undefined') {
      if (el) el.textContent = target;
      bars.forEach(b => { b.style.width = b.dataset.w + '%'; });
      return;
    }
    const o = { v: 0 };
    gsap.to(o, { v: target, duration: 1, ease: 'power2.out', onUpdate: () => { if (el) el.textContent = Math.round(o.v); }, onComplete: () => { if (el) el.textContent = target; } });
    gsap.fromTo('#pt-dna', { rotation: -20, scale: 0.6 }, { rotation: 0, scale: 1, duration: 1.1, ease: 'elastic.out(1, 0.5)' });
    bars.forEach((b, i) => gsap.to(b, { width: b.dataset.w + '%', duration: 0.9, ease: 'power3.out', delay: 0.25 + i * 0.05 }));
  }

  function toggleHow() {
    const el = document.getElementById('pt-how'), ar = document.getElementById('pt-how-arrow');
    const open = el.style.display === 'none';
    el.style.display = open ? 'block' : 'none'; ar.textContent = open ? '▾' : '▸';
    if (open && typeof gsap !== 'undefined') gsap.from(el, { opacity: 0, y: -6, duration: 0.3 });
  }

  return { init, toggleHow };
})();

function initPatrones(container) { Patrones.init(container); }
