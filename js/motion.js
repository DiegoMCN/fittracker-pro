// ═══════════════════════════════════════════
// FITTRACKER PRO — MOTION — capa de animación estandarizada (GSAP)
// ═══════════════════════════════════════════
// FASE 1 de la migración a GSAP: las animaciones GENERALES — entrada
// al aparecer algo, salida al cerrarlo. Antes esto vivía repartido en
// @keyframes de CSS + un puñado de transiciones sueltas; ahora es UN
// solo archivo que define "así se mueve todo en FitTracker Pro".
//
// Las curvas son las MISMAS que ya existían (copiadas con
// CustomEase.create() directo desde los cubic-bezier originales) — el
// look no cambia, solo el motor que lo corre y que ahora hay un solo
// lugar que lo define.
//
// Lo ESPECÍFICO de cada módulo (Fase 2: set-pop, metrónomo, el
// rubber-band del pull-to-refresh, el mapa muscular, el cronómetro de
// recuperación) sigue viviendo donde ya estaba — no se toca en esta
// fase.
//
// Vive en js/ (junto a gestures.js, recovery-timer.js, session-share.js)
// porque lo usa TODA la app, no un solo módulo.

gsap.registerPlugin(CustomEase);

// ── AJUSTES EN VIVO (habilita el futuro panel de configuración) ─────
// Todo lo que el panel podrá tocar vive aquí: duraciones, curvas, la
// intensidad del vidrio (escala los --glass-* de main.css) y el radio
// de las tarjetas (--card-radius). Se guardan en localStorage — por
// decisión explícita, quedan por dispositivo, no viajan entre celular
// y compu; mantiene esto simple.
//
// Las curvas son las MISMAS que ya existían (mismo valor que los
// cubic-bezier originales) — esto no cambia el look por defecto, solo
// hace que ese look sea AJUSTABLE en vez de estar fijo en el código.

const MOTION_SETTINGS_KEY = 'fittracker_motion_settings';

const _easeDefaults = {
  fittrackerFast:    '0.4, 0, 0.2, 1',
  fittrackerSpring:  '0.34, 1.56, 0.64, 1',
  fittrackerPremium: '0.16, 1, 0.3, 1',
};
// Valores BASE (intensidad = 1) de cada token de vidrio — la
// intensidad los escala a todos juntos mientras conserva sus
// diferencias relativas (la celebración siempre más vívida, etc.).
const _glassBasePx = {
  '--glass-nav-blur': 20, '--glass-light-blur': 4, '--glass-overlay-blur': 8,
  '--glass-card-blur': 24, '--glass-header-blur': 20, '--glass-celebration-blur': 24,
};
const _cardRadiusDefault = 16;

let _easeCurves = { ..._easeDefaults };
let _glassIntensity = 1;
let _cardRadius = _cardRadiusDefault;

function _applyEases() {
  Object.entries(_easeCurves).forEach(([name, bezier]) => CustomEase.create(name, bezier));
}
function _applyGlass() {
  const root = document.documentElement.style;
  Object.entries(_glassBasePx).forEach(([token, px]) => {
    root.setProperty(token, Math.round(px * _glassIntensity) + 'px');
  });
}
function _applyCardRadius() {
  document.documentElement.style.setProperty('--card-radius', _cardRadius + 'px');
}

function _persistSettings() {
  try {
    localStorage.setItem(MOTION_SETTINGS_KEY, JSON.stringify({
      durations: MOTION_DUR, eases: _easeCurves,
      glassIntensity: _glassIntensity, cardRadius: _cardRadius,
    }));
  } catch(e) { /* localStorage lleno o bloqueado — el ajuste no persiste, pero la app sigue funcionando con los valores de esta sesión */ }
}

// Carga lo guardado (si existe) y aplica TODO de una vez — duraciones,
// curvas, vidrio y radio — antes de que se pinte cualquier pantalla,
// para que no haya un parpadeo con los valores por defecto primero.
function _loadAndApplySettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(MOTION_SETTINGS_KEY) || '{}'); }
  catch(e) { saved = {}; } // JSON corrupto — sigue con los valores por defecto, no truena
  if (saved.durations && typeof saved.durations === 'object') Object.assign(MOTION_DUR, saved.durations);
  if (saved.eases && typeof saved.eases === 'object') _easeCurves = { ..._easeDefaults, ...saved.eases };
  if (typeof saved.glassIntensity === 'number') _glassIntensity = saved.glassIntensity;
  if (typeof saved.cardRadius === 'number') _cardRadius = saved.cardRadius;
  _applyEases();
  _applyGlass();
  _applyCardRadius();
}

// Duraciones en SEGUNDOS (así las pide GSAP) — mismos valores en ms
// que las variables CSS que reemplazan (150/250/400/500/280).
const MOTION_DUR = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  spring: 0.5,
  premium: 0.28,
  stagger: 0.55,
};

// Ahora que MOTION_DUR ya existe, se puede cargar y aplicar lo
// guardado (si hay algo) — antes de esta línea hubiera fallado, ya
// que _loadAndApplySettings escribe directo sobre MOTION_DUR.
_loadAndApplySettings();

const Motion = (() => {
  // "Reduce motion" del sistema — si la persona lo activó, todo se
  // acorta a casi nada (sigue corriendo para que los callbacks de
  // limpieza no se rompan, pero sin el movimiento en sí).
  const _reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const d = (seconds) => _reduced ? 0.01 : seconds;

  const MOBILE_QUERY = '(max-width: 768px)';
  const _isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

  // ── MODAL: entrada y salida ──────────────────────────────────────
  // En escritorio (o la burbuja de info .modal-overlay-info, que
  // SIEMPRE se queda centrada, ni en móvil se desliza como hoja):
  // aparece centrado con un empujoncito chico. En móvil (fuera de esa
  // excepción): sube como hoja nativa desde abajo — el "handle" gris
  // sigue siendo puramente CSS (::before), no necesita JS.
  function _isSheet(overlay) {
    return _isMobile() && !overlay.classList.contains('modal-overlay-info');
  }

  function modalIn(overlay) {
    if (!overlay) return;
    const card = overlay.querySelector('.modal');
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: d(MOTION_DUR.fast), ease: 'fittrackerFast' });
    if (!card) return;
    if (_isSheet(overlay)) {
      gsap.fromTo(card, { y: '100%', opacity: 0 }, { y: '0%', opacity: 1, duration: d(MOTION_DUR.spring), ease: 'fittrackerSpring' });
    } else {
      gsap.fromTo(card, { opacity: 0, scale: 0.95, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: d(MOTION_DUR.spring), ease: 'fittrackerSpring' });
    }
  }

  // Cierra un overlay con su animación de salida y lo quita del DOM al
  // terminar. Reemplaza el `.remove()` instantáneo que había en ~35
  // lugares distintos de la app — ahora todos pasan por aquí.
  // Protegido contra doble-cierre (un backdrop-tap y un botón ✕ que
  // dispararan los dos casi al mismo tiempo no deben duplicar nada).
  const _closing = new WeakSet();
  function closeModal(overlay) {
    if (!overlay || _closing.has(overlay)) return;
    _closing.add(overlay);
    const card = overlay.querySelector('.modal');
    const done = () => overlay.remove();

    gsap.to(overlay, { opacity: 0, duration: d(MOTION_DUR.fast), ease: 'fittrackerFast', onComplete: card ? undefined : done });
    if (!card) return;
    if (_isSheet(overlay)) {
      gsap.to(card, { y: '100%', opacity: 0, duration: d(MOTION_DUR.base), ease: 'fittrackerFast', onComplete: done });
    } else {
      gsap.to(card, { opacity: 0, scale: 0.95, y: 10, duration: d(MOTION_DUR.base), ease: 'fittrackerFast', onComplete: done });
    }
  }

  // ── REVELADOS GENÉRICOS (bounce-in / slide-up) ───────────────────
  // Reemplazan los @keyframes del mismo nombre — mismas curvas y
  // duraciones, ahora orquestadas por GSAP en vez de CSS.
  function bounceIn(el) {
    if (!el) return;
    gsap.fromTo(el, { opacity: 0, scale: 0.9, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: d(MOTION_DUR.spring), ease: 'fittrackerSpring' });
  }
  function slideUp(el) {
    if (!el) return;
    gsap.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: d(MOTION_DUR.base), ease: 'fittrackerFast' });
  }

  // ── TOAST: entrada y salida ───────────────────────────────────────
  function toastIn(el) {
    if (!el) return;
    gsap.fromTo(el, { opacity: 0, x: 20, scale: 0.95 }, { opacity: 1, x: 0, scale: 1, duration: d(MOTION_DUR.spring), ease: 'fittrackerSpring' });
  }
  function toastOut(el, onComplete) {
    if (!el) { onComplete?.(); return; }
    gsap.to(el, { opacity: 0, x: 20, duration: d(MOTION_DUR.base), ease: 'fittrackerFast', onComplete });
  }

  // ── TRANSICIÓN DE PÁGINA ──────────────────────────────────────────
  // El contenedor #page-content aparece con la misma curva "ease-out
  // premium" que antes se armaba a mano con estilos inline + rAF en
  // Router.navigate (js/utils.js) — desacelera fuerte sin rebotar, la
  // misma familia que usan las apps de iOS al cambiar de pestaña.
  function pageIn(el) {
    if (!el) return;
    gsap.fromTo(el, { opacity: 0, y: 10, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: d(MOTION_DUR.premium), ease: 'fittrackerPremium' });
  }

  // ── TOQUE DE BOTONES (press / release) ────────────────────────────
  // Reemplaza el CSS `[onclick]:active` / `.btn:active` — un solo
  // listener delegado en todo el documento en vez de una regla CSS
  // universal, para que el mismo sistema controle press Y release con
  // las curvas ya estandarizadas arriba. `.btn` tiene el patrón de iOS
  // completo (press rápido y sólido, resorte al soltar); cualquier
  // otro [onclick] (tarjetas, íconos) usa un toque más simple y
  // simétrico, igual que el CSS que reemplaza.
  //
  // El destello blanco (::after) de .btn es un pseudo-elemento — GSAP
  // no puede animarlo directamente (no es un nodo del DOM real), así
  // que esa parte se queda como CSS puro, controlada por una clase
  // (.is-pressed) que este mismo listener prende y apaga.
  function _initTapFeedback() {
    let pressedEl = null;

    const down = (e) => {
      const btn = e.target.closest?.('.btn');
      const generic = !btn && e.target.closest?.('[onclick]:not([onclick=""])');
      const el = btn || generic;
      if (!el) return;
      pressedEl = el;
      if (btn) {
        btn.classList.add('is-pressed');
        gsap.to(btn, { scale: 0.96, duration: d(0.08), ease: 'fittrackerFast', overwrite: 'auto' });
      } else {
        gsap.to(el, { scale: 0.97, duration: d(0.08), ease: 'fittrackerFast', overwrite: 'auto' });
      }
    };

    const up = () => {
      if (!pressedEl) return;
      const el = pressedEl;
      pressedEl = null;
      if (el.classList.contains('btn')) {
        el.classList.remove('is-pressed');
        gsap.to(el, { scale: 1, duration: d(MOTION_DUR.spring), ease: 'fittrackerSpring', overwrite: 'auto' });
      } else {
        gsap.to(el, { scale: 1, duration: d(0.08), ease: 'fittrackerFast', overwrite: 'auto' });
      }
    };

    // pointerdown/up cubre mouse Y táctil con un solo listener — sin
    // el retraso de 300ms de "click" que algunos navegadores móviles
    // todavía aplican de forma heredada.
    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointerup', up, { passive: true });
    document.addEventListener('pointercancel', up, { passive: true });
    // Si el dedo se arrastra fuera del botón sin soltar (scroll
    // accidental a medio toque), también hay que soltar el estado —
    // si no, el botón se queda "hundido" para siempre.
    document.addEventListener('pointerleave', (e) => { if (e.target === pressedEl) up(); }, { passive: true, capture: true });
  }

  // ── OBSERVADOR: detecta modales y revelados nuevos automáticamente ──
  // Antes, la animación de entrada la disparaba el navegador solo
  // (era una @keyframe de CSS ligada a la clase, así que aparecía
  // sola apenas el elemento existía). Para conservar esa misma
  // ergonomía con GSAP — "solo crea el modal, la animación de entrada
  // pasa sola, no hay que acordarse de llamar nada" — se usa un
  // MutationObserver que vigila TODO el body y anima en cuanto detecta
  // un .modal-overlay, .animate-bounce-in o .animate-slide-up nuevo.
  const _seen = new WeakSet();
  function _handleNewNode(node) {
    if (node.nodeType !== 1 || _seen.has(node)) return;
    if (node.matches?.('.modal-overlay')) { _seen.add(node); modalIn(node); }
    else if (node.matches?.('.animate-bounce-in')) { _seen.add(node); bounceIn(node); }
    else if (node.matches?.('.animate-slide-up')) { _seen.add(node); slideUp(node); }
  }
  function _initAutoEntrance() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          _handleNewNode(node);
          node.querySelectorAll?.('.modal-overlay, .animate-bounce-in, .animate-slide-up').forEach(_handleNewNode);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── CASCADA DE ENTRADA ────────────────────────────────────────────
  // Reemplaza el @keyframes stagger-in + el cálculo manual de
  // animation-delay que cada módulo repetía por su cuenta (Dashboard,
  // Bitácora, Métricas, Nutrición, Perfil, Calendario, Cardio,
  // Workout — 9 sitios con la misma cuenta "i*90ms, tope 630ms"). Aquí
  // vive UNA sola vez: cada módulo solo llama Motion.staggerIn(lista),
  // sin volver a escribir el cálculo del índice ni la curva.
  // Mismos valores exactos que el @keyframes que reemplaza: opacity
  // 0→1, translateY(24px)→0, scale(0.97)→1, 550ms, curva "premium".
  function staggerIn(elements) {
    const els = Array.from(elements || []);
    els.forEach((el, i) => {
      const delaySeconds = Math.min(i * 0.09, 0.63);
      gsap.fromTo(el,
        { opacity: 0, y: 24, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: d(MOTION_DUR.stagger), delay: d(delaySeconds), ease: 'fittrackerPremium' }
      );
    });
  }

  // ── API DE AJUSTES (para el futuro panel) ─────────────────────────
  // Cada setter aplica el cambio de inmediato Y lo persiste — el panel
  // no necesita saber nada de localStorage, solo llama estas funciones.
  function setDuration(key, seconds) {
    if (!(key in MOTION_DUR)) return;
    MOTION_DUR[key] = seconds;
    _persistSettings();
  }
  function setEase(name, bezierString) {
    if (!(name in _easeCurves)) return;
    _easeCurves[name] = bezierString;
    _applyEases();
    _persistSettings();
  }
  function setGlassIntensity(multiplier) {
    _glassIntensity = multiplier;
    _applyGlass();
    _persistSettings();
  }
  function setCardRadius(px) {
    _cardRadius = px;
    _applyCardRadius();
    _persistSettings();
  }
  // Copia de lectura — el panel arranca sus controles con esto, nunca
  // debe mutar el objeto que regresa directamente (no cambiaría nada).
  function getSettings() {
    return {
      durations: { ...MOTION_DUR },
      eases: { ..._easeCurves },
      glassIntensity: _glassIntensity,
      cardRadius: _cardRadius,
    };
  }
  function resetSettings() {
    Object.assign(MOTION_DUR, { fast: 0.15, base: 0.25, slow: 0.4, spring: 0.5, premium: 0.28, stagger: 0.55 });
    _easeCurves = { ..._easeDefaults };
    _glassIntensity = 1;
    _cardRadius = _cardRadiusDefault;
    _applyEases();
    _applyGlass();
    _applyCardRadius();
    try { localStorage.removeItem(MOTION_SETTINGS_KEY); } catch(e) {}
  }

  // ── POP CON BRILLO (set-pop / phase-pop) ──────────────────────────
  // Reemplaza dos @keyframes casi idénticos — mismo espíritu (se pasa
  // de tamaño y regresa, con un resplandor que aparece y se apaga),
  // solo cambian tamaños/color/duración entre los dos casos. Antes
  // vivían por separado en CSS; ahora es una sola función interna que
  // ambos usan, cada uno con sus propios parámetros exactos.
  function _popGlow(el, { fromScale, peakScale, glowShadow, duration }) {
    if (!el) return;
    const restShadow = '0 0 0 0 rgba(0,0,0,0)';
    const tl = gsap.timeline();
    tl.fromTo(el,
      { scale: fromScale, boxShadow: restShadow },
      { scale: peakScale, boxShadow: glowShadow, duration: d(duration * 0.55), ease: 'fittrackerSpring' }
    );
    tl.to(el, { scale: 1, boxShadow: restShadow, duration: d(duration * 0.45), ease: 'fittrackerFast' });
  }

  // Casilla de serie recién marcada (Sesión Activa) — resplandor verde
  // fijo, siempre el mismo sin importar el ejercicio.
  function setPop(el) {
    _popGlow(el, { fromScale: 0.5, peakScale: 1.28, glowShadow: '0 0 0 8px rgba(0,255,135,0.18)', duration: 0.48 });
  }

  // Cambio de fase en un HIT de Cardio — el color varía según la fase
  // (verde=fácil, rojo=máximo, etc.), por eso recibe el color en vez
  // de traerlo fijo como setPop.
  function phasePop(el, glowColor) {
    _popGlow(el, { fromScale: 0.92, peakScale: 1.02, glowShadow: `0 0 28px 6px ${glowColor}`, duration: 0.55 });
  }

  function init() {
    _initTapFeedback();
    _initAutoEntrance();
  }

  return {
    init, modalIn, closeModal, bounceIn, slideUp, toastIn, toastOut, pageIn, staggerIn, setPop, phasePop,
    setDuration, setEase, setGlassIntensity, setCardRadius, getSettings, resetSettings,
  };
})();

document.addEventListener('DOMContentLoaded', () => Motion.init());
