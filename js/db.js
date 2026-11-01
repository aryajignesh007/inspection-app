'use strict';
/* Tiny IndexedDB wrapper. All data stays on this phone. */
const DB = (() => {
  const NAME = (typeof DIST !== 'undefined' ? DIST.info.db : 'batti-mobile'), VER = 6;   // v6 (app 1.7.2): 'photos' (local only)
    // v5 (app 1.7.0): dashboard + team stores; per-district database name (Surat = original name)   // v2 (app 1.1.0): adds 'visits' store; existing data untouched
  const STORES = { settings: 'key', licensees: 'id', inspections: 'id', days: 'date', diaries: 'ym', templates: 'code', licenceTypes: 'code', visits: 'id', tombstones: 'k', keywords: 'id', reminders: 'id', meetings: 'id', offices: 'id', pendency: 'id', staff: 'id', messages: 'id', receipts: 'id', teamdata: 'id', photos: 'id' };   // v4 (app 1.6.0): 'keywords'   // v3 (app 1.5.0): 'tombstones' for Drive sync deletes
  let dbp;
  function open() {
    return dbp ||= new Promise((ok, no) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => { const d = r.result; for (const [s, k] of Object.entries(STORES)) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: k }); };
      r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
    });
  }
  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((ok, no) => {
      const t = d.transaction(store, mode), s = t.objectStore(store); let res;
      Promise.resolve(fn(s)).then(v => res = v);
      t.oncomplete = () => ok(res); t.onerror = () => no(t.error); t.onabort = () => no(t.error);
    });
  }
  const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  return {
    STORES,
    all: s => tx(s, 'readonly', st => req(st.getAll())),
    get: (s, k) => tx(s, 'readonly', st => req(st.get(k))),
    put: (s, v) => tx(s, 'readwrite', st => { st.put(v); }),
    putMany: (s, arr) => tx(s, 'readwrite', st => { arr.forEach(v => st.put(v)); }),
    del: (s, k) => tx(s, 'readwrite', st => { st.delete(k); }),
    clear: s => tx(s, 'readwrite', st => { st.clear(); }),
    async getSetting(k, def) { const r = await this.get('settings', k); return r ? r.value : def; },
    setSetting(k, v) { return this.put('settings', { key: k, value: v }); },
    async dump() { const o = {}; for (const s of Object.keys(STORES)) if (s !== 'photos') o[s] = await this.all(s); return o; },
    async persist() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; } }
  };
})();
