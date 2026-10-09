// ═══════════════════════════════════════════
// CONFIGURACIÓN MODULE — Preferencias de la app
// Por ahora solo tiene la ciudad de "casa" (para la tarjeta de
// kilómetros comparados con distancias reales) — pensado para
// crecer con más ajustes más adelante.
// ═══════════════════════════════════════════

const Configuracion = (() => {

  let _profile = null;
  let _geocodeResult = null; // resultado crudo de Nominatim mientras se confirma, antes de guardar

  async function init(container) {
    container.innerHTML = `<div class="skeleton" style="height:220px;border-radius:16px;max-width:520px;margin:0 auto"></div>`;

    const res = await API.getProfile();
    _profile = res.profile || {};
    _geocodeResult = null;
    _render(container);
  }

  function _render(container) {
    const savedCity = _profile?.Ciudad_Origen || '';
    const savedLat  = _profile?.Ciudad_Lat;
    const savedLng  = _profile?.Ciudad_Lng;
    const pendingCount = typeof OfflineQueue !== 'undefined' ? OfflineQueue.count() : 0;

    container.innerHTML = `
      <div style="max-width:520px;margin:0 auto">
        <div class="card animate-slide-up">
          <div class="card-header">
            <div>
              <div class="card-title">🏠 Ciudad de origen ("casa")</div>
              <div class="card-subtitle">Se usa como punto de partida para comparar los kilómetros que corres contra distancias reales</div>
            </div>
          </div>

          ${savedCity ? `
          <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">📍</span>
            <div>
              <div style="font-weight:600;font-size:13px">${savedCity}</div>
              ${savedLat && savedLng ? `<div style="font-size:11px;color:var(--text-3)">${Number(savedLat).toFixed(4)}, ${Number(savedLng).toFixed(4)}</div>` : ''}
            </div>
          </div>` : `
          <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">Todavía no has configurado tu ciudad.</div>
          `}

          <div class="input-group">
            <label class="input-label">Busca tu ciudad</label>
            <input class="input" id="cfg-city-input" placeholder="Ej. Playa del Carmen, México" value="${savedCity}">
          </div>
          <button class="btn btn-secondary" style="width:100%;margin-top:10px" onclick="Configuracion.geocode()">
            🔍 Buscar
          </button>

          <div id="cfg-geocode-result"></div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <div>
              <div class="card-title">🧹 Mantenimiento</div>
              <div class="card-subtitle">Datos guardados en este teléfono que todavía no se han subido</div>
            </div>
          </div>
          <div id="cfg-queue-status" style="font-size:12px;color:var(--text-3);margin-bottom:12px">
            ${pendingCount > 0
              ? `${pendingCount} elemento${pendingCount === 1 ? '' : 's'} esperando a subirse`
              : 'No hay nada pendiente por subir ahora mismo'}
          </div>
          <button class="btn btn-secondary" style="width:100%" onclick="Configuracion.clearLocalData()">
            🗑️ Borrar datos guardados localmente
          </button>
          <div id="cfg-version" style="font-size:12px;color:var(--text-3);margin-top:14px;line-height:1.6">Verificando versión del servidor…</div>
        </div>

        <div class="card animate-slide-up" style="margin-top:20px">
          <div class="card-header">
            <div>
              <div class="card-title">🤖 Registro del Coach IA</div>
              <div class="card-subtitle">Cada intento contra cada modelo: si funcionó, por qué falló y cuánto tardó — para entender por qué se pasa de un modelo a otro</div>
            </div>
          </div>
          <div id="cfg-coach-log" style="font-size:12px;color:var(--text-3)">Cargando registro…</div>
        </div>

        <div class="card animate-slide-up" style="margin-top:20px">
          <div class="card-header">
            <div>
              <div class="card-title">🧠 Qué sabe la app y qué le llega a la IA</div>
              <div class="card-subtitle">Cada dato que la app calcula, y si entra al consejo de hoy o no. Más contexto no es más preciso: lo que no cambió desde ayer se omite a propósito</div>
            </div>
          </div>
          <div id="cfg-contexto" style="font-size:12px;color:var(--text-3)">Revisando…</div>
        </div>

        ${_winterPanelHTML()}

        ${_spotifyPanelHTML()}

        ${_motionPanelHTML()}
      </div>`;
    _loadVersion();
    _loadCoachLog();
    _loadContexto();
  }

  // ── WINTER ARC ───────────────────────────────────────────────────────

  function _winterPanelHTML() {
    if (typeof WinterArc === 'undefined') return '';
    const w = WinterArc.status();
    const esc = Utils.escapeHtml;
    const etapas = WinterArc.stages();

    // Escala de etapas: cada una con el color real que va a tener la
    // app en ese punto, para que se vea el recorrido completo de un
    // vistazo en vez de tener que imaginárselo.
    const escala = etapas.map((e, i) => {
      const activa = i === w.stage.index;
      const col = WinterArc.accentAt(e.desde);
      return `<div style="flex:1;text-align:center;opacity:${activa ? 1 : 0.45}">
        <div style="height:6px;border-radius:99px;background:${col};margin-bottom:6px;
                    ${activa ? 'box-shadow:0 0 10px ' + col : ''}"></div>
        <div style="font-size:9px;letter-spacing:0.3px;${activa ? 'font-weight:700' : ''}">${esc(e.nombre)}</div>
      </div>`;
    }).join('');

    return `
      <div class="card animate-slide-up" style="margin-top:20px">
        <div class="card-header">
          <div>
            <div class="card-title">❄️ Winter Arc</div>
            <div class="card-subtitle">La app se va enfriando contigo: el verde se vuelve hielo y las tarjetas se escarchan conforme avanza la temporada</div>
          </div>
        </div>

        ${w.enabled ? `
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px">
            <div>
              <span style="font-size:20px;font-weight:800;color:var(--accent)">${esc(w.stage.nombre)}</span>
              <span style="font-size:11px;color:var(--text-3);margin-left:6px">etapa ${w.stage.index + 1} de ${w.stage.total}</span>
            </div>
            <span style="font-size:11px;color:var(--text-3)">${w.pct}% · faltan ${w.daysLeft} días</span>
          </div>
          <div style="font-size:12px;color:var(--text-2);line-height:1.6;margin-bottom:16px">${esc(w.stage.lema)}</div>

          <div style="display:flex;gap:6px;margin-bottom:18px">${escala}</div>

          ${w.next ? `<div style="font-size:11px;color:var(--text-3);margin-bottom:16px">
            Sigue <b>${esc(w.next.nombre)}</b> al ${Math.round(w.next.desde * 100)}% de la temporada.
          </div>` : `<div style="font-size:11px;color:var(--text-3);margin-bottom:16px">Estás en la última etapa del arco.</div>`}

          <div class="input-group">
            <label class="input-label">Adelantar la temporada${w.preview !== null ? ' — <b>vista previa activa</b>' : ''}</label>
            <input type="range" min="0" max="100" value="${w.preview !== null ? Math.round(w.preview * 100) : w.pct}"
                   oninput="Configuracion.previewWinter(this.value)">
            <div style="font-size:10px;color:var(--text-4);margin-top:4px">
              Mueve la barra para ver cómo se pondrá la app más adelante. No cambia tu progreso real.
            </div>
          </div>

          ${_escarchasHTML(w)}

          <div style="display:flex;gap:8px;margin-top:12px">
            ${w.preview !== null ? `<button class="btn btn-secondary" style="flex:1" onclick="Configuracion.previewWinter(null)">
              ↺ Volver a la fecha real
            </button>` : ''}
            <button class="btn btn-secondary" style="flex:1" onclick="WinterArc.showStageMoment(WinterArc.stage())">
              ❄️ Ver el momento de etapa
            </button>
          </div>

          <button class="btn btn-ghost" style="width:100%;margin-top:8px;font-size:12px" onclick="Configuracion.setWinter(false)">
            Apagar el Winter Arc
          </button>
        ` : `
          <div style="font-size:12px;color:var(--text-3);margin-bottom:14px;line-height:1.6">
            Está apagado: la app se queda con el verde de siempre y las tarjetas sin escarcha.
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="Configuracion.setWinter(true)">
            ❄️ Encender el Winter Arc
          </button>
        `}
      </div>`;
  }

  // El selector de escarcha. Cada opción se pinta sobre una tarjeta de
  // verdad y con el hielo del punto de temporada que marque el
  // deslizador de arriba — así se elige viendo cómo va a quedar, no
  // adivinando por el nombre.
  function _escarchasHTML(w) {
    const esc = Utils.escapeHtml;
    const p = w.preview !== null ? w.preview : w.pct / 100;
    const real = WinterArc.frostAmountAt(p);
    // En Umbral no hay hielo todavía, y sin esto el selector sería seis
    // tarjetas en blanco idénticas: imposible elegir nada. Mientras la
    // temporada no haya empezado a congelar, las muestras se enseñan
    // como se verán en Helada, y se dice que es así.
    const anticipo = real === 0;
    const cantidad = anticipo ? 0.55 : real;
    const hielo = WinterArc.iceAt(anticipo ? 0.35 : p);
    const alto = (20 * cantidad).toFixed(1);

    const ejemplos = [
      ['Pico de cadencia', '182', 'spm'],
      ['Volumen de la semana', '22.0', 't'],
      ['Mejor recuperación', '−32', 'bpm'],
      ['Racha actual', '8', 'sem'],
      ['Sesiones totales', '51', ''],
      ['Dead hang', '45', 'seg'],
    ];

    return `
      <div style="margin-top:20px">
        <div class="input-label" style="margin-bottom:10px">Silueta de la escarcha</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${WinterArc.frosts().map((f, i) => {
            const activa = f.key === w.frost;
            const [et, val, uni] = ejemplos[i % ejemplos.length];
            return `
            <button type="button" onclick="Configuracion.setFrost('${esc(f.key)}')"
              style="all:unset;cursor:pointer;display:block;border-radius:var(--card-radius);
                     border:1px solid ${activa ? 'var(--accent)' : 'var(--border-card)'};
                     ${activa ? 'box-shadow:0 0 0 1px var(--accent)' : ''}">
              <div style="position:relative;overflow:hidden;background:var(--bg-card);
                          border-radius:var(--card-radius) var(--card-radius) 0 0;padding:14px 16px 12px">
                <div class="wa-prev" style="position:absolute;top:0;left:0;right:0;height:${alto}px;opacity:${cantidad.toFixed(2)};
                            background:${hielo};
                            -webkit-mask-image:${WinterArc.frostArt(f.key)};mask-image:${WinterArc.frostArt(f.key)};
                            -webkit-mask-size:240px 20px;mask-size:240px 20px;
                            -webkit-mask-repeat:repeat-x;mask-repeat:repeat-x"></div>
                <div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-3);margin-top:6px">${esc(et)}</div>
                <div style="font-size:22px;font-weight:800;color:var(--accent)">${esc(val)}<span style="font-size:11px;color:var(--text-3);font-weight:600;margin-left:4px">${esc(uni)}</span></div>
              </div>
              <div style="padding:9px 16px 11px;background:var(--bg-input);
                          border-radius:0 0 var(--card-radius) var(--card-radius)">
                <div style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px">
                  ${esc(f.nombre)}${activa ? '<span style="font-size:10px;color:var(--accent);font-weight:600">· elegida</span>' : ''}
                </div>
                <div style="font-size:11px;color:var(--text-3);line-height:1.5;margin-top:2px">${esc(f.nota)}</div>
              </div>
            </button>`;
          }).join('')}
        </div>
        <div style="font-size:10px;color:var(--text-4);margin-top:10px;line-height:1.6">
          ${anticipo
            ? 'En Umbral tus tarjetas todavía no llevan hielo — estas muestras se enseñan como se verán en Helada, para que puedas elegir. Mueve la barra de arriba para ver cualquier otro punto.'
            : 'Así se verán tus tarjetas en ese punto de la temporada.'}
        </div>
      </div>`;
  }

  function setFrost(key) {
    WinterArc.setFrost(key);
    Sounds.click();
    _render(document.getElementById('page-content'));
  }

  function setWinter(on) {
    WinterArc.setEnabled(on);
    Toast.success(on ? 'Winter Arc encendido ❄️' : 'Winter Arc apagado');
    _render(document.getElementById('page-content'));
  }

  // Dos velocidades, a propósito. Los colores ya cambian solos al
  // instante (son variables del documento que WinterArc reescribe), pero
  // la escarcha de las muestras vive en estilos de cada tarjeta: si se
  // esperara al repintado, el hielo iría a destiempo del color mientras
  // arrastras. Así que la escarcha se toca de inmediato, y el repintado
  // completo —que es el que trae los textos y las etapas— se hace al
  // soltar. Repintar todo en cada movimiento perdería el foco del
  // deslizador y el arrastre se sentiría roto.
  function previewWinter(v) {
    const p = v === null ? null : Number(v) / 100;
    WinterArc.setPreview(p);

    if (p !== null) {
      const cantidad = WinterArc.frostAmountAt(p);
      const hielo = WinterArc.iceAt(p);
      document.querySelectorAll('.wa-prev').forEach(el => {
        el.style.height = (20 * cantidad).toFixed(1) + 'px';
        el.style.opacity = cantidad.toFixed(2);
        el.style.background = hielo;
      });
    }

    clearTimeout(previewWinter._t);
    previewWinter._t = setTimeout(() => _render(document.getElementById('page-content')), 420);
  }

  // ── SPOTIFY ──────────────────────────────────────────────────────────

  function _spotifyPanelHTML() {
    const s = (typeof Spotify !== 'undefined') ? Spotify.status() : null;
    if (!s) return '';
    const esc = Utils.escapeHtml;

    return `
      <div class="card animate-slide-up" style="margin-top:20px">
        <div class="card-header">
          <div>
            <div class="card-title">🎧 Música de los entrenamientos</div>
            <div class="card-subtitle">Anota qué sonaba en cada momento de la sesión — en qué minuto, en qué fase, a qué velocidad</div>
          </div>
        </div>

        ${s.connected ? `
          <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">✅</span>
            <div>
              <div style="font-weight:600;font-size:13px">Conectado</div>
              <div style="font-size:11px;color:var(--text-3)">
                ${s.pending > 0
                  ? `${s.pending} canción${s.pending === 1 ? '' : 'es'} por subir a tu Sheet`
                  : 'Todo subido a tu Sheet'}
              </div>
            </div>
          </div>

          <label style="display:flex;align-items:center;gap:10px;font-size:13px;margin-bottom:14px;cursor:pointer">
            <input type="checkbox" ${s.enabled ? 'checked' : ''}
                   onchange="Configuracion.setSpotifyLogging(this.checked)">
            <span>Registrar la música durante las sesiones</span>
          </label>

          <div style="font-size:11px;color:var(--text-3);margin-bottom:12px;line-height:1.6">
            Solo pide permisos de lectura: la app no puede pausar, saltar ni modificar nada de tu cuenta.
            Lo que suena se junta en este teléfono durante la sesión y se manda a tu Sheet
            (hoja <b>MUSICA_SESION</b>) al terminar, en una sola subida. Ahí vive de verdad: sobrevive
            a reinstalar la app y se ve igual desde la compu. Con suficientes semanas, esto es lo que
            permitiría armar playlists a tu medida — tu propio historial es la única fuente posible
            desde que Spotify cerró sus recomendaciones a las apps nuevas.
          </div>

          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" style="flex:1" onclick="Configuracion.flushSpotify()">
              ☁️ Subir pendientes
            </button>
            <button class="btn btn-secondary" style="flex:1" onclick="Configuracion.disconnectSpotify()">
              Desconectar
            </button>
          </div>
        ` : `
          <div style="font-size:12px;color:var(--text-3);margin-bottom:14px;line-height:1.6">
            Al conectar, Spotify solo te va a pedir permiso para ver qué estás escuchando. Nada más —
            la app no puede controlar la reproducción ni ver tus playlists.
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="Spotify.connect()">
            🎧 Conectar Spotify
          </button>
          <div style="font-size:11px;color:var(--text-4);margin-top:12px;line-height:1.6">
            Si sale <b>INVALID_CLIENT: Invalid redirect URI</b>, en el panel de Spotify no está
            registrada exactamente esta dirección:<br>
            <code style="font-size:10px;word-break:break-all">${esc(s.redirectUri)}</code>
          </div>
        `}
      </div>`;
  }

  function setSpotifyLogging(on) {
    Spotify.setEnabled(on);
    Toast.success(on ? 'Se registrará la música de tus sesiones' : 'Registro de música desactivado');
  }

  function disconnectSpotify() {
    if (!confirm('¿Desconectar Spotify? El registro que ya tienes se conserva.')) return;
    Spotify.disconnect();
    _render(document.getElementById('page-content'));
  }

  // Lo que ya está en el Sheet se borra desde el Sheet, como cualquier
  // otro dato de la app. Esto solo empuja lo que quedó atorado en el
  // teléfono (por ejemplo, si la sesión terminó sin señal).
  async function flushSpotify() {
    const n = Spotify.pendingCount();
    if (!n) { Toast.success('No hay nada pendiente — ya está todo en tu Sheet'); return; }
    Toast.show(`Subiendo ${n} canción${n === 1 ? '' : 'es'}…`, 'info', 1500);
    const r = await Spotify.flush();
    if (r.saved > 0 || r.queued) Toast.success(r.queued ? 'Sin conexión — se subirá solo' : `${r.saved} subida${r.saved === 1 ? '' : 's'} a tu Sheet`);
    else Toast.error('No se pudo subir — se queda guardado y se reintenta al terminar tu próxima sesión');
    _render(document.getElementById('page-content'));
  }


  async function _loadCoachLog() {
    const el = document.getElementById('cfg-coach-log');
    if (!el) return;
    let rows = [];
    try { rows = (await API.getCoachLog()).rows || []; } catch(e) {}
    if (!rows.length) { el.innerHTML = 'Todavía no hay registros. Se llenan al generar un consejo (requiere el servidor actualizado y haber corrido <b>setupSheets()</b>).'; return; }
    const esc = Utils.escapeHtml;
    const icon = (r) => r.result === 'ok' ? '✅' : '❌';
    el.innerHTML = `<div style="overflow-x:auto;max-height:340px;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="text-align:left;color:var(--text-4)"><th style="padding:4px 6px">Cuándo</th><th style="padding:4px 6px">Modelo</th><th style="padding:4px 6px"></th><th style="padding:4px 6px">Causa</th><th style="padding:4px 6px;text-align:right">Seg.</th><th style="padding:4px 6px">Detalle</th></tr></thead>
      <tbody>${rows.map(r => `<tr style="border-top:1px solid var(--border)">
        <td style="padding:5px 6px;white-space:nowrap">${esc(String(r.ts || '').slice(5, 16))}</td>
        <td style="padding:5px 6px;white-space:nowrap">${esc(r.model || '')}</td>
        <td style="padding:5px 6px">${icon(r)}</td>
        <td style="padding:5px 6px">${esc(r.kind || '')}</td>
        <td style="padding:5px 6px;text-align:right">${esc(String(r.dur ?? ''))}</td>
        <td style="padding:5px 6px;color:var(--text-3);min-width:180px">${esc(String(r.detail || '').slice(0, 160))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ── QUÉ SABE LA APP Y QUÉ LE LLEGA A LA IA ───────────────────────────
  // El consejo puede ignorar un dato por tres razones muy distintas: no
  // cambió, no viene al caso hoy, o NO EXISTE. Desde afuera las tres se
  // ven igual (el consejo simplemente no lo menciona), y la tercera es la
  // única que hay que arreglar. Esto las separa.
  const _CTX_GRUPOS = [
    { estado: 'incluido',     icono: '✅', titulo: 'Le llega hoy' },
    { estado: 'presupuesto',  icono: '⏳', titulo: 'Esperando turno (no cupo en el presupuesto; entra en el siguiente consejo)' },
    { estado: 'sin_cambio',   icono: '·',  titulo: 'No se repite: no cambió desde el consejo anterior' },
    { estado: 'no_relevante', icono: '·',  titulo: 'No viene al caso hoy' },
    { estado: 'sin_datos',    icono: '⚠️', titulo: 'Sin datos todavía' },
  ];

  async function _loadContexto() {
    const el = document.getElementById('cfg-contexto');
    if (!el) return;
    let a = null;
    try { a = await API.getContextoAudit(); } catch(e) {}
    if (!a || !a.bloques || !a.bloques.length) {
      el.innerHTML = 'No se pudo revisar. Necesita el Apps Script actualizado y haber corrido <b>setupSheets()</b> (crea la hoja <b>COACH_CONTEXTO</b>).';
      return;
    }
    const esc = Utils.escapeHtml;
    const bloques = a.bloques;

    // Un bloque de nivel "siempre" sin datos es la falla que más importa:
    // el consejo sale igual de fluido, pero sin su pieza principal.
    const criticos = bloques.filter(b => b.estado === 'sin_datos' && b.nivel === 'siempre');
    const aviso = criticos.length
      ? `<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);border-radius:10px;padding:8px 10px;margin-bottom:10px;color:var(--text-2)">
           ⚠️ <b>${criticos.length} dato(s) que deberían entrar SIEMPRE no tienen información:</b>
           ${criticos.map(b => esc(b.tema)).join(', ')}. El consejo de hoy sale incompleto.
         </div>`
      : '';

    const grupos = _CTX_GRUPOS.map(g => {
      const items = bloques.filter(b => b.estado === g.estado).sort((x, y) => y.peso - x.peso);
      if (!items.length) return '';
      const chars = items.reduce((t, b) => t + (b.chars || 0), 0);
      return `<div style="margin-top:10px">
        <div style="color:var(--text-2);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em">
          ${g.icono} ${esc(g.titulo)} · ${items.length}${chars ? ` · ${chars.toLocaleString('es-MX')} car.` : ''}
        </div>
        <div style="margin-top:4px;line-height:1.6">
          ${items.map(b => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:999px;
             border:1px solid var(--border);color:var(--text-3);font-size:11px">${esc(b.tema)}${b.chars ? ` <span style="color:var(--text-4)">${b.chars}</span>` : ''}</span>`).join('')}
        </div>
      </div>`;
    }).join('');

    const pct = a.presupuesto ? Math.min(100, Math.round(a.charsVariable / a.presupuesto * 100)) : 0;
    el.innerHTML = aviso + `
      <div style="color:var(--text-2)">
        Hoy le llegan <b>${bloques.filter(b => b.estado === 'incluido').length}</b> de <b>${bloques.length}</b> datos,
        <b>${(a.chars || 0).toLocaleString('es-MX')}</b> caracteres de contexto.
      </div>
      <div style="margin-top:6px">
        <div style="height:5px;border-radius:3px;background:var(--border);overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--accent)"></div>
        </div>
        <div style="color:var(--text-4);font-size:11px;margin-top:3px">
          Presupuesto de la parte variable: ${(a.charsVariable || 0).toLocaleString('es-MX')} de ${(a.presupuesto || 0).toLocaleString('es-MX')} caracteres.
          Lo que decide seguridad (carga, sobrecarga, forma, qué tan listo estás) va aparte y nunca se recorta.
        </div>
      </div>` + grupos;
  }

  // ¿El Apps Script publicado está al día, y al Sheet no le falta ninguna
  // columna? Antes no había forma de saberlo desde la app.
  async function _loadVersion() {
    const el = document.getElementById('cfg-version');
    if (!el) return;
    let res = null;
    try { res = await API.getVersion(); } catch(e) {}
    if (!res || !res.version) {
      el.innerHTML = '⚠️ El servidor no reporta versión: el Apps Script publicado es anterior a esta actualización (o no hay conexión). Vuelve a desplegarlo.';
      return;
    }
    const expected = CONFIG.EXPECTED_BACKEND_VERSION;
    const verLine = res.version === expected || res.version === 'mock'
      ? `✅ Servidor al día (${Utils.escapeHtml(res.version)})`
      : `⚠️ El Apps Script publicado es <b>${Utils.escapeHtml(res.version)}</b> y la app espera <b>${Utils.escapeHtml(expected)}</b> — vuelve a desplegarlo.`;
    const issues = res.schemaIssues || [];
    const issueLine = issues.length
      ? `<br>⚠️ A tu Sheet le faltan columnas — corre <b>setupSheets()</b> en Apps Script:<br>` + issues.map(i => `• ${Utils.escapeHtml(i.sheet)}: ${Utils.escapeHtml(i.problem)}`).join('<br>')
      : '<br>✅ Columnas del Sheet completas';
    // Si el servidor no reporta archivos (versión vieja), no se afirma nada: la línea de versión ya avisa.
    const dep = res.deployIssues;
    const deployLine = dep === undefined ? '' : dep.length
      ? `<br>⚠️ <b>Al Apps Script publicado le falta o tiene desactualizado:</b><br>` + dep.map(d => `• <b>${Utils.escapeHtml(d.file)}</b> — le faltan ${d.missing.length} función(es), p. ej. ${Utils.escapeHtml(d.missing.slice(0, 2).join(', '))}`).join('<br>') + `<br><span style="color:var(--text-4)">Vuelve a pegar ese archivo completo, guarda y publica una nueva versión. Puedes revisar también con <b>verificarDespliegue()</b> en el editor.</span>`
      : '<br>✅ Todos los archivos del Apps Script están completos';
    // Un modelo de Gemini redirigido en la cadena no falla: simplemente
    // deja de ser un respaldo de verdad, porque comparte cuota con el
    // modelo al que redirige. Eso no se nota hasta que un día el consejo
    // no sale. Si el servidor es viejo y no reporta el campo, no se
    // afirma nada (la línea de versión ya avisa).
    const gem = res.geminiIssues;
    const gemLine = gem === undefined ? '' : gem.length
      ? `<br>⚠️ <b>Modelos de Gemini que Google ya redirige:</b><br>` + gem.map(g =>
          `• <b>${Utils.escapeHtml(g.model)}</b> → ${Utils.escapeHtml(g.replacement)}` +
          (g.duplicate
            ? ` — y <b>${Utils.escapeHtml(g.replacement)}</b> ya está en tu cadena: ese reintento comparte la misma cuota, así que no te sirve de respaldo.`
            : ` — cámbialo por ${Utils.escapeHtml(g.replacement)}.`)
        ).join('<br>') + `<br><span style="color:var(--text-4)">Se ajusta en Apps Script → Configuración del proyecto → Propiedades del script → <b>GEMINI_MODELS</b>. Si no tienes esa propiedad, basta con pegar el <b>06_CoachIA.gs</b> actualizado.</span>`
      : '';
    el.innerHTML = verLine + issueLine + deployLine + gemLine;
  }

  // ── MOVIMIENTO Y DISEÑO ──────────────────────────────────────────
  // Controla Motion (js/motion.js): duraciones, personalidad de la
  // curva, intensidad del vidrio y redondez de tarjetas. Cada control
  // llama su setter de Motion directo — ese ya aplica el cambio Y lo
  // guarda en localStorage, aquí solo se arma la interfaz.
  // Se guarda por dispositivo, no viaja entre celular y compu — así
  // se decidió a propósito, para mantenerlo simple.

  const _DURATION_ROWS = [
    { key: 'fast',    label: 'Toques y respuestas rápidas', min: 80,  max: 300 },
    { key: 'base',    label: 'Transiciones generales',      min: 100, max: 500 },
    { key: 'slow',    label: 'Cambios más notorios',        min: 200, max: 800 },
    { key: 'spring',  label: 'Rebote al soltar botones',    min: 250, max: 900 },
    { key: 'premium', label: 'Cambio de pantalla',          min: 150, max: 500 },
    { key: 'stagger', label: 'Cascada de tarjetas al cargar', min: 300, max: 900 },
  ];

  const _MOTION_PRESETS = {
    ios:      { fittrackerFast: '0.4, 0, 0.2, 1',    fittrackerSpring: '0.34, 1.56, 0.64, 1', fittrackerPremium: '0.16, 1, 0.3, 1' },
    material: { fittrackerFast: '0.4, 0, 0.2, 1',    fittrackerSpring: '0.25, 0.46, 0.45, 0.94', fittrackerPremium: '0.25, 0.46, 0.45, 0.94' },
    sharp:    { fittrackerFast: '0.2, 0, 0, 1',      fittrackerSpring: '0.2, 0, 0, 1',         fittrackerPremium: '0.2, 0, 0, 1' },
  };
  const _PRESET_LABELS = { ios: 'iOS (con rebote)', material: 'Suave (sin rebote)', sharp: 'Directo' };

  // Detecta qué preset coincide con las curvas actuales, para resaltar
  // el botón correcto — si el usuario ya jugó con esto antes y volvió
  // a entrar, no debe verse como si ninguno estuviera activo.
  function _currentPreset(eases) {
    for (const [name, curves] of Object.entries(_MOTION_PRESETS)) {
      if (curves.fittrackerFast === eases.fittrackerFast && curves.fittrackerSpring === eases.fittrackerSpring) return name;
    }
    return null; // el usuario movió algo a mano — ningún preset calza exacto, y está bien
  }

  function _motionPanelHTML() {
    const s = Motion.getSettings();
    const activePreset = _currentPreset(s.eases);
    const glassPct = Math.round(s.glassIntensity * 100);

    return `
        <div class="card animate-slide-up" style="margin-top:20px">
          <div class="card-header">
            <div>
              <div class="card-title">🎬 Movimiento y diseño</div>
              <div class="card-subtitle">Cada cambio se aplica al momento — pruébalo en cualquier pantalla después de ajustar</div>
            </div>
          </div>

          <div class="input-group">
            <label class="input-label">Personalidad del movimiento</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              ${Object.keys(_MOTION_PRESETS).map(name => `
                <button class="btn ${activePreset === name ? 'btn-primary' : 'btn-secondary'} btn-sm"
                  onclick="Configuracion.setMotionPreset('${name}')">${_PRESET_LABELS[name]}</button>
              `).join('')}
            </div>
          </div>

          <div style="margin-top:18px;display:flex;flex-direction:column;gap:14px">
            ${_DURATION_ROWS.map(row => {
              const ms = Math.round(s.durations[row.key] * 1000);
              return `
              <div class="input-group">
                <label class="input-label">${row.label} <span id="cfg-dur-${row.key}-val" style="color:var(--text-3)">${ms}ms</span></label>
                <input type="range" min="${row.min}" max="${row.max}" step="10" value="${ms}"
                  oninput="Configuracion.setMotionDuration('${row.key}', this.value)">
              </div>`;
            }).join('')}
          </div>

          <div class="input-group" style="margin-top:18px">
            <label class="input-label">Intensidad del vidrio <span id="cfg-glass-val" style="color:var(--text-3)">${glassPct}%</span></label>
            <input type="range" min="30" max="200" step="5" value="${glassPct}" oninput="Configuracion.setGlassIntensity(this.value)">
          </div>

          <div class="input-group" style="margin-top:14px">
            <label class="input-label">Redondez de tarjetas <span id="cfg-radius-val" style="color:var(--text-3)">${s.cardRadius}px</span></label>
            <input type="range" min="4" max="32" step="1" value="${s.cardRadius}" oninput="Configuracion.setCardRadius(this.value)">
          </div>

          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:18px" onclick="Configuracion.resetMotion()">
            ↺ Restablecer movimiento y diseño
          </button>
        </div>`;
  }

  // Arrastrar el slider dispara oninput muchas veces por segundo — se
  // actualiza solo el numerito de al lado por DOM directo, sin volver
  // a renderizar todo el panel (eso perdería el foco del slider a
  // media arrastrada y se sentiría trabado).
  function setMotionDuration(key, ms) {
    Motion.setDuration(key, Number(ms) / 1000);
    const el = document.getElementById(`cfg-dur-${key}-val`);
    if (el) el.textContent = `${ms}ms`;
  }
  function setGlassIntensity(pct) {
    Motion.setGlassIntensity(Number(pct) / 100);
    const el = document.getElementById('cfg-glass-val');
    if (el) el.textContent = `${pct}%`;
  }
  function setCardRadius(px) {
    Motion.setCardRadius(Number(px));
    const el = document.getElementById('cfg-radius-val');
    if (el) el.textContent = `${px}px`;
  }
  // Elegir un preset SÍ vuelve a pintar el panel completo — es una
  // acción discreta (un tap, no un arrastre), y así el botón activo
  // se resalta correctamente.
  function setMotionPreset(name) {
    const curves = _MOTION_PRESETS[name];
    if (!curves) return;
    Sounds.click();
    Object.entries(curves).forEach(([easeName, bezier]) => Motion.setEase(easeName, bezier));
    _render(document.getElementById('page-content'));
  }
  function resetMotion() {
    if (!confirm('¿Restablecer movimiento y diseño a los valores originales de la app?')) return;
    Sounds.click();
    Motion.resetSettings();
    _render(document.getElementById('page-content'));
    Toast.success('Restablecido');
  }

  // Nominatim (OpenStreetMap) — geocoding gratis, sin API key. Se
  // llama directo desde el navegador (no hace falta pasar por Apps
  // Script para esto). Solo se GUARDA cuando Diego confirma el
  // resultado — así si el nombre de la ciudad es ambiguo, no se
  // guarda el lugar equivocado sin que lo revise.
  async function geocode() {
    const query = document.getElementById('cfg-city-input')?.value?.trim();
    if (!query) return;
    Sounds.click();

    const resultDiv = document.getElementById('cfg-geocode-result');
    resultDiv.innerHTML = `<div style="font-size:12px;color:var(--text-3);margin-top:12px">Buscando...</div>`;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const data = await res.json();

      if (!data.length) {
        resultDiv.innerHTML = `<div style="font-size:12px;color:var(--danger);margin-top:12px">No se encontró esa ciudad — prueba con un nombre más específico (ej. agrega el país).</div>`;
        return;
      }

      _geocodeResult = { name: data[0].display_name, lat: Number(data[0].lat), lng: Number(data[0].lon) };
      resultDiv.innerHTML = `
        <div style="background:var(--accent-glow);border:1px solid var(--border-accent);border-radius:10px;padding:12px 14px;margin-top:12px">
          <div style="font-size:12px;color:var(--text-2);margin-bottom:8px">¿Es este el lugar correcto?</div>
          <div style="font-weight:600;font-size:13px;margin-bottom:10px">${_geocodeResult.name}</div>
          <button class="btn btn-primary btn-sm" style="width:100%" onclick="Configuracion.confirmSave()">✓ Sí, guardar esta ciudad</button>
        </div>`;
    } catch(e) {
      resultDiv.innerHTML = `<div style="font-size:12px;color:var(--danger);margin-top:12px">No se pudo buscar — revisa tu conexión e intenta de nuevo.</div>`;
    }
  }

  async function confirmSave() {
    if (!_geocodeResult) return;
    Sounds.click();
    try {
      await API.saveHomeCity({ cityName: _geocodeResult.name, lat: _geocodeResult.lat, lng: _geocodeResult.lng });
      API.clearCache();
      Router.invalidateAll();
      Toast.success('Ciudad guardada');
      const container = document.getElementById('page-content');
      await init(container);
    } catch(e) {
      Toast.warning('No se pudo guardar — intenta de nuevo');
    }
  }

  // Escape manual — ver el comentario en OfflineQueue.clearAll()
  // (offline.js). Confirma primero mostrando cuántos elementos hay,
  // porque esto SÍ puede perder una sesión que aún no se subió.
  function clearLocalData() {
    const n = typeof OfflineQueue !== 'undefined' ? OfflineQueue.count() : 0;
    const msg = n > 0
      ? `Hay ${n} elemento${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'} localmente que todavía no se ha${n === 1 ? '' : 'n'} subido. Si los borras, se pierden para siempre. ¿Continuar?`
      : 'No hay nada pendiente, pero esto de todas formas limpia cualquier dato guardado localmente. ¿Continuar?';
    if (!confirm(msg)) return;

    Sounds.click();
    if (typeof OfflineQueue !== 'undefined') OfflineQueue.clearAll();
    Toast.success('Datos locales borrados');
    _render(document.getElementById('page-content'));
  }

  return {
    init, geocode, confirmSave, clearLocalData,
    setMotionDuration, setGlassIntensity, setCardRadius, setMotionPreset, resetMotion,
    setSpotifyLogging, disconnectSpotify, flushSpotify,
    setWinter, previewWinter, setFrost,
  };
})();

function initConfiguracion(container) { Configuracion.init(container); }
