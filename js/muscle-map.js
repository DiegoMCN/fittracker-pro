// ═══════════════════════════════════════════
// MUSCLE MAP — mapeo de ejercicios a las regiones de body-muscles
// (librería fijada en js/vendor/body-muscles-1.0.0.umd.min.js)
//
// Cómo se calcula la intensidad (0-10):
//   1. Cada serie completada de un ejercicio suma "series efectivas" a
//      los músculos que trabaja: 1 al músculo principal, 0.5 a los
//      secundarios, 0.25 a los que apenas participan (conteo de
//      "series fraccionadas", el método estándar en la literatura).
//   2. Se suman las series efectivas por músculo en una ventana de 7
//      días.
//   3. Nivel = series efectivas ÷ 2, redondeado, con tope en 10.
//      → cada punto de nivel = 2 series por semana.
//
// Por qué series y no kilos: 1,000 kg de prensa y 1,000 kg de curl no
// significan lo mismo para el músculo. Las series duras por semana sí
// son comparables entre músculos, y son la variable que más predice
// el crecimiento muscular.
// ═══════════════════════════════════════════

const MuscleMap = (() => {

  // Regiones anatómicas propias (en español) → IDs de la librería.
  // Cada región junta lado izquierdo y derecho, porque los datos se
  // registran por ejercicio, no por lado.
  const REGIONS = {
    pecho_alto:         { name: 'Pecho superior',       ids: ['chest-upper-left','chest-upper-right'] },
    pecho_bajo:         { name: 'Pecho inferior',       ids: ['chest-lower-left','chest-lower-right'] },
    deltoide_anterior:  { name: 'Deltoides anterior',   ids: ['shoulder-front-left','shoulder-front-right'] },
    deltoide_lateral:   { name: 'Deltoides lateral',    ids: ['shoulder-side-left','shoulder-side-right'] },
    deltoide_posterior: { name: 'Deltoides posterior',  ids: ['deltoid-rear-left','deltoid-rear-right'] },
    trapecio_superior:  { name: 'Trapecio superior',    ids: ['traps-upper-left','traps-upper-right'] },
    trapecio_medio:     { name: 'Trapecio medio/bajo y romboides', ids: ['traps-mid-left','traps-mid-right','traps-lower-left','traps-lower-right'] },
    dorsal:             { name: 'Dorsal ancho',         ids: ['lats-upper-left','lats-mid-left','lats-lower-left','lats-upper-right','lats-mid-right','lats-lower-right'] },
    biceps:             { name: 'Bíceps',               ids: ['biceps-left','biceps-right'] },
    triceps:            { name: 'Tríceps',              ids: ['triceps-long-left','triceps-lateral-left','triceps-long-right','triceps-lateral-right'] },
    antebrazo:          { name: 'Antebrazo y agarre',   ids: ['forearm-left','forearm-right','forearm-flexors-left','forearm-extensors-left','forearm-flexors-right','forearm-extensors-right'] },
    abdomen:            { name: 'Abdomen',              ids: ['abs-upper-left','abs-upper-right','abs-lower-left','abs-lower-right'] },
    oblicuos:           { name: 'Oblicuos y serrato',   ids: ['obliques-left','obliques-right','serratus-anterior-left','serratus-anterior-right'] },
    lumbar:             { name: 'Zona lumbar',          ids: ['lower-back-erectors-left','lower-back-ql-left','lower-back-erectors-right','lower-back-ql-right'] },
    flexor_cadera:      { name: 'Flexores de cadera',   ids: ['hip-flexor-left','hip-flexor-right'] },
    gluteo_mayor:       { name: 'Glúteo mayor',         ids: ['gluteus-maximus-left','gluteus-maximus-right'] },
    gluteo_medio:       { name: 'Glúteo medio',         ids: ['gluteus-medius-left','gluteus-medius-right'] },
    cuadriceps:         { name: 'Cuádriceps',           ids: ['quads-left','quads-right'] },
    aductores:          { name: 'Aductores',            ids: ['adductors-left','adductors-right'] },
    isquios:            { name: 'Isquiotibiales',       ids: ['hamstrings-medial-left','hamstrings-lateral-left','hamstrings-medial-right','hamstrings-lateral-right'] },
    gemelos:            { name: 'Gemelos',              ids: ['calves-gastroc-medial-left','calves-gastroc-lateral-left','calves-gastroc-medial-right','calves-gastroc-lateral-right'] },
    soleo:              { name: 'Sóleo',                ids: ['calves-soleus-left','calves-soleus-right'] },
    tibial:             { name: 'Tibial anterior',      ids: ['tibialis-anterior-left','tibialis-anterior-right'] },
  };

  // Zonas del dibujo que no son músculos entrenables — siempre en 0.
  const NON_MUSCLE_IDS = [
    'head','face','neck-left','neck-right','head-back','nape','spine',
    'knee-left','knee-right','knee-back-left','knee-back-right',
    'elbow-left','elbow-right','hand-left','hand-right','hand-back-left','hand-back-right',
    'foot-left','foot-right','foot-back-left','foot-back-right',
  ];

  // Ejercicio → músculos que trabaja, con su peso de serie fraccionada.
  // La clave es el nombre normalizado (minúsculas, sin acentos), igual
  // que _normalizeName del backend, así coincide con PLAN_SEMANAL y
  // REGISTRO_FUERZA aunque varíe una tilde o un espacio.
  const EXERCISES = {
    // Jalones verticales
    'dominada libre (intento)':  { dorsal: 1, biceps: 0.5, trapecio_medio: 0.5, antebrazo: 0.5 },
    'dominadas negativas 5s':    { dorsal: 1, biceps: 0.5, trapecio_medio: 0.5, antebrazo: 0.5 },
    'dominadas asistidas':       { dorsal: 1, biceps: 0.5, trapecio_medio: 0.5, antebrazo: 0.25 },
    'jalon pecho prono':         { dorsal: 1, biceps: 0.5, trapecio_medio: 0.5 },
    'jalon pecho supino':        { dorsal: 1, biceps: 0.5, trapecio_medio: 0.25 },
    'pullover en polea':         { dorsal: 1, triceps: 0.25 },
    'dead hang en barra':        { antebrazo: 1, dorsal: 0.25 },
    'scapular pulls':            { trapecio_medio: 1, dorsal: 0.5 },
    // Remos
    'remo en polea baja':        { dorsal: 1, trapecio_medio: 1, deltoide_posterior: 0.5, biceps: 0.5 },
    'remo con barra':            { dorsal: 1, trapecio_medio: 1, deltoide_posterior: 0.5, biceps: 0.5, lumbar: 0.5 },
    'remo polea agarre ancho':   { trapecio_medio: 1, deltoide_posterior: 0.5, dorsal: 0.5, biceps: 0.5 },
    'face pulls en polea':       { deltoide_posterior: 1, trapecio_medio: 1 },
    'shrugs con mancuernas':     { trapecio_superior: 1, antebrazo: 0.5 },
    // Brazos
    'curl biceps con barra':     { biceps: 1, antebrazo: 0.5 },
    'curl martillo':             { biceps: 1, antebrazo: 1 },
    'ext. triceps cuerda':       { triceps: 1 },
    'copa a dos manos':          { triceps: 1 },
    // Empuje
    'fondos asistidos':          { pecho_bajo: 1, triceps: 1, deltoide_anterior: 0.5 },
    'flexiones pies elevados':   { pecho_alto: 1, pecho_bajo: 0.5, triceps: 0.5, deltoide_anterior: 0.5 },
    'press pecho declinado':     { pecho_bajo: 1, pecho_alto: 0.5, triceps: 0.5, deltoide_anterior: 0.25 },
    'cristos peck fly':          { pecho_alto: 1, pecho_bajo: 1, deltoide_anterior: 0.25 },
    'elevaciones laterales':     { deltoide_lateral: 1, trapecio_superior: 0.25 },
    // Core
    'plancha isometrica':        { abdomen: 1, oblicuos: 0.5 },
    'hollow body hold':          { abdomen: 1, flexor_cadera: 0.5 },
    'hollow body progresivo':    { abdomen: 1, flexor_cadera: 0.5 },
    'ab wheel rollout':          { abdomen: 1, oblicuos: 0.5, dorsal: 0.25 },
    'abdominales de remador':    { abdomen: 1, flexor_cadera: 0.5 },
    'plancha lateral (c/lado)':  { oblicuos: 1, gluteo_medio: 0.5, abdomen: 0.25 },
    // Piernas
    'sentadilla en smith':       { cuadriceps: 1, gluteo_mayor: 0.5, aductores: 0.5 },
    'leg press 45°':             { cuadriceps: 1, gluteo_mayor: 0.5, aductores: 0.25 },
    'zancadas con mancuernas (c/pierna)': { cuadriceps: 1, gluteo_mayor: 1, gluteo_medio: 0.5, aductores: 0.25 },
    'sentadilla con salto':      { cuadriceps: 1, gluteo_mayor: 0.5, gemelos: 0.5 },
    'curl femoral tumbado':      { isquios: 1, gemelos: 0.25 },
    'peso muerto rumano':        { isquios: 1, gluteo_mayor: 1, lumbar: 0.5, antebrazo: 0.25 },
    'hip thrust':                { gluteo_mayor: 1, isquios: 0.5, gluteo_medio: 0.25 },
    'extension de gemelos':      { gemelos: 1, soleo: 0.5 },
    'gemelo excentrico 1 pierna':{ gemelos: 1, soleo: 0.5 },
  };

  // Respaldo por grupo muscular — para ejercicios nuevos que todavía
  // no estén en la lista de arriba. Menos preciso, pero así ningún
  // ejercicio desaparece del mapa. "Movilidad" y "Cardio" no suman:
  // no son trabajo de fuerza.
  const GROUP_FALLBACK = {
    'pecho':          { pecho_alto: 1, pecho_bajo: 1 },
    'espalda':        { dorsal: 1, trapecio_medio: 0.5 },
    'hombro':         { deltoide_lateral: 1, deltoide_anterior: 0.5, deltoide_posterior: 0.5 },
    'biceps':         { biceps: 1 },
    'triceps':        { triceps: 1 },
    'core':           { abdomen: 1, oblicuos: 0.5 },
    'cuadriceps':     { cuadriceps: 1 },
    'isquiotibiales': { isquios: 1 },
    'pantorrillas':   { gemelos: 1, soleo: 0.5 },
    'gluteo':         { gluteo_mayor: 1, gluteo_medio: 0.5 },
    'calistenia':     { dorsal: 1, biceps: 0.5 }, // solo para historial viejo
  };

  // Bandas de interpretación del nivel 0-10 (series efectivas / semana)
  const BANDS = [
    { min: 0,  max: 0,  label: 'Sin estímulo',        desc: 'No se trabajó en la ventana' },
    { min: 1,  max: 2,  label: 'Estímulo mínimo',     desc: '2–5 series/sem — no alcanza para mantener' },
    { min: 3,  max: 4,  label: 'Mantenimiento',       desc: '6–9 series/sem — conserva lo que tienes' },
    { min: 5,  max: 7,  label: 'Zona productiva',     desc: '10–15 series/sem — rango de progreso' },
    { min: 8,  max: 9,  label: 'Productiva alta',     desc: '16–19 series/sem — mucho estímulo' },
    { min: 10, max: 10, label: 'Volumen muy alto',    desc: '20+ series/sem — vigila la recuperación' },
  ];

  function _norm(s) {
    return String(s || '').replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function weightsFor(exerciseName, group) {
    return EXERCISES[_norm(exerciseName)] || GROUP_FALLBACK[_norm(group)] || null;
  }

  // exercises: { nombre: { sets, group } } → { region: seriesEfectivas }
  function effectiveSets(exercises) {
    const out = {};
    Object.entries(exercises || {}).forEach(([name, info]) => {
      const w = weightsFor(name, info.group);
      if (!w) return;
      Object.entries(w).forEach(([region, factor]) => {
        out[region] = (out[region] || 0) + (info.sets || 0) * factor;
      });
    });
    return out;
  }

  function level(sets) {
    return Math.max(0, Math.min(10, Math.round((sets || 0) / 2)));
  }

  function band(lvl) {
    return BANDS.find(b => lvl >= b.min && lvl <= b.max) || BANDS[0];
  }

  // { region: seriesEfectivas } → bodyState de la librería
  function toBodyState(setsByRegion) {
    const state = {};
    Object.entries(REGIONS).forEach(([key, r]) => {
      const lvl = level(setsByRegion[key]);
      r.ids.forEach(id => { state[id] = { intensity: lvl, selected: false }; });
    });
    return state;
  }

  function regionForId(id) {
    return Object.keys(REGIONS).find(k => REGIONS[k].ids.includes(id)) || null;
  }

  return { REGIONS, NON_MUSCLE_IDS, EXERCISES, BANDS, weightsFor, effectiveSets, level, band, toBodyState, regionForId, _norm };
})();
