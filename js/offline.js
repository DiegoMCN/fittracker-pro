// ═══════════════════════════════════════════
// OFFLINE QUEUE — Cola de escrituras pendientes
// Si un guardado (POST) falla por falta de conexión, se encola aquí
// en vez de fingir éxito. Se sincroniza sola cuando vuelve el internet.
// ═══════════════════════════════════════════

const OfflineQueue = (() => {
  const KEY = 'ft_offline_queue';
  let _flushing = false; // evita que 'online' y DOMContentLoaded corran flush() en paralelo y suban el mismo registro dos veces

  function _get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch(e) { return []; }
  }
  function _set(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch(e) {}
  }

  function add(params) {
    const arr = _get();
    arr.push({ id: Utils.uid(), params, ts: Date.now() });
    _set(arr);
    _updateBadge();
    return arr.length;
  }

  function list()  { return _get(); }
  function count() { return _get().length; }

  // Botón manual de "borrar datos locales" en Configuración — un
  // escape a mano por si algo se queda atorado en la cola y el
  // candado del backend (Timestamp único, ver saveSession/saveCardio)
  // no aplica por algún motivo que no anticipamos. Se pierde
  // cualquier sesión guardada localmente que aún no se haya
  // subido — por eso Configuración pide confirmación antes de llamar
  // esto, mostrando cuántas hay pendientes.
  function clearAll() {
    _set([]);
    _updateBadge();
  }
  function remove(id) { _set(_get().filter(x => x.id !== id)); _updateBadge(); }

  // Intenta enviar todo lo pendiente. No usa la cola de retry normal de
  // API — un solo intento directo por item, para no duplicar lógica.
  async function flush() {
    if (_flushing) return { synced: 0, failed: 0 }; // ya hay un flush corriendo, no dupliques el envío
    const arr = _get();
    if (arr.length === 0) return { synced: 0, failed: 0 };

    _flushing = true;
    let synced = 0, failed = 0;
    // ESTE era el agujero por el que se perdían los festejos: la
    // respuesta de cada reenvío se tiraba a la basura, y adentro venían
    // los logros que el backend acababa de otorgar. El Sheet quedaba
    // correcto (por eso sí aparecían en la lista de logros) pero la
    // celebración nunca se disparaba, porque nadie leyó esa respuesta.
    const logros = [];
    try {
      for (const item of arr) {
        try {
          const res = await API.rawPost(item.params);
          if (res && Array.isArray(res.newAchievements)) logros.push(...res.newAchievements);
          if (res && res.achievementsError) {
            console.error('[Logros] el servidor falló al revisarlos:', res.achievementsError);
          }
          remove(item.id);
          synced++;
        } catch(e) {
          failed++;
        }
      }
    } finally {
      _flushing = false;
    }
    if (synced > 0) API.clearCache();
    _updateBadge();
    return { synced, failed, newAchievements: logros };
  }

  function _updateBadge() {
    const el = document.getElementById('offline-queue-badge');
    const dot = document.getElementById('connectivity-dot');
    if (!el) return;
    const n = count();
    el.style.display = n > 0 ? 'flex' : 'none';
    el.textContent = n;
    if (dot) {
      dot.style.background = n > 0 ? 'var(--warning)' : (navigator.onLine ? 'var(--accent)' : 'var(--danger)');
      dot.title = n > 0 ? `${n} pendiente(s) de sincronizar` : (navigator.onLine ? 'Conectado' : 'Sin conexión');
    }
  }

  return { add, list, count, remove, flush, clearAll, updateBadge: _updateBadge };
})();

// ── AUTO-SYNC ──────────────────────────────────────────────────────────
// Los logros que vinieron en los reenvíos se festejan igual que si la
// sesión se hubiera guardado al primer intento — con un respiro, para
// que no caigan encima del aviso de sincronización.
function _celebrarPendientes(res) {
  if (!res || !res.newAchievements || !res.newAchievements.length) return;
  if (typeof RecordCelebration === 'undefined') return;
  setTimeout(() => RecordCelebration.checkNewAchievements(res.newAchievements), 900);
}

window.addEventListener('online', async () => {
  OfflineQueue.updateBadge();
  const res = await OfflineQueue.flush();
  _celebrarPendientes(res);
  if (res.synced > 0) {
    Toast.success(`${res.synced} registro(s) sincronizado(s) con tu Sheet 🎉`);
    // Si estamos viendo una página con datos, refresca la vista
    const page = Router.current();
    if (['dashboard','history','plan','metrics'].includes(page)) {
      Router.navigate('dashboard');
      setTimeout(() => Router.navigate(page), 50);
    }
  }
});

window.addEventListener('offline', () => {
  OfflineQueue.updateBadge();
  Toast.warning('Sin conexión — tus registros se guardarán localmente y se sincronizarán después');
});

document.addEventListener('DOMContentLoaded', () => {
  OfflineQueue.updateBadge();
  // Al abrir la app también: si la sesión de ayer se quedó en la cola,
  // es AQUÍ donde se sube — y donde se debía el festejo.
  if (navigator.onLine) OfflineQueue.flush().then(_celebrarPendientes);
});
