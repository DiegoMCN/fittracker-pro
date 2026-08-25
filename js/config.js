// ═══════════════════════════════════════════
// CONFIG — FitTracker Pro
// ═══════════════════════════════════════════

const CONFIG = {
  // URL del Apps Script deployado
  API_URL: 'https://script.google.com/macros/s/AKfycbzwQ7dai8WpW88YnDHEf6GJy6qwB_OIoHWORM8qrFYNnSJh4IRpuJMnkCKLEBhjXY3B/exec',

  // Sheet IDs (nombre de cada hoja en tu Google Sheet)
  SHEETS: {
    FUERZA:   'REGISTRO_FUERZA',
    CARDIO:   'REGISTRO_CARDIO',
    SESION:   'REGISTRO_SESION',
    METRICAS: 'METRICAS_CLAVE',
    EJERCICIOS: 'EJERCICIOS',
    PLAN:     'PLAN_SEMANAL',
    RECORDS:  'RECORDS_PERSONALES'
  },

  // Plan de la semana (sincronizado con tu plan actual)
  WEEK_PLAN: {
    1: { name: 'Jalón + Bíceps + Core',      icon: '💪', color: '#7C3AED', type: 'fuerza'  },
    2: { name: 'HIT + Piernas + Potencia',   icon: '🏃', color: '#EF4444', type: 'mixta'   },
    3: { name: 'Empuje + Tríceps',           icon: '🔥', color: '#F97316', type: 'fuerza'  },
    4: { name: 'Sprint técnico + Core',      icon: '⚡', color: '#3B82F6', type: 'cardio'  },
    5: { name: 'Espalda + Hombro',           icon: '🎯', color: '#10B981', type: 'fuerza'  },
    6: { name: 'Zona 2 + Movilidad',         icon: '🧘', color: '#06B6D4', type: 'cardio'  },
    0: { name: 'Descanso',                   icon: '😴', color: '#6E6D8A', type: 'rest'    }
  },

  // Zonas cardíacas (personalizadas para Diego)
  HR_ZONES: {
    1: { name: 'Z1', min: 0,   max: 143, color: '#3B82F6', label: 'Recuperación' },
    2: { name: 'Z2', min: 144, max: 153, color: '#10B981', label: 'Aeróbico' },
    3: { name: 'Z3', min: 154, max: 164, color: '#84CC16', label: 'Tempo' },
    4: { name: 'Z4', min: 165, max: 176, color: '#F59E0B', label: 'Umbral' },
    5: { name: 'Z5', min: 177, max: 999, color: '#EF4444', label: 'Máximo' }
  },

  // Fecha real de inicio de Fase 1 — cambia esto si reinicias el programa.
  // La semana actual se calcula sola a partir de aquí, en vez de estar
  // hardcodeada (por eso antes se quedaba trabada en "Semana 3" para siempre).
  PROGRAM_START_DATE: '2026-08-17', // lunes de esta semana

  // Fase actual del programa
  CURRENT_PHASE: {
    number: 1,
    name: 'Fase 1 — Reconstrucción',
    startWeek: 1,
    endWeek: 4,
    get currentWeek() {
      const start = new Date(CONFIG.PROGRAM_START_DATE + 'T00:00:00');
      const now = new Date();
      const diffDays = Math.floor((now - start) / 86400000);
      return Math.max(1, Math.floor(diffDays / 7) + 1);
    }
  },

  // Objetivos
  GOALS: {
    sprintSpeed:  { current: 12,  target: 20,  unit: 'km/h',  label: 'Velocidad sprint' },
    pullUps:      { current: 0,   target: 8,   unit: 'reps',  label: 'Dominadas' },
    hrRecovery:   { current: -14, target: -20, unit: 'bpm',   label: 'Rec. cardíaca 2min' },
    cadence:      { current: 117, target: 170, unit: 'spm',   label: 'Cadencia promedio' },
    plank:        { current: 50,  target: 60,  unit: 'seg',   label: 'Plancha máx.' },
    deadHang:     { current: 30,  target: 60,  unit: 'seg',   label: 'Dead hang' }
  },

  // HIT Protocols
  HIT_PROTOCOLS: {
    'nivel1': {
      name: 'HIT 10\' Nivel 1',
      day: 2,
      phases: [
        { duration: 60,  speed: '5-6',   effort: 'easy',     label: 'Calentamiento' },
        { duration: 120, speed: '7-9',   effort: 'moderate', label: 'Moderado' },
        { duration: 60,  speed: '10-12', effort: 'max',      label: 'MÁXIMO' },
        { duration: 60,  speed: '5-6',   effort: 'easy',     label: 'Recuperación' },
        { duration: 60,  speed: '7-9',   effort: 'moderate', label: 'Moderado' },
        { duration: 60,  speed: '5-6',   effort: 'easy',     label: 'Recuperación' },
        { duration: 60,  speed: '10-12', effort: 'max',      label: 'MÁXIMO' },
        { duration: 60,  speed: '7-9',   effort: 'moderate', label: 'Moderado' },
        { duration: 60,  speed: '5-6',   effort: 'easy',     label: 'Enfriamiento' }
      ]
    },
    'sprint-tecnico': {
      name: 'Sprint Técnico — Cadencia',
      day: 4,
      phases: [
        { duration: 120, speed: '6',     effort: 'moderate', label: 'Cadencia 140-150 spm (1/5)' },
        { duration: 120, speed: '6',     effort: 'moderate', label: 'Cadencia 140-150 spm (2/5)' },
        { duration: 120, speed: '6',     effort: 'moderate', label: 'Cadencia 140-150 spm (3/5)' },
        { duration: 120, speed: '6',     effort: 'moderate', label: 'Cadencia 140-150 spm (4/5)' },
        { duration: 120, speed: '6',     effort: 'moderate', label: 'Cadencia 140-150 spm (5/5)' },
        { duration: 60,  speed: '8',     effort: 'moderate', label: 'Progresión → 8 km/h' },
        { duration: 60,  speed: '10',    effort: 'moderate', label: 'Progresión → 10 km/h' },
        { duration: 60,  speed: '12',    effort: 'max',      label: 'Progresión → 12 km/h' },
        { duration: 120, speed: '6',     effort: 'easy',     label: 'Recuperación' },
        { duration: 60,  speed: '8',     effort: 'moderate', label: 'Ronda 2 → 8 km/h' },
        { duration: 60,  speed: '10',    effort: 'moderate', label: 'Ronda 2 → 10 km/h' },
        { duration: 60,  speed: '12',    effort: 'max',      label: 'Ronda 2 → 12 km/h' },
        { duration: 120, speed: '6',     effort: 'easy',     label: 'Enfriamiento' }
      ]
    },
    'zona2': {
      name: 'Zona 2 — 35 min',
      day: 6,
      phases: [
        { duration: 2100, speed: 'constante', effort: 'z2', label: '143–153 bpm constante' }
      ]
    }
  },

  // Grupos musculares
  MUSCLE_GROUPS: ['Pecho','Espalda','Biceps','Triceps','Hombro','Cuadriceps','Isquiotibiales','Pantorrillas','Core','Calistenia','Cardio'],

  // Unidades
  UNITS: ['kg','lbs','seg','PC'],

  // Ejercicios del plan por día (base editable en la sesión activa)
  PLAN_EXERCISES: {
    1: [ // Lunes — Jalón + Bíceps + Core
      { name:'Dominadas Asistidas',    group:'Calistenia', sets:4, repsMin:6,  repsMax:8,  unit:'lbs', rest:90, notes:'Peso = asistencia de la máquina. Menor asistencia posible. Baja cuando logres 3x8 limpio.' },
      { name:'Jalón Pecho Prono',      group:'Espalda',    sets:4, repsMin:8,  repsMax:10, unit:'kg',  rest:60, notes:'Misma línea de fuerza que la dominada.' },
      { name:'Remo en Polea Baja',     group:'Espalda',    sets:3, repsMin:10, repsMax:12, unit:'lbs', rest:60, notes:'Codos pegados al cuerpo al subir.' },
      { name:'Jalón Pecho Supino',     group:'Espalda',    sets:3, repsMin:12, repsMax:12, unit:'kg',  rest:45, notes:'Carga más el bíceps. Cierre del jalón vertical.' },
      { name:'Curl Bíceps con Barra',  group:'Biceps',     sets:3, repsMin:8,  repsMax:12, unit:'kg',  rest:60, notes:'Pirámide: empieza fuerte, baja en la última.' },
      { name:'Curl Martillo',          group:'Biceps',     sets:3, repsMin:12, repsMax:12, unit:'kg',  rest:45, notes:'Braquial — clave para fuerza de agarre.' },
      { name:'Plancha Isométrica',     group:'Core',       sets:3, repsMin:45, repsMax:60, unit:'seg', rest:45, notes:'+5 seg por sesión. Baseline: 45 seg.' },
      { name:'Hollow Body Hold',       group:'Core',       sets:3, repsMin:20, repsMax:30, unit:'seg', rest:45, notes:'Espalda baja pegada al piso.' },
    ],
    2: [ // Martes — HIT + Piernas + Potencia
      { name:'Sentadilla en Smith',    group:'Cuadriceps', sets:4, repsMin:10, repsMax:12, unit:'kg',  rest:75, notes:'Profundidad completa.' },
      { name:'Leg Press 45°',          group:'Cuadriceps', sets:3, repsMin:8,  repsMax:10, unit:'kg',  rest:60, notes:'No bloquees rodillas al extender.' },
      { name:'Curl Femoral Tumbado',   group:'Isquiotibiales', sets:3, repsMin:8, repsMax:10, unit:'lbs', rest:60, notes:'Fundamental para velocidad y prevención de lesión.' },
      { name:'Extensión de Gemelos',   group:'Pantorrillas', sets:4, repsMin:15, repsMax:20, unit:'kg', rest:45, notes:'Rango completo. Motor del sprint. ⚠ Subir carga.' },
      { name:'Sentadilla con Salto',   group:'Cuadriceps', sets:3, repsMin:5,  repsMax:5,  unit:'PC',  rest:90, notes:'3x5 saltos máximos con reset — NO 3x10 rápidos.' },
    ],
    3: [ // Miércoles — Empuje + Tríceps
      { name:'Fondos Asistidos',       group:'Calistenia', sets:4, repsMin:6,  repsMax:8,  unit:'lbs', rest:90, notes:'Peso = asistencia de la máquina. Baja hasta hombros al nivel de codos.' },
      { name:'Flexiones Pies Elevados',group:'Pecho',      sets:3, repsMin:1,  repsMax:20, unit:'PC',  rest:60, notes:'Máx reps. Preparación para muscle-up.' },
      { name:'Press Pecho Declinado',  group:'Pecho',      sets:4, repsMin:8,  repsMax:10, unit:'kg',  rest:75, notes:'Objetivo: 25 kg por brazo.' },
      { name:'Cristos Peck Fly',       group:'Pecho',      sets:3, repsMin:12, repsMax:12, unit:'lbs', rest:60, notes:'Baseline: 115 lbs (52kg).' },
      { name:'Elevaciones Laterales',  group:'Hombro',     sets:3, repsMin:12, repsMax:15, unit:'kg',  rest:45, notes:'Codos ligeramente doblados.' },
      { name:'Ext. Tríceps Cuerda',    group:'Triceps',    sets:3, repsMin:10, repsMax:12, unit:'lbs', rest:60, notes:'Baseline: 57 lbs.' },
      { name:'Copa a Dos Manos',       group:'Triceps',    sets:3, repsMin:12, repsMax:12, unit:'kg',  rest:45, notes:'22kg overhead. Máximo estiramiento.' },
    ],
    4: [ // Jueves — Sprint técnico + Core
      { name:'Dead Hang en Barra',     group:'Calistenia', sets:3, repsMin:1,  repsMax:60, unit:'seg', rest:60, notes:'Máximo tiempo posible. Fundamental antes de dominadas.' },
      { name:'Scapular Pulls',         group:'Calistenia', sets:3, repsMin:10, repsMax:10, unit:'PC',  rest:60, notes:'El primer centímetro de la dominada.' },
      { name:'Hollow Body Progresivo', group:'Core',       sets:3, repsMin:20, repsMax:30, unit:'seg', rest:45, notes:'Sem 1-2: rodillas dobladas.' },
      { name:'Ab Wheel Rollout',       group:'Core',       sets:3, repsMin:8,  repsMax:10, unit:'PC',  rest:60, notes:'Core anti-extension crítico.' },
      { name:'Abdominales de Remador', group:'Core',       sets:3, repsMin:12, repsMax:15, unit:'kg',  rest:45, notes:'Baseline: 8kg. +1kg cada 2 semanas.' },
    ],
    5: [ // Viernes — Espalda + Hombro
      { name:'Dominadas Asistidas',    group:'Calistenia', sets:3, repsMin:6,  repsMax:8,  unit:'lbs', rest:90, notes:'Peso = asistencia de la máquina. Misma carga que el lunes.' },
      { name:'Remo con Barra',         group:'Espalda',    sets:4, repsMin:8,  repsMax:10, unit:'kg',  rest:75, notes:'Espalda gruesa. ⚠ Subir carga — sigue ligero.' },
      { name:'Remo Polea Agarre Ancho',group:'Espalda',    sets:3, repsMin:12, repsMax:12, unit:'kg',  rest:60, notes:'Dorsal ancho, distinto al agarre neutro del lunes.' },
      { name:'Pullover en Polea',      group:'Espalda',    sets:3, repsMin:12, repsMax:12, unit:'kg',  rest:60, notes:'Rango más largo — clave para la dominada.' },
      { name:'Face Pulls en Polea',    group:'Hombro',     sets:3, repsMin:15, repsMax:15, unit:'lbs', rest:45, notes:'OBLIGATORIOS — protegen el hombro.' },
      { name:'Shrugs con Mancuernas',  group:'Hombro',     sets:3, repsMin:12, repsMax:12, unit:'kg',  rest:45, notes:'Sube despacio, 1 seg arriba.' },
    ],
    6: [], // Sábado — Zona 2 (cardio, no sets)
    0: [], // Domingo — Descanso
  },

  // Baseline stats (23 Mar 2026)
  BASELINE: {
    date: '2026-03-23',
    weight: 92.1,
    muscleMass: 68.2,
    fatPercent: 21.9,
    hrAvgStrength: 140,
    cadenceAvg: 109,
    pullUpsAssist: 80,
    plankMax: 45,
    // Antes faltaban estos 3 — sin ellos, la barra de progreso caía a
    // un punto de partida inventado (mitad de la meta) en vez del
    // arranque real del programa, haciendo que el progreso se viera
    // plano incluso cuando sí había datos.
    speed: 12,      // velocidad máxima registrada al inicio (km/h)
    pullUps: 0,     // cero dominadas limpias sin asistencia al inicio
    deadHang: 0,    // nunca medido antes de este programa
  }
};

// Freeze para evitar mutaciones accidentales
Object.freeze(CONFIG);
