'use strict';
/* v1.7.5 Shared calendar across districts (read-only).
   Each district keeps its own database (v1.7.0). On a phone that has both districts (Sir's phone), the Diary of one district
   also shows the inspections and planned visits of the other district, labelled with the district name. Nothing is copied
   or written into the other district – it is only read, so the two districts' data stay separate. */
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
  async load() {
    if (XD._cache && Date.now() - XD._cache.at < 15000 && XD._cache.k === DIST.key) return XD._cache.items;
    const items = [];
    for (const d of XD.others()) {
      const db = await XD._open(d.db); if (!db) continue;
      try {
        const lics = await XD._all(db, 'licensees'), lm = {}; lics.forEach(l => lm[l.id] = l);
        for (const i of await XD._all(db, 'inspections')) if (i.date) items.push({ kind: 'insp', district: d.key, dEn: d.en, dGu: d.gu, date: i.date, time: i.time || '', name: lm[i.licenseeId]?.name || '-', area: lm[i.licenseeId]?.area || i.to || '', typeCode: i.typeCode || '', reportNo: i.reportNo || '', violation: /^y/i.test(i.violations || '') });
        for (const v of await XD._all(db, 'visits')) if (v.date && (v.status || 'planned') === 'planned') items.push({ kind: 'visit', district: d.key, dEn: d.en, dGu: d.gu, date: v.date, time: v.time || '', name: (v.licIds || []).map(id => lm[id]?.name).filter(Boolean).join(', ') || v.title || v.purpose || 'Planned visit', area: v.place || '', typeCode: '', reportNo: '' });
      } finally { try { db.close(); } catch (e) { } }
    }
    XD._cache = { at: Date.now(), k: DIST.key, items };
    return items;
  },
  async inRange(from, to) { return (await XD.load()).filter(x => x.date >= from && x.date <= to); },
  html(list) {
    if (!list.length) return '';
    return `<div class="card"><h3>Other district on this day <small class="gu">બીજા જિલ્લાની તપાસણી</small></h3><div class="muted">Read-only – open that district to edit.</div><ul class="list">${list.map(x => `<li><div class="main"><div class="t">${esc(x.name)}</div><div class="s">${x.kind === 'insp' ? 'Inspection' : 'Planned visit'}${x.typeCode ? ' · ' + esc(x.typeCode) : ''}${x.reportNo ? ' · ' + esc(x.reportNo) : ''}${x.area ? ' · ' + esc(x.area) : ''}${x.time ? ' · ' + esc(x.time) : ''}</div></div><span class="pill xd">${esc(x.dEn)}</span>${x.violation ? '<span class="pill bad">violation</span>' : ''}</li>`).join('')}</ul></div>`;
  }
};
if (typeof module !== 'undefined') module.exports = { XD };
