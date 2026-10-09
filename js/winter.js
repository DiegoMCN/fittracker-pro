// ═══════════════════════════════════════════
// WINTER ARC — la app se va enfriando conforme avanza la temporada
//
// La idea: el verde neón de la app se va volviendo azul hielo con el
// paso de los días, y las tarjetas se van escarchando. No es un tema
// que se prende y se apaga — es una cuenta que avanza sola.
//
// Por qué por ETAPAS y no como un degradado continuo: entre octubre y
// marzo son casi 180 días. Un cambio continuo reparte ese recorrido en
// pasos tan chicos que ningún día se nota nada, y lo que se siente es
// que no pasa nada. Con cinco etapas con nombre, cruzar de una a otra
// es un momento: la app se detiene, cae nieve, y te dice dónde estás.
// Eso es lo que se recuerda.
//
// El color se interpola en HSL, no en RGB. Del verde (152°) al hielo
// (199°) el camino en HSL pasa por el turquesa y el cian — se siente
// como que se enfría. En RGB el mismo recorrido se apaga y pasa por
// grises sucios a medio camino.
// ═══════════════════════════════════════════

const WinterArc = (() => {

  const K_ENABLED = 'fittracker_winter_enabled';
  const K_PREVIEW = 'fittracker_winter_preview';   // 0-1 para ver cómo se verá, o null
  const K_SEEN    = 'fittracker_winter_stage_seen';

  // Verde neón → azul hielo. Los extremos están elegidos para que el
  // acento siga teniendo contraste suficiente sobre el fondo #08080F
  // en los dos extremos; un hielo más pálido se lava contra las
  // tarjetas y deja de funcionar como acento.
  const FRIO = { h: 199, s: 93, l: 60 };   // #38BDF8
  const TIBIO = { h: 152, s: 100, l: 50 }; // #00FF87 — el de siempre

  const ETAPAS = [
    { key: 'umbral',   nombre: 'Umbral',   desde: 0.00, frost: 0.00, lema: 'Empieza el arco. Todavía se siente el otoño.' },
    { key: 'escarcha', nombre: 'Escarcha', desde: 0.12, frost: 0.30, lema: 'Primeras heladas. El cuerpo ya entendió que esto va en serio.' },
    { key: 'helada',   nombre: 'Helada',   desde: 0.35, frost: 0.55, lema: 'Mitad del arco. Aquí es donde la mayoría abandona.' },
    { key: 'ventisca', nombre: 'Ventisca', desde: 0.62, frost: 0.80, lema: 'Lo más duro. Y sigues aquí.' },
    { key: 'nucleo',   nombre: 'Núcleo',   desde: 0.86, frost: 1.00, lema: 'El punto más frío del arco. Nadie llega hasta acá por accidente.' },
  ];

  let _aplicado = null;   // última etapa pintada, para detectar el cruce

  // ── PROGRESO ─────────────────────────────────────────────────────────

  function _rango() {
    const c = (CONFIG && CONFIG.WINTER_ARC) || {};
    return {
      inicio: Date.parse((c.START || '2026-10-01') + 'T00:00:00'),
      fin:    Date.parse((c.END   || '2027-03-21') + 'T00:00:00'),
    };
  }

  function _previewGuardado() {
    try {
      const v = localStorage.getItem(K_PREVIEW);
      return v === null || v === '' ? null : Math.max(0, Math.min(1, Number(v)));
    } catch (e) { return null; }
  }

  // 0 = arranque de la temporada, 1 = el punto más frío.
  function progress() {
    const pv = _previewGuardado();
    if (pv !== null) return pv;
    const { inicio, fin } = _rango();
    if (!(fin > inicio)) return 0;
    return Math.max(0, Math.min(1, (Date.now() - inicio) / (fin - inicio)));
  }

  function enPreview() { return _previewGuardado() !== null; }

  function setPreview(p) {
    try {
      if (p === null) localStorage.removeItem(K_PREVIEW);
      else localStorage.setItem(K_PREVIEW, String(Math.max(0, Math.min(1, Number(p)))));
    } catch (e) {}
    apply({ silencioso: true });
  }

  function diasRestantes() {
    const { fin } = _rango();
    return Math.max(0, Math.ceil((fin - Date.now()) / 86400000));
  }

  function stage(p) {
    const v = (p === undefined) ? progress() : p;
    let e = ETAPAS[0];
    for (const x of ETAPAS) if (v >= x.desde) e = x;
    return { ...e, index: ETAPAS.indexOf(e), total: ETAPAS.length };
  }

  function stages() { return ETAPAS.slice(); }

  // ── COLOR ────────────────────────────────────────────────────────────

  function _lerp(a, b, t) { return a + (b - a) * t; }

  function _hsl(p) {
    // Curva suave: al principio avanza un poco más rápido, para que el
    // primer mes ya se note algo y no parezca que no pasa nada.
    const t = Math.pow(p, 0.8);
    return {
      h: _lerp(TIBIO.h, FRIO.h, t),
      s: _lerp(TIBIO.s, FRIO.s, t),
      l: _lerp(TIBIO.l, FRIO.l, t),
    };
  }

  function _css(h, s, l, a) {
    return a === undefined ? `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
                           : `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a})`;
  }

  // Color del acento para un progreso dado — lo usa Configuración para
  // pintar la escala de etapas sin tener que aplicar el tema.
  function accentAt(p) { const c = _hsl(p); return _css(c.h, c.s, c.l); }


  // ── CATÁLOGO DE ESCARCHAS ────────────────────────────────────────────
  // Cada silueta se usa como MÁSCARA: define la forma, y el color sale de
  // --winter-ice, que cambia con la temporada. Por eso van en blanco: si
  // trajeran color propio se quedarían congeladas en un tono mientras el
  // resto de la app se enfría.
  //
  // Las seis están dibujadas con el hielo acumulado DESIGUAL — tramos
  // cargados y tramos casi limpios. Un borde parejo, por irregular que
  // sea cada pico, se lee como una cenefa impresa y no como hielo.
  const K_FROST = 'fittracker_winter_frost_style';

  const _ESCARCHAS = [
    { key: "carambanos", nombre: "Carámbanos", nota: "Gotas colgando de largos muy distintos, en racimos.",
      inner: "<path fill=\"url(#f)\" d=\"M0 0h240v2.6L230.9 2.6C229.2 8.8 227.8 12.6 227.0 14.0C226.2 12.6 224.8 8.8 223.0 2.6L223.0 2.6C221.5 4.3 220.2 5.3 219.5 5.6C218.8 5.3 217.6 4.3 216.0 2.6L211.0 2.6C209.4 3.8 208.1 4.5 207.4 4.8C206.7 4.5 205.3 3.8 203.7 2.6L166.0 2.6C164.8 7.8 163.8 10.9 163.3 12.1C162.7 10.9 161.7 7.8 160.5 2.6L160.5 2.6C159.4 8.2 158.5 11.5 158.0 12.7C157.6 11.5 156.7 8.2 155.6 2.6L155.6 2.6C154.2 10.6 153.1 15.4 152.5 17.1C151.9 15.4 150.8 10.6 149.4 2.6L149.0 2.6C147.4 4.7 146.2 6.0 145.5 6.5C144.8 6.0 143.5 4.7 142.0 2.6L136.5 2.6C135.1 4.7 133.9 6.0 133.3 6.5C132.6 6.0 131.5 4.7 130.0 2.6L131.2 2.6C130.4 3.7 129.7 4.4 129.3 4.6C128.9 4.4 128.2 3.7 127.3 2.6L127.3 2.6C126.1 4.0 125.1 4.8 124.5 5.1C123.9 4.8 122.9 4.0 121.7 2.6L117.2 2.6C115.6 4.1 114.3 5.1 113.5 5.4C112.8 5.1 111.5 4.1 109.9 2.6L109.8 2.6C108.7 9.3 107.8 13.3 107.3 14.8C106.8 13.3 106.0 9.3 104.9 2.6L103.3 2.6C101.4 3.6 99.8 4.3 98.9 4.5C98.0 4.3 96.4 3.6 94.5 2.6L94.5 2.6C92.7 6.2 91.2 8.3 90.4 9.1C89.6 8.3 88.1 6.2 86.3 2.6L86.3 2.6C85.4 6.6 84.7 9.0 84.3 9.9C83.9 9.0 83.2 6.6 82.3 2.6L78.3 2.6C76.9 5.7 75.8 7.6 75.2 8.3C74.6 7.6 73.4 5.7 72.1 2.6L75.2 2.6C74.1 7.0 73.2 9.7 72.7 10.6C72.2 9.7 71.3 7.0 70.2 2.6L64.9 2.6C63.6 10.4 62.5 15.1 61.9 16.8C61.2 15.1 60.1 10.4 58.8 2.6L58.8 2.6C57.3 6.3 56.1 8.5 55.4 9.3C54.7 8.5 53.5 6.3 52.0 2.6L48.3 2.6C47.5 7.3 46.8 10.2 46.5 11.2C46.1 10.2 45.4 7.3 44.6 2.6L44.6 2.6C43.2 5.9 42.1 7.9 41.5 8.7C40.8 7.9 39.7 5.9 38.3 2.6L38.3 2.6C36.5 4.4 35.0 5.5 34.1 5.9C33.3 5.5 31.8 4.4 30.0 2.6L31.7 2.6C30.5 3.8 29.5 4.5 29.0 4.7C28.4 4.5 27.5 3.8 26.3 2.6L20.9 2.6C19.4 6.6 18.2 8.9 17.5 9.8C16.8 8.9 15.6 6.6 14.0 2.6L12.1 2.6C11.2 8.4 10.5 11.9 10.1 13.2C9.7 11.9 9.0 8.4 8.1 2.6L8.1 2.6C7.1 3.6 6.3 4.2 5.9 4.4C5.5 4.2 4.7 3.6 3.8 2.6L3.8 2.6C2.9 6.6 2.3 9.1 1.9 9.9C1.5 9.1 0.8 6.6 0.0 2.6L0 2.6Z\"/>" },
    { key: "colmillos", nombre: "Colmillos", nota: "Picos agresivos y desiguales. La más dura de las seis.",
      inner: "<path fill=\"url(#f)\" d=\"M0 0h240v1.4L234.0 7.0L229.8 2.0L225.7 11.5L224.2 2.3L215.0 12.8L210.5 0.9L208.3 3.0L197.7 1.1L195.4 3.8L185.8 2.6L184.2 3.2L182.2 0.8L169.3 10.1L166.2 1.2L165.9 2.1L165.6 1.9L162.8 2.7L149.1 1.4L142.2 2.0L140.0 1.8L130.7 2.8L127.7 1.0L125.0 5.1L121.7 2.1L108.6 2.1L105.4 1.6L102.0 5.6L95.9 2.2L91.2 18.2L87.8 2.4L79.5 8.7L76.5 2.1L75.0 2.0L71.6 2.4L64.9 2.1L58.3 1.0L54.5 1.8L53.7 1.8L40.2 2.8L35.1 1.9L29.2 5.2L27.6 2.2L20.9 16.9L17.9 0.8L12.2 16.9L10.1 1.6L5.5 8.7L0.0 1.5Z\"/>" },
    { key: "cristales", nombre: "Cristales", nota: "Esquirlas angulares, hielo quebrado. Menuda y pareja.",
      inner: "<path fill=\"url(#f)\" d=\"M0 0h240v1.8L238.8 13.1L236.9 1.4L233.7 11.5L230.5 2.4L222.7 9.7L217.8 1.8L214.8 5.0L210.6 2.4L203.6 14.8L200.6 2.3L200.5 13.7L200.4 2.4L194.5 15.1L191.2 2.7L188.5 12.6L181.1 1.3L177.6 12.6L171.7 1.6L167.9 17.3L163.7 1.7L161.8 8.9L158.3 1.3L154.9 14.3L145.7 1.8L145.6 4.2L145.3 2.2L142.3 5.2L135.6 1.8L131.6 13.2L123.7 1.4L121.2 7.1L118.1 2.3L116.8 1.5L115.6 2.1L112.8 2.0L106.8 2.0L103.7 1.2L99.6 1.7L99.6 17.2L99.5 1.3L93.7 15.7L88.9 1.6L83.6 18.0L78.5 2.7L74.3 9.4L68.9 2.1L64.0 12.1L58.5 3.0L58.4 1.4L58.3 1.3L54.1 1.1L50.3 2.6L45.6 1.2L37.6 2.9L32.5 1.9L26.8 2.8L25.8 11.3L23.6 2.7L22.2 14.3L18.2 1.4L13.1 13.8L10.1 1.3L6.6 17.3L0.0 2.1Z\"/>" },
    { key: "cornisa", nombre: "Cornisa", nota: "Nieve acumulada: ondas suaves y alguna gota. La más limpia.",
      inner: "<path fill=\"url(#f)\" d=\"M0 0h240v1.4C227.5 3.3 224.7 6.8 212.2 4.9C198.6 6.4 195.6 3.1 182.0 1.8C175.6 2.6 174.2 4.2 167.8 2.4C153.2 3.6 149.9 7.6 135.3 4.7C123.5 6.5 120.9 2.3 109.0 1.1C96.9 2.8 94.2 3.6 82.0 2.4C74.6 5.0 73.0 5.7 65.5 4.8C55.6 7.1 53.4 4.2 43.5 1.2C36.5 1.7 35.0 12.5 28.0 11.8C15.4 13.8 12.6 3.9 0.0 2.1Z\"/>" },
    { key: "escarcha", nombre: "Escarcha", nota: "Sin silueta, granos agrupados en manchas. La más discreta.",
      inner: "<g fill=\"url(#f)\"><circle cx=\"39\" cy=\"2.5\" r=\"0.9\"/><circle cx=\"29\" cy=\"12.7\" r=\"0.5\"/><circle cx=\"2\" cy=\"2.7\" r=\"0.7\"/><circle cx=\"17\" cy=\"0.8\" r=\"1.1\"/><circle cx=\"28\" cy=\"2.1\" r=\"1.7\"/><circle cx=\"1\" cy=\"4.0\" r=\"0.6\"/><circle cx=\"27\" cy=\"1.7\" r=\"0.6\"/><circle cx=\"57\" cy=\"12.8\" r=\"0.4\"/><circle cx=\"68\" cy=\"10.1\" r=\"0.7\"/><circle cx=\"69\" cy=\"10.4\" r=\"0.7\"/><circle cx=\"73\" cy=\"1.9\" r=\"1.8\"/><circle cx=\"68\" cy=\"1.0\" r=\"1.6\"/><circle cx=\"63\" cy=\"2.8\" r=\"1.1\"/><circle cx=\"70\" cy=\"10.8\" r=\"0.4\"/><circle cx=\"71\" cy=\"1.9\" r=\"1.7\"/><circle cx=\"72\" cy=\"2.8\" r=\"1.1\"/><circle cx=\"58\" cy=\"6.5\" r=\"0.8\"/><circle cx=\"57\" cy=\"1.7\" r=\"1.4\"/><circle cx=\"118\" cy=\"10.4\" r=\"0.3\"/><circle cx=\"108\" cy=\"1.6\" r=\"1.8\"/><circle cx=\"105\" cy=\"3.3\" r=\"1.0\"/><circle cx=\"84\" cy=\"4.3\" r=\"0.7\"/><circle cx=\"104\" cy=\"3.4\" r=\"1.6\"/><circle cx=\"109\" cy=\"0.8\" r=\"1.7\"/><circle cx=\"150\" cy=\"6.9\" r=\"0.3\"/><circle cx=\"160\" cy=\"1.4\" r=\"0.7\"/><circle cx=\"159\" cy=\"0.9\" r=\"1.2\"/><circle cx=\"160\" cy=\"1.3\" r=\"0.7\"/><circle cx=\"124\" cy=\"2.5\" r=\"1.4\"/><circle cx=\"151\" cy=\"2.0\" r=\"0.6\"/><circle cx=\"123\" cy=\"0.8\" r=\"1.9\"/><circle cx=\"129\" cy=\"1.3\" r=\"1.6\"/><circle cx=\"139\" cy=\"1.0\" r=\"1.5\"/><circle cx=\"129\" cy=\"0.8\" r=\"2.0\"/><circle cx=\"149\" cy=\"0.8\" r=\"1.0\"/><circle cx=\"137\" cy=\"6.8\" r=\"0.4\"/><circle cx=\"155\" cy=\"0.8\" r=\"1.1\"/><circle cx=\"155\" cy=\"6.8\" r=\"1.2\"/><circle cx=\"143\" cy=\"9.3\" r=\"0.7\"/><circle cx=\"136\" cy=\"1.2\" r=\"1.4\"/><circle cx=\"160\" cy=\"0.9\" r=\"1.1\"/><circle cx=\"139\" cy=\"0.9\" r=\"1.3\"/><circle cx=\"163\" cy=\"3.4\" r=\"0.5\"/><circle cx=\"140\" cy=\"1.3\" r=\"1.3\"/><circle cx=\"128\" cy=\"0.8\" r=\"1.3\"/><circle cx=\"172\" cy=\"0.8\" r=\"0.5\"/><circle cx=\"186\" cy=\"0.9\" r=\"1.4\"/><circle cx=\"205\" cy=\"12.3\" r=\"0.5\"/><circle cx=\"175\" cy=\"1.2\" r=\"1.1\"/><circle cx=\"198\" cy=\"4.4\" r=\"1.1\"/><circle cx=\"182\" cy=\"6.2\" r=\"0.5\"/><circle cx=\"167\" cy=\"3.5\" r=\"0.3\"/><circle cx=\"194\" cy=\"2.3\" r=\"0.5\"/><circle cx=\"173\" cy=\"1.3\" r=\"0.5\"/><circle cx=\"186\" cy=\"1.2\" r=\"0.7\"/><circle cx=\"191\" cy=\"2.9\" r=\"0.8\"/><circle cx=\"204\" cy=\"1.1\" r=\"1.8\"/><circle cx=\"186\" cy=\"6.6\" r=\"0.7\"/><circle cx=\"182\" cy=\"4.2\" r=\"0.4\"/><circle cx=\"169\" cy=\"3.5\" r=\"0.6\"/><circle cx=\"186\" cy=\"8.0\" r=\"0.5\"/><circle cx=\"177\" cy=\"10.7\" r=\"0.5\"/><circle cx=\"169\" cy=\"0.8\" r=\"1.5\"/><circle cx=\"192\" cy=\"1.6\" r=\"1.7\"/><circle cx=\"182\" cy=\"0.8\" r=\"1.1\"/><circle cx=\"189\" cy=\"3.1\" r=\"0.6\"/><circle cx=\"218\" cy=\"0.8\" r=\"0.9\"/><circle cx=\"225\" cy=\"7.1\" r=\"0.4\"/><circle cx=\"232\" cy=\"2.2\" r=\"1.0\"/><circle cx=\"210\" cy=\"2.2\" r=\"0.5\"/><circle cx=\"228\" cy=\"0.8\" r=\"1.8\"/><circle cx=\"206\" cy=\"11.7\" r=\"0.5\"/><circle cx=\"230\" cy=\"5.4\" r=\"1.2\"/><circle cx=\"221\" cy=\"3.2\" r=\"0.8\"/><circle cx=\"224\" cy=\"8.0\" r=\"0.5\"/><circle cx=\"233\" cy=\"3.0\" r=\"1.7\"/><circle cx=\"216\" cy=\"11.0\" r=\"0.6\"/><circle cx=\"215\" cy=\"1.2\" r=\"1.2\"/><circle cx=\"237\" cy=\"2.5\" r=\"1.3\"/><circle cx=\"209\" cy=\"4.3\" r=\"1.3\"/><circle cx=\"211\" cy=\"1.9\" r=\"1.9\"/><circle cx=\"209\" cy=\"2.4\" r=\"0.5\"/><circle cx=\"228\" cy=\"10.1\" r=\"0.8\"/><rect x=\"0\" y=\"0\" width=\"240\" height=\".7\" opacity=\".55\"/></g>" },
    { key: "fisuras", nombre: "Fisuras", nota: "Vetas que nacen del borde y se ramifican, como vidrio cuarteado.",
      inner: "<g stroke=\"url(#f)\" fill=\"none\" stroke-linecap=\"round\"><path d=\"M0 .7h240\" stroke-width=\"1.4\"/><path d=\"M10.2 1L12.1 9.2L12.0 15.7M10.2 1L9.7 8.7\" stroke-width=\"0.99\"/><path d=\"M38.2 1L38.3 4.5L38.1 10.0M38.3 4.5L32.5 8.6M38.2 1L44.1 7.8\" stroke-width=\"0.70\"/><path d=\"M64.2 1L62.5 4.4L64.9 10.2M64.2 1L60.2 8.9\" stroke-width=\"1.12\"/><path d=\"M80.0 1L78.9 9.5L80.2 17.7\" stroke-width=\"1.18\"/><path d=\"M107.9 1L106.0 5.1L107.0 11.7M106.0 5.1L103.6 11.1M107.9 1L110.3 5.7\" stroke-width=\"0.79\"/><path d=\"M134.2 1L134.5 6.6L133.1 13.3M134.5 6.6L140.2 9.7\" stroke-width=\"1.11\"/><path d=\"M144.6 1L142.2 8.3L143.8 16.1M142.2 8.3L138.4 16.1M144.6 1L148.2 8.6\" stroke-width=\"1.17\"/><path d=\"M161.5 1L160.0 6.8L161.6 12.2M160.0 6.8L163.5 14.1M161.5 1L167.7 4.5\" stroke-width=\"0.80\"/><path d=\"M183.7 1L183.4 10.1L182.7 17.3M183.4 10.1L181.2 14.0M183.7 1L178.8 7.4\" stroke-width=\"1.20\"/><path d=\"M196.9 1L198.0 4.8L199.8 9.4M198.0 4.8L199.1 11.9\" stroke-width=\"0.85\"/><path d=\"M208.0 1L208.0 8.6L205.2 17.2M208.0 8.6L210.8 16.3\" stroke-width=\"1.07\"/><path d=\"M220.2 1L218.3 7.3L218.1 12.9M218.3 7.3L224.3 14.6\" stroke-width=\"0.87\"/><path d=\"M239.9 1L239.5 7.1L239.8 15.6M239.5 7.1L238.0 15.1\" stroke-width=\"0.98\"/></g>" },
  ];

  function _svg(inner) {
    return "url('data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 20" preserveAspectRatio="none">' +
      '<linearGradient id="f" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#fff"/>' +
      '<stop offset=".5" stop-color="#fff" stop-opacity=".8"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' + inner + '</svg>'
    ) + "')";
  }

  function frostKey() {
    try {
      const v = localStorage.getItem(K_FROST);
      return _ESCARCHAS.some(e => e.key === v) ? v : 'carambanos';
    } catch (e) { return 'carambanos'; }
  }

  function setFrost(key) {
    if (!_ESCARCHAS.some(e => e.key === key)) return;
    try { localStorage.setItem(K_FROST, key); } catch (e) {}
    apply({ silencioso: true });
  }

  function frosts() { return _ESCARCHAS.map(e => ({ key: e.key, nombre: e.nombre, nota: e.nota })); }

  // La silueta de una escarcha, lista para meterse en un style — la usa
  // Configuración para pintar las miniaturas del selector.
  function frostArt(key) {
    const e = _ESCARCHAS.find(x => x.key === key) || _ESCARCHAS[0];
    return _svg(e.inner);
  }

  // El color del hielo para un progreso dado, para que la vista previa
  // del panel se tiña igual que la app.
  function iceAt(p) {
    const c = _hsl(p);
    return _css(c.h, Math.min(100, c.s + 5), Math.min(92, c.l + 25), 0.55);
  }

  // Cuánta escarcha toca en un progreso dado (0-1).
  function frostAmountAt(p) { return stage(p).frost; }

  // ── APLICAR ──────────────────────────────────────────────────────────

  function enabled() {
    try { const v = localStorage.getItem(K_ENABLED); return v === null ? true : v === '1'; }
    catch (e) { return true; }
  }

  function setEnabled(on) {
    try { localStorage.setItem(K_ENABLED, on ? '1' : '0'); } catch (e) {}
    apply({ silencioso: true });
  }

  function _limpiar() {
    const r = document.documentElement;
    ['--accent','--accent-dim','--accent-dark','--accent-glow','--accent-glow-lg',
     '--border-accent','--success','--winter-frost','--winter-ice',
     '--winter-frost-art'].forEach(v => r.style.removeProperty(v));
    r.removeAttribute('data-winter');
  }

  function apply({ silencioso = false } = {}) {
    const r = document.documentElement;
    if (!enabled()) { _limpiar(); _aplicado = null; return; }

    const p = progress();
    const e = stage(p);
    const c = _hsl(p);

    r.style.setProperty('--accent',         _css(c.h, c.s, c.l));
    r.style.setProperty('--accent-dim',     _css(c.h, c.s, c.l * 0.80));
    r.style.setProperty('--accent-dark',    _css(c.h, c.s, c.l * 0.32));
    r.style.setProperty('--accent-glow',    _css(c.h, c.s, c.l, 0.12));
    r.style.setProperty('--accent-glow-lg', _css(c.h, c.s, c.l, 0.25));
    r.style.setProperty('--border-accent',  _css(c.h, c.s, c.l, 0.25));
    // --success comparte color con el acento en el diseño original;
    // si no se mueve junto, a media temporada conviven un verde y un
    // azul que se ven como un descuido.
    r.style.setProperty('--success',        _css(c.h, c.s, c.l));
    // Cuánta escarcha llevan las tarjetas (0-1). El CSS lo lee.
    r.style.setProperty('--winter-frost',   e.frost.toFixed(2));
    r.style.setProperty('--winter-ice',     _css(c.h, Math.min(100, c.s + 5), Math.min(92, c.l + 25), 0.55));
    r.style.setProperty('--winter-frost-art', frostArt(frostKey()));
    r.setAttribute('data-winter', e.key);

    // ¿Cruzamos de etapa? Es el momento que vale la pena marcar.
    const anterior = _aplicado;
    _aplicado = e.key;
    if (!silencioso && anterior !== null && anterior !== e.key) _momentoDeEtapa(e);
    else if (!silencioso && anterior === null && !_yaVista(e.key) && e.index > 0) _momentoDeEtapa(e);
  }

  function _yaVista(key) {
    try { return (JSON.parse(localStorage.getItem(K_SEEN)) || []).includes(key); }
    catch (e) { return false; }
  }
  function _marcarVista(key) {
    try {
      const a = JSON.parse(localStorage.getItem(K_SEEN)) || [];
      if (!a.includes(key)) { a.push(key); localStorage.setItem(K_SEEN, JSON.stringify(a)); }
    } catch (e) {}
  }

  // ── EL MOMENTO ───────────────────────────────────────────────────────
  // Lo que se ve al cruzar de etapa. Es lo único "súper llamativo" de
  // todo esto, y a propósito: el resto del tiempo la app tiene que
  // dejarte entrenar en paz.

  function _momentoDeEtapa(e) {
    if (enPreview()) return;      // probando colores no se dispara nada
    _marcarVista(e.key);
    showStageMoment(e);
  }

  function showStageMoment(e) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ov = document.createElement('div');
    ov.className = 'winter-moment';
    ov.innerHTML = `
      <canvas class="winter-snow"></canvas>
      <div class="winter-moment-card">
        <div class="winter-moment-eyebrow">Winter Arc · etapa ${e.index + 1} de ${e.total}</div>
        <div class="winter-moment-title">${_esc(e.nombre)}</div>
        <div class="winter-moment-lema">${_esc(e.lema)}</div>
        <div class="winter-moment-hint">Toca para continuar</div>
      </div>`;
    document.body.appendChild(ov);

    let cerrado = false;
    const cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      if (typeof gsap !== 'undefined') {
        gsap.to(ov, { opacity: 0, duration: 0.35, ease: 'power2.in', onComplete: () => ov.remove() });
      } else ov.remove();
    };
    ov.addEventListener('click', cerrar);

    if (typeof gsap !== 'undefined' && !reduce) {
      gsap.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
      const card = ov.querySelector('.winter-moment-card');
      gsap.fromTo(card, { opacity: 0, y: 24, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'fittrackerSpring', delay: 0.15 });
    }
    if (!reduce) _nieve(ov.querySelector('.winter-snow'));

    Haptics?.done?.();
    setTimeout(cerrar, 7000);
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Nieve en canvas, como el confeti de los récords: sin librerías y se
  // apaga sola. Copos de tres tamaños para que se lea profundidad —
  // los grandes caen más rápido y más borrosos, como si estuvieran
  // cerca de la cámara.
  function _nieve(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;

    const copos = Array.from({ length: 90 }, () => {
      const capa = Math.random();
      return {
        x: Math.random() * W,
        y: Math.random() * -H,
        r: 1 + capa * 3,
        vy: 0.6 + capa * 2.2,
        vx: (Math.random() - 0.5) * 0.7,
        a: 0.25 + capa * 0.55,
        fase: Math.random() * Math.PI * 2,
      };
    });

    let frame = 0;
    (function loop() {
      frame++;
      ctx.clearRect(0, 0, W, H);
      copos.forEach(c => {
        c.y += c.vy;
        c.x += c.vx + Math.sin((frame / 50) + c.fase) * 0.4;
        if (c.y > H + 10) { c.y = -10; c.x = Math.random() * W; }
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(226,244,255,${c.a})`;
        ctx.fill();
      });
      if (frame < 460 && canvas.isConnected) requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, W, H);
    })();
  }

  // ── ESTADO PARA CONFIGURACIÓN ────────────────────────────────────────

  function status() {
    const p = progress();
    const e = stage(p);
    const sig = ETAPAS[e.index + 1] || null;
    return {
      enabled: enabled(),
      preview: _previewGuardado(),
      pct: Math.round(p * 100),
      stage: e,
      next: sig,
      daysLeft: diasRestantes(),
      accent: accentAt(p),
      frost: frostKey(),
    };
  }

  // Se vuelve a evaluar al volver a la app: si pasó la medianoche (o
  // varios días) con la app abierta en segundo plano, el progreso ya
  // cambió y puede tocar cruce de etapa.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) apply();
  });

  return {
    apply, progress, stage, stages, status, accentAt,
    enabled, setEnabled, setPreview, enPreview, diasRestantes,
    showStageMoment,
    frosts, frostKey, setFrost, frostArt, iceAt, frostAmountAt,
  };
})();
