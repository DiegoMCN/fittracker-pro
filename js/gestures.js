// ═══════════════════════════════════════════
// GESTURES — swipe genérico y pull-to-refresh, reutilizables por
// cualquier módulo. La idea es no reescribir la detección táctil cada
// vez que un módulo quiera un gesto — se engancha una vez aquí y cada
// módulo solo pasa qué hacer cuando pasa.
// ═══════════════════════════════════════════

const Gestures = (() => {

  // ── SWIPE GENÉRICO — izquierda/derecha ───────────────────────────────
  // Se dispara solo si el movimiento es claramente MÁS horizontal que
  // vertical y pasa el umbral mínimo — así un scroll vertical normal
  // (que también mueve el dedo un poco de lado) nunca se confunde con
  // una intención real de deslizar.
  function onSwipe(el, { onLeft, onRight, threshold = 60 } = {}) {
    if (!el) return;
    let startX = 0, startY = 0, tracking = false;

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return; // ignora pellizcos de 2 dedos (zoom)
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && onLeft) onLeft();
      if (dx > 0 && onRight) onRight();
    }, { passive: true });
  }

  // ── PULL-TO-REFRESH ──────────────────────────────────────────────────
  // Solo se activa si el jalón empieza con el contenedor pegado arriba
  // del todo (scrollTop === 0) — si no, es scroll normal hacia abajo
  // dentro del contenido, no una intención de refrescar. Necesita
  // preventDefault en touchmove (no puede ser "passive") para que el
  // indicador se sienta pegado al dedo en vez de competir con el
  // rebote nativo del navegador.
  function enablePullToRefresh(scrollContainer, onRefresh) {
    if (!scrollContainer) return;
    scrollContainer.style.position = scrollContainer.style.position || 'relative';

    // El contenedor (#page-content) sobrevive entre navegaciones, pero
    // su innerHTML se reemplaza por completo cada vez que el módulo
    // vuelve a pintar (incluida la primera vez que ESTE mismo
    // pull-to-refresh dispara un refresh) — eso borra el indicador
    // como cualquier otro hijo. Se guarda la referencia EN el
    // contenedor (scrollContainer._ptrIndicator) en vez de capturarla
    // en el cierre de los listeners de abajo — así, aunque los
    // listeners solo se enganchen una vez, siempre leen el indicador
    // ACTUAL en el momento del toque, nunca uno viejo ya destruido.
    function ensureIndicator() {
      let ind = scrollContainer.querySelector(':scope > .ptr-indicator');
      if (!ind) {
        ind = document.createElement('div');
        ind.className = 'ptr-indicator';
        ind.style.cssText = `
          position:absolute; top:-46px; left:0; right:0; height:46px;
          display:flex; align-items:center; justify-content:center;
          color:var(--accent); font-size:20px; opacity:0; pointer-events:none;
          transition:opacity 0.15s;
        `;
        ind.textContent = '↓';
        scrollContainer.prepend(ind);
      }
      scrollContainer._ptrIndicator = ind;
      return ind;
    }
    ensureIndicator();

    if (scrollContainer._ptrEnabled) return; // los listeners ya están enganchados, no hace falta más
    scrollContainer._ptrEnabled = true;

    let startY = 0, pulling = false, dist = 0;
    const TRIGGER = 65, MAX_PULL = 90;

    scrollContainer.addEventListener('touchstart', (e) => {
      if (scrollContainer.scrollTop > 0) { pulling = false; return; }
      startY = e.touches[0].clientY;
      pulling = true;
      dist = 0;
      ensureIndicator(); // por si el render anterior lo destruyó y no ha vuelto a jalar desde entonces
    }, { passive: true });

    scrollContainer.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY;
      if (dist <= 0) { pulling = false; scrollContainer._ptrIndicator.style.opacity = '0'; return; }
      e.preventDefault(); // aquí sí — es el jalón que queremos controlar nosotros, no el navegador
      const clamped = Math.min(dist, MAX_PULL);
      const progress = Math.min(dist / TRIGGER, 1);
      const ind = scrollContainer._ptrIndicator;
      ind.style.transform = `translateY(${clamped}px) rotate(${progress * 180}deg)`;
      ind.style.opacity = String(progress);
    }, { passive: false });

    scrollContainer.addEventListener('touchend', async () => {
      if (!pulling) return;
      pulling = false;
      const ind = scrollContainer._ptrIndicator;
      if (dist >= TRIGGER) {
        ind.style.transform = 'translateY(50px)';
        ind.textContent = '↻';
        ind.style.animation = 'spin 0.6s linear infinite';
        Haptics.medium();
        try { await onRefresh(); } catch(e) {}
        // onRefresh típicamente re-pinta el contenedor completo (nuevo
        // innerHTML) — el indicador de ESTA ejecución ya quedó
        // destruido en ese momento; nada más que limpiar aquí.
        return;
      }
      ind.style.opacity = '0';
      ind.style.transform = '';
      ind.style.animation = '';
      ind.textContent = '↓';
    }, { passive: true });
  }

  return { onSwipe, enablePullToRefresh };
})();
