'use strict';
/* pf42: district-private licence, inspection and visit stores are never read for another district's calendar.
   Only saved tour-day rows are shared, through TJ.reconcile(). _open remains the days-only transport. */
const XD = {
  others() { return Object.values(DISTRICTS).filter(d => d.key !== DIST.key); },
  async _open(name) {
    try { if (indexedDB.databases) { const l = await indexedDB.databases(); if (!l.some(d => d.name === name)) return null; } } catch (e) { }
    return new Promise(ok => {
      let r; try { r = indexedDB.open(name); } catch (e) { return ok(null); }
      r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (e) { } };   // did not exist – do not create it
      r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); r.onblocked = () => ok(null);
    });
  },
  async _all(db, store) {
    if (!db.objectStoreNames.contains(store)) return [];
    return new Promise(ok => { const q = db.transaction(store, 'readonly').objectStore(store).getAll(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); });
  },
  _cache: null,
  async load() { return []; }, // Open the other district to see its companies and inspection records.
  async inRange(from, to) { return (await XD.load()).filter(x => x.date >= from && x.date <= to); },
  html(list) {
    if (!list.length) return '';
    return `<div class="card"><h3>Other district on this day <small class="gu">બીજા જિલ્લાની તપાસણી</small></h3><div class="muted">Read-only – open that district to edit.</div><ul class="list">${list.map(x => `<li><div class="main"><div class="t">${esc(x.name)}</div><div class="s">${x.kind === 'insp' ? 'Inspection' : 'Planned visit'}${x.typeCode ? ' · ' + esc(x.typeCode) : ''}${x.reportNo ? ' · ' + esc(x.reportNo) : ''}${x.area ? ' · ' + esc(x.area) : ''}${x.time ? ' · ' + esc(x.time) : ''}</div></div><span class="pill xd">${esc(x.dEn)}</span>${x.violation ? '<span class="pill bad">violation</span>' : ''}</li>`).join('')}</ul></div>`;
  }
};
if (typeof module !== 'undefined') module.exports = { XD };
