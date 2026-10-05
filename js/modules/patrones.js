// ═══════════════════════════════════════════
// LO QUE TUS DATOS DICEN DE TI — tus reglas personales
// ═══════════════════════════════════════════
// Todo el cálculo vive en el backend (12_Patrones.gs). Aquí solo se
// cuenta la historia: lo confirmado, lo que está en observación y lo que
// tus datos ya descartaron — sin vender coincidencias.

const Patrones = (() => {
  let _d = null;
  const esc = (s) => Utils.escapeHtml(s);
  const ICON = { forma: '🔮', descanso: '🛌', sueno: '😴', calor: '🌡️', humedad: '💧', energia: '⚡' };
  const OUT_ICON = { fuerza: '🏋️', recuperacion: '❤️', cadencia: '👟' };
  // ── EXPLICACIONES (ⓘ) ──────────────────────────────────────────
  // Lenguaje simple. Cada una dice QUÉ es, CÓMO se mide y POR QUÉ importa.
  const INFO_OUT = {
    fuerza: { t: '🏋️ Fuerza del día', d: 'Qué tan bien rindió tu fuerza ese día comparado con <b>tu propia línea de progreso</b>. Cada ejercicio tiene su línea (cómo vas subiendo con el tiempo): si ese día quedaste arriba de la línea, rendiste mejor de lo normal <i>para ti en ese momento</i>; si quedaste abajo, peor.<br><br>Así no se confunde "estás progresando" con "hoy rendiste más". Cuentan los ejercicios con carga y los de asistencia (tu peso menos la asistencia); los de solo peso corporal o tiempo no entran.' },
    recuperacion: { t: '❤️ Recuperación cardíaca', d: 'Cuántos latidos baja tu pulso en los <b>2 minutos</b> después de terminar un cardio intenso. Por eso es un número negativo: −27 significa que bajó 27 latidos.<br><br><b>Más negativo = tu corazón se recupera mejor.</b> Solo cuenta el cardio intenso medido con la ventana de 2 minutos; la Zona 2 no cuenta porque ahí el pulso casi no sube.' },
    cadencia: { t: '👟 Cadencia en sprint', d: 'Tus pasos por minuto promedio en <b>Sprint técnico</b>. Subirla hacia 170 es una de tus metas. Solo cuenta ese protocolo porque en Zona 2 la cadencia es otra cosa y mezclarlas confundiría el resultado.' },
  };
  const INFO_PRED = {
    forma: { t: '🔮 Tu forma del día', d: 'Es la "Forma" del Simulador: tu condición menos tu fatiga ese día, en %. <b>Negativo = llegas cargado; positivo = llegas fresco.</b> Aquí se compara: días que llegas cargado (menos de 0%) contra días que llegas fresco (0% o más).' },
    descanso: { t: '🛌 Días de descanso previos', d: 'Cuántos días sin entrenar hubo antes de esa sesión. <b>0 = entrenaste el día anterior.</b> Se compara entrenar al día siguiente de otra sesión contra llegar con al menos un día libre.' },
    sueno: { t: '😴 Tu sueño', d: 'La calidad de sueño (1 a 10) de la noche anterior, tomada de tu check-in de la mañana o de lo que anotaste al terminar la sesión. Se compara dormir <b>menos de 7</b> contra <b>7 o más</b>.' },
    energia: { t: '⚡ Tu energía al amanecer', d: 'Lo que marcas en el check-in del Dashboard (1 a 5). Se compara amanecer con <b>poca energía (1–2)</b> contra <b>buena (3–5)</b>.' },
    calor: { t: '🌡️ La temperatura', d: 'Los °C del lugar durante tu cardio (la app lo guarda sola). Se compara <b>menos de 30 °C</b> contra <b>30 °C o más</b>.' },
    humedad: { t: '💧 La humedad', d: 'El % de humedad durante tu cardio (la app lo guarda sola). Se compara <b>menos de 80%</b> contra <b>80% o más</b>.' },
  };
  const INFO_TERM = {
    regla: { t: '🧬 ¿Qué es una regla confirmada?', d: 'Algo que cambia de verdad cómo rindes, <b>comprobado contra el azar</b> con tus propias sesiones. Para llegar aquí, una relación tiene que cumplir tres cosas: tener datos suficientes, que la diferencia sea clara (no mínima) y que sea muy poco probable que sea casualidad.<br><br>Si hoy ves 0, no es una falla: la app prefiere decirte "todavía no sé" que venderte una coincidencia.' },
    observacion: { t: '🔭 En observación', d: 'Relaciones que la app quiere probar, pero <b>todavía no tiene suficientes sesiones con los dos datos</b>. El mínimo es 8 sesiones con ambos datos y al menos 3 de cada lado de la comparación (por ejemplo, 3 noches de menos de 7 y 3 de 7 o más).<br><br>La barra avanza con cada sesión que registras. Para llenarla más rápido: haz tu check-in diario.' },
    descartada: { t: '🧹 Descartadas (por ahora)', d: 'Ya hay datos suficientes y la diferencia entre los dos grupos es del tamaño que saldría <b>por pura casualidad</b>. No significa que nunca influya: significa que con tus datos de hoy no se ve un efecto claro. Se vuelve a revisar con cada sesión nueva.' },
    evidencia: { t: '📊 Evidencia fuerte o moderada', d: '<b>Fuerte:</b> el patrón es claro (correlación de al menos 0.5) y hay menos de 5% de probabilidad de que sea casualidad.<br><b>Moderada:</b> el patrón es real pero más suave (correlación de al menos 0.3) con menos de 10% de probabilidad de casualidad.<br><br>La correlación va de −1 a 1: 0 es "sin relación" y cerca de ±1 es "casi siempre van juntos".' },
    casualidad: { t: '🎲 Probabilidad de que sea casualidad', d: 'La app revuelve tus datos <b>2,000 veces</b> y cuenta qué tan seguido aparece, solo por azar, un patrón tan fuerte como el tuyo. Si pasa 3 de cada 100 veces, la probabilidad es 3%.<br><br><b>Menor = más confiable.</b> El número ya está ajustado por haber probado varias relaciones a la vez.' },
  };
  const _ib = (call, label) => Utils.infoButtonHTML(call, label || '¿Qué significa?');
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
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:6px">Reglas confirmadas con tu historial ${_ib("Patrones.infoTerm('regla')")}</div>
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
        <div class="card-header"><div><div class="card-title">🔭 En observación</div><div class="card-subtitle">Relaciones que todavía no tienen datos suficientes para probarse en serio</div></div>${_ib("Patrones.infoTerm('observacion')")}</div>
        <div style="display:flex;flex-direction:column;gap:12px">${d.watching.map(_watchRow).join('')}</div>
      </div>` : ''}

      ${d.noRelation.length ? `
      <div class="card section">
        <div class="card-header"><div><div class="card-title">🧹 Descartadas (por ahora)</div><div class="card-subtitle">Ya hay datos suficientes y no se ve un efecto real — también es información útil</div></div>${_ib("Patrones.infoTerm('descartada')")}</div>
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
            <div style="display:flex;gap:6px;align-items:flex-start;justify-content:space-between"><div style="font-size:15px;font-weight:700;line-height:1.4">${esc(r.headline)}</div>${_ib(`Patrones.infoRel('${r.id}')`, 'Qué se compara')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${r.strength === 'fuerte' ? 'rgba(0,255,135,0.15)' : 'rgba(59,130,246,0.15)'};color:${r.strength === 'fuerte' ? 'var(--accent)' : 'var(--info)'}">Evidencia ${esc(r.strength)}</span><span style="display:inline-flex;align-items:center">${_ib("Patrones.infoTerm('evidencia')", 'Qué significa la evidencia')}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:var(--bg-input);color:var(--text-3)">${OUT_ICON[r.outcome] || ''} ${esc(r.outcomeLabel)}</span>
            </div>
          </div>
        </div>
        ${bar(0)}${bar(1)}
        <div style="font-size:11px;color:var(--text-3);margin:4px 0 10px;line-height:1.5">Basado en ${r.n} sesiones tuyas · probabilidad de que sea casualidad: ${pctText(r.q)} ${_ib("Patrones.infoTerm('casualidad')", 'Qué significa')}</div>
        <div style="font-size:12px;line-height:1.55;padding:10px 12px;border-radius:10px;background:var(--bg-input)">💡 <b>Qué hacer con esto:</b> ${esc(r.tip)}</div>
      </div>`;
  }

  function _watchRow(w) {
    const total = w.n + w.needed, pct = Math.round(w.n / total * 100);
    return `<div>
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:4px">
        <span>${OUT_ICON[w.outcome] || ''} ${esc(w.outcomeLabel)} <span style="color:var(--text-4)">↔</span> ${ICON[w.predictor] || ''} ${esc(w.predictorLabel)}</span>
        <span style="color:var(--text-3);white-space:nowrap;display:flex;align-items:center;gap:4px">${w.n}/${total} ${_ib(`Patrones.infoRel('${w.id}')`, 'Qué se compara')}</span>
      </div>
      <div style="height:6px;background:var(--bg-input);border-radius:99px;overflow:hidden"><div class="pt-bar" data-w="${pct}" style="height:100%;width:0%;border-radius:99px;background:var(--purple)"></div></div>
      <div style="font-size:10px;color:var(--text-4);margin-top:3px">${w.needed === 1 ? 'Falta 1 sesión' : `Faltan ${w.needed} sesiones`} — ${esc(w.reason.replace(/^faltan sesiones /, ''))}</div>
    </div>`;
  }

  function _noRow(r) {
    return `<div style="font-size:12px;line-height:1.5;padding:8px 10px;border-radius:10px;background:var(--bg-input)">
      <div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start"><span>${OUT_ICON[r.outcome] || ''} <b>${esc(r.outcomeLabel)}</b> no cambia de forma clara con ${esc(r.predictorLabel)}</span>${_ib(`Patrones.infoRel('${r.id}')`, 'Qué se compara')}</div>
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

  // ⓘ de una sección o término
  function infoTerm(key) {
    const i = INFO_TERM[key]; if (!i) return;
    Utils.showInfoModal(i.t, `<div style="font-size:13px;line-height:1.65;color:var(--text-2)">${i.d}</div>`);
  }
  // ⓘ de una relación concreta: qué se compara + (si aplica) por qué aún no se puede probar
  function infoRel(id) {
    const all = [...(_d.rules || []), ...(_d.watching || []), ...(_d.noRelation || [])];
    const r = all.find(x => x.id === id); if (!r) return;
    const o = INFO_OUT[r.outcome], p = INFO_PRED[r.predictor];
    let extra = '';
    if (r.needed !== undefined) {
      extra = `<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-input);font-size:12px;line-height:1.6"><b>Cómo vas:</b> ${r.n} ${r.n === 1 ? 'sesión' : 'sesiones'} con ambos datos${r.nGroups ? ` (${r.nGroups[0]} de un lado, ${r.nGroups[1]} del otro)` : ''}. ${r.needed === 1 ? 'Falta 1 sesión' : `Faltan ${r.needed} sesiones`} ${Utils.escapeHtml(String(r.reason || '').replace(/^faltan sesiones /, ''))}.</div>`;
    } else if (r.means) {
      extra = `<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-input);font-size:12px;line-height:1.6"><b>Lo que ve la app:</b> ${r.n} sesiones comparadas. ${Utils.escapeHtml(r.groups[0])}: ${r.means[0] > 0 ? '+' : ''}${r.means[0]}${Utils.escapeHtml(r.unit || '')} · ${Utils.escapeHtml(r.groups[1])}: ${r.means[1] > 0 ? '+' : ''}${r.means[1]}${Utils.escapeHtml(r.unit || '')}.</div>`;
    }
    Utils.showInfoModal('Qué se está comparando', `<div style="font-size:13px;line-height:1.65;color:var(--text-2)"><p style="margin:0 0 10px"><b>${o.t}</b><br>${o.d}</p><p style="margin:0"><b>${p.t}</b><br>${p.d}</p>${extra}</div>`);
  }

  function toggleHow() {
    const el = document.getElementById('pt-how'), ar = document.getElementById('pt-how-arrow');
    const open = el.style.display === 'none';
    el.style.display = open ? 'block' : 'none'; ar.textContent = open ? '▾' : '▸';
    if (open && typeof gsap !== 'undefined') gsap.from(el, { opacity: 0, y: -6, duration: 0.3 });
  }

  return { init, toggleHow, infoTerm, infoRel };
})();

function initPatrones(container) { Patrones.init(container); }
