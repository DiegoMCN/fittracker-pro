// ═══════════════════════════════════════════
// OFFLINE QUEUE — Cola de escrituras pendientes
// Si un guardado (POST) falla por falta de conexión, se encola aquí
// en vez de fingir éxito. Se sincroniza sola cuando vuelve el internet.
// ═══════════════════════════════════════════

const OfflineQueue = (() => {
  const KEY = 'ft_offline_queue';

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
  function remove(id) { _set(_get().filter(x => x.id !== id)); _updateBadge(); }

  // Intenta enviar todo lo pendiente. No usa la cola de retry normal de
  // API — un solo intento directo por item, para no duplicar lógica.
  async function flush() {
    const arr = _get();
    if (arr.length === 0) return { synced: 0, failed: 0 };

    let synced = 0, failed = 0;
    for (const item of arr) {
      try {
        await API.rawPost(item.params);
        remove(item.id);
        synced++;
      } catch(e) {
        failed++;
      }
    }
    if (synced > 0) API.clearCache();
    _updateBadge();
    return { synced, failed };
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

  return { add, list, count, remove, flush, updateBadge: _updateBadge };
})();

// ── AUTO-SYNC ──────────────────────────────────────────────────────────
window.addEventListener('online', async () => {
  OfflineQueue.updateBadge();
  const res = await OfflineQueue.flush();
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
  if (navigator.onLine) OfflineQueue.flush();
});
