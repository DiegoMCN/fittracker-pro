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
  // Misma fórmula de "resistencia de liga" que usa UIScrollView en iOS
  // (la que hace que jalar una lista nativa se sienta cada vez más
  // "dura" mientras más jalas, en vez de moverse 1:1 con el dedo):
  //   resistido = (distancia × techo × constante) / (techo + constante × distancia)
  // Conforme "distancia" crece, el resultado se acerca a "techo" pero
  // nunca lo pasa — así entre más jalas, menos avanza el indicador por
  // cada pixel de dedo, exactamente como tensar la cuerda de un arco.
  // constante=0.55 es el valor que usa Apple mismo.
  const RUBBER_BAND_CEILING = 80;
  const RUBBER_BAND_CONST = 0.55;
  function _rubberBand(distance) {
    return (distance * RUBBER_BAND_CEILING * RUBBER_BAND_CONST) / (RUBBER_BAND_CEILING + RUBBER_BAND_CONST * distance);
  }

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
    // TRIGGER es en pixeles YA CON RESISTENCIA (visuales, no los que
    // de verdad recorrió el dedo) — con la fórmula de arriba, jalar
    // 50px visuales requiere mover el dedo real bastante más que eso,
    // así que ya no dispara con "apenas y hago hacia abajo".
    const TRIGGER = 50;

    scrollContainer.addEventListener('touchstart', (e) => {
      if (scrollContainer.scrollTop > 0) { pulling = false; return; }
      startY = e.touches[0].clientY;
      pulling = true;
      dist = 0;
      ensureIndicator(); // por si el render anterior lo destruyó y no ha vuelto a jalar desde entonces
      // Sin transición mientras se jala — tiene que seguir al dedo en
      // tiempo real, 1 a 1 con cada evento de touchmove. La animación
      // se agrega solo al soltar (abajo), nunca durante el jalón.
      scrollContainer._ptrIndicator.style.transition = 'none';
    }, { passive: true });

    scrollContainer.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const rawDist = e.touches[0].clientY - startY;
      if (rawDist <= 0) { pulling = false; scrollContainer._ptrIndicator.style.opacity = '0'; return; }
      e.preventDefault(); // aquí sí — es el jalón que queremos controlar nosotros, no el navegador
      dist = _rubberBand(rawDist); // esta es la distancia YA resistida — la que de verdad se usa para pintar y para el umbral
      const progress = Math.min(dist / TRIGGER, 1);
      const ind = scrollContainer._ptrIndicator;
      ind.style.transform = `translateY(${dist}px) rotate(${progress * 180}deg)`;
      ind.style.opacity = String(progress);
    }, { passive: false });

    scrollContainer.addEventListener('touchend', async () => {
      if (!pulling) return;
      pulling = false;
      const ind = scrollContainer._ptrIndicator;
      // Resorte real al soltar — la misma curva con rebote que ya usa
      // el resto de la app (--transition-spring), no un salto seco a 0.
      ind.style.transition = `transform var(--transition-spring), opacity var(--transition-spring)`;
      if (dist >= TRIGGER) {
        ind.style.transform = 'translateY(46px)';
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
