// ═══════════════════════════════════════════
// FITTRACKER PRO — CRONÓMETRO DE RECUPERACIÓN
// ═══════════════════════════════════════════
// Antes, "FC al terminar / 1 min / 2 min" eran 3 campos sueltos que
// Diego llenaba de memoria, cuando le daba tiempo, sin que nada le
// avisara el momento exacto. Esa variación de 10-20 segundos ya es
// ruido que no tiene nada que ver con su condición real — contamina
// justo los cálculos que dependen de esto (Récords, Proyección de
// metas, señales de sobrecarga). Este widget avisa con sonido y
// vibración exactamente cuándo revisar el reloj, y guarda el número
// en el momento en que Diego lo escribe — no antes, no después.
//
// Vive en js/ (junto a gestures.js), no en js/modules/, porque lo usan
// TANTO workout.js como cardio.js — un solo cronómetro para los dos en
// vez de duplicar la lógica en cada módulo.
//
// Uso: RecoveryTimer.start({ onComplete: (vals) => {...}, onSkip: () => {...} })
// vals = { fcPost0, fcPost1, fcPost2 } — strings, igual que los inputs
// que reemplaza, para no tener que tocar nada más en el payload final.

const RecoveryTimer = (() => {
  const CHECKPOINTS = [
    { key: 'post0', seconds: 0,   label: 'Al terminar' },
    { key: 'post1', seconds: 60,  label: '1 minuto' },
    { key: 'post2', seconds: 120, label: '2 minutos' },
  ];

  let interval = null;
  let startedAt = null;
  let captured = {};
  let alerted = {};
  let onComplete = null;
  let onSkip = null;

  function start({ onComplete: oc, onSkip: os }) {
    onComplete = oc;
    onSkip = os;
    startedAt = Date.now();
    captured = { post0: '', post1: '', post2: '' };
    alerted = { post0: false, post1: false, post2: false };

    WakeLock.request(); // por si el módulo que llama ya la liberó al terminar (cardio.js lo hace)
    _render();
    _checkAlerts(); // el checkpoint de "al terminar" (0:00) ya llegó apenas se abre la pantalla
    _updateRowStates(); // pinta el estado inicial YA — si no, la fila se ve "apagada" hasta el primer tick (250ms después)
    if (interval) clearInterval(interval);
    interval = setInterval(_tick, 250); // más fino que 1s — que el aviso de 0:00 no tarde en notarse
    document.addEventListener('visibilitychange', _onVisibility);
  }

  function _onVisibility() {
    // Si la pantalla se bloqueó, el navegador pudo pausar el interval —
    // al volver, se recalcula de una vez en vez de esperar el próximo tick.
    if (document.visibilityState === 'visible') _tick();
  }

  function _elapsedSec() {
    return (Date.now() - startedAt) / 1000;
  }

  function _checkAlerts() {
    const elapsed = _elapsedSec();
    CHECKPOINTS.forEach(cp => {
      if (!alerted[cp.key] && elapsed >= cp.seconds) {
        alerted[cp.key] = true;
        Sounds.restDone();
        Haptics.success();
        if (Router.current() === 'workout' || Router.current() === 'cardio') {
          Toast.success(`⏱ ${cp.label} — revisa tu FC ahora`);
        }
        const input = document.getElementById(`rt-${cp.key}`);
        if (input) setTimeout(() => input.focus(), 150);
      }
    });
  }

  function _tick() {
    _checkAlerts();
    const clock = document.getElementById('rt-clock');
    if (clock) clock.textContent = Utils.formatTime(Math.floor(_elapsedSec()));
    _updateRowStates();
  }

  function _updateRowStates() {
    const elapsed = _elapsedSec();
    CHECKPOINTS.forEach(cp => {
      const row = document.getElementById(`rt-row-${cp.key}`);
      if (!row) return;
      const due = elapsed >= cp.seconds;
      const filled = captured[cp.key] !== '';
      row.style.opacity = due ? '1' : '0.45';
      row.style.background = (due && !filled) ? 'rgba(124,58,237,0.12)' : 'transparent';
    });
  }

  function updateValue(key, value) {
    captured[key] = value;
    _updateRowStates();
  }

  function _stop() {
    clearInterval(interval);
    interval = null;
    document.removeEventListener('visibilitychange', _onVisibility);
  }

  function finish() {
    _stop();
    const vals = { fcPost0: captured.post0, fcPost1: captured.post1, fcPost2: captured.post2 };
    onComplete?.(vals);
  }

  function skip() {
    _stop();
    onSkip?.();
  }

  function _render() {
    const container = document.getElementById('page-content');
    if (!container) return;
    container.innerHTML = `
      <div style="max-width:480px;margin:0 auto;text-align:center">
        <div style="font-size:44px;margin-bottom:8px">⏱️</div>
        <h2 style="font-size:18px;font-weight:800">Mide tu recuperación</h2>
        <p style="color:var(--text-3);font-size:12px;margin:4px 0 20px;line-height:1.5">
          Revisa tu FC en el reloj justo cuando se ilumine cada paso — el momento exacto importa más que el número.
        </p>

        <div style="font-size:38px;font-weight:800;font-variant-numeric:tabular-nums;margin-bottom:20px" id="rt-clock">0:00</div>

        <div class="card" style="text-align:left;padding:4px 16px">
          ${CHECKPOINTS.map((cp, i) => `
            <div id="rt-row-${cp.key}" style="display:flex;align-items:center;gap:10px;padding:12px 0;transition:opacity 0.3s,background 0.3s;border-radius:8px;${i > 0 ? 'border-top:1px solid var(--border)' : ''}">
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${cp.label}</div>
              </div>
              <input class="input" type="number" id="rt-${cp.key}" placeholder="bpm" style="width:90px;text-align:center"
                oninput="RecoveryTimer.updateValue('${cp.key}', this.value)">
            </div>`).join('')}
        </div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-secondary" style="flex:1" onclick="RecoveryTimer.skip()">Saltar cronómetro</button>
          <button class="btn btn-primary" style="flex:1" onclick="RecoveryTimer.finish()">Continuar</button>
        </div>
      </div>`;
  }

  return { start, updateValue, finish, skip };
})();
