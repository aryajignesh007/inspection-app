'use strict';
/* v1.8.0-pf39 "Keep portal list & merge duplicate ULNs" (Surat and Valsad alike – works on THIS district's database only).
   (1) Same ULN on two records → one record (portal copy kept, empty fields filled from the other, other name → aka);
       inspections / visits of the removed copy are moved to the kept record. Different ULNs of one company are never merged.
   (2) e-Prohibition is the authority for ULN deduplication; in-district non-portal history is kept (pf42).
       Non-portal licensees linked to an inspection are KEPT. Inspections, diary days and figures are never deleted.
   Deletes go through DB.del → Drive-sync tombstones, so other phones are cleaned too. A safety backup is made first. */
const PM = {
  FLAG: 'cleanup.portalMerge.v1',
  isPortal: s => /e-Prohibition/i.test(String(s || '')),
  licPortal(l, x) { return PM.isPortal(x?.source) || PM.isPortal(l?.importedFrom) || PM.isPortal(l?.source); },
  lPortal(l) { return PM.isPortal(l?.importedFrom) || PM.isPortal(l?.source) || (l?.licences || []).some(x => PM.isPortal(x.source)); },
  uln: x => String(x?.uln || x?.licenceNo || '').toUpperCase().replace(/\s+/g, ''),
  empty: v => v == null || v === '' || (Array.isArray(v) && !v.length),
  fill(dst, src, skip = []) { for (const [k, v] of Object.entries(src || {})) if (!skip.includes(k) && !k.startsWith('_') && !PM.empty(v) && PM.empty(dst[k])) dst[k] = Array.isArray(v) ? [...v] : v; },
  /** pure planner (no DB) – also used by tests. Returns new licensee records, ids to delete, id remap. */
  plan(lics, ins = [], vis = []) {
    lics = lics.map(l => JSON.parse(JSON.stringify(l)));
    const byId = new Map(lics.map(l => [l.id, l])), par = new Map(lics.map(l => [l.id, l.id]));
    const find = a => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
    const owner = {};
    for (const l of lics) for (const x of l.licences || []) { const u = PM.uln(x); if (!u) continue; if (owner[u] && owner[u] !== l.id) par.set(find(l.id), find(owner[u])); else owner[u] = l.id; }
    const nIns = {}; ins.forEach(i => { if (i.licenseeId) nIns[i.licenseeId] = (nIns[i.licenseeId] || 0) + 1; });
    const groups = {}; lics.forEach(l => (groups[find(l.id)] ||= []).push(l));
    const remap = {}, del = new Set(), changed = new Set(); let dupLicences = 0;
    for (const g of Object.values(groups)) {
      if (g.length < 2) continue;
      g.sort((a, b) => (PM.lPortal(b) - PM.lPortal(a)) || ((nIns[b.id] || 0) - (nIns[a.id] || 0)) || (Object.keys(b).length - Object.keys(a).length));
      const keep = g[0];
      for (const d of g.slice(1)) {
        PM.fill(keep, d, ['id', 'licences', 'aka', 'name', 'importedFrom', 'source']);
        if (!keep.importedFrom && d.importedFrom) keep.importedFrom = d.importedFrom; if (!keep.source && d.source) keep.source = d.source;
        if (PM.lPortal(d) && !PM.lPortal(keep)) keep.importedFrom = 'e-Prohibition';
        const names = [d.name, ...(d.aka || [])].filter(n => n && n.trim().toLowerCase() !== String(keep.name || '').trim().toLowerCase());
        if (names.length) keep.aka = [...new Set([...(keep.aka || []), ...names])];
        keep.licences = [...(keep.licences || []), ...(d.licences || []).map(x => ({ ...x, _from: PM.lPortal(d) }))];
        remap[d.id] = keep.id; del.add(d.id);
      }
      changed.add(keep.id);
    }
    // licence rows with the same ULN inside one record → one row (portal-tagged preferred)
    for (const l of lics) {
      if (del.has(l.id)) continue; const seen = new Map(), out = [];
      for (const x of l.licences || []) {
        const u = PM.uln(x), fromP = x._from; delete x._from; if (!u) { out.push(x); continue; }
        const prev = seen.get(u);
        if (!prev) { seen.set(u, x); out.push(x); continue; }
        dupLicences++; changed.add(l.id);
        const pp = PM.isPortal(prev.source), xp = PM.isPortal(x.source);
        if (xp && !pp) { const i = out.indexOf(prev); PM.fill(x, prev); out[i] = x; seen.set(u, x); } else PM.fill(prev, x);
        if (fromP) l.importedFrom ||= 'e-Prohibition';
      }
      if (l.licences) l.licences = out;
    }
    // portal-authority: unused non-portal licensees go
    const target = id => remap[id] || id;
    const used = new Set(), insUln = new Set();
    ins.forEach(i => { if (i.licenseeId) used.add(target(i.licenseeId)); for (const k of [i.uln, i.licenceNo]) if (k) insUln.add(PM.uln({ uln: k })); });
    vis.forEach(v => [...(v.licIds || []), ...(v.doneLics || [])].forEach(x => used.add(target(x))));
    const kept = lics.filter(l => !del.has(l.id)), anyPortal = kept.some(PM.lPortal);
    const removeIds = [], keptNonPortal = [];
    for (const l of kept) {
      if (PM.lPortal(l)) continue;
      const linked = used.has(l.id) || (l.licences || []).some(x => PM.uln(x) && insUln.has(PM.uln(x)));
      keptNonPortal.push(l); // pf42: missing portal provenance is never authority to delete local history.   // never empty a list that was never imported from the portal
    }
    return { put: kept.filter(l => changed.has(l.id) && !removeIds.includes(l.id)), merged: [...del], remap, removeIds, keptNonPortal, dupLicences, anyPortal,
      dupUlns: Object.values(groups).filter(g => g.length > 1).length };
  },
  async preview() { return PM.plan(await DB.all('licensees'), await DB.all('inspections'), await DB.all('visits')); },
  async run(reason = 'portal-merge') {
    const p = await PM.preview();
    if (!p.merged.length && !p.removeIds.length && !p.put.length) return { ...p, done: 0 };
    const saf = await BK.safety(reason); // Refuse destructive merge when safety backup fails.
    if (p.put.length) await DB.putMany('licensees', p.put);
    const t = id => p.remap[id] || id;
    for (const i of await DB.all('inspections')) if (p.remap[i.licenseeId]) await DB.put('inspections', { ...i, licenseeId: t(i.licenseeId) });
    for (const v of await DB.all('visits')) {
      const f = a => a && [...new Set(a.map(t))];
      if ([...(v.licIds || []), ...(v.doneLics || [])].some(x => p.remap[x])) await DB.put('visits', { ...v, licIds: f(v.licIds) || v.licIds, doneLics: f(v.doneLics) || v.doneLics });
    }
    for (const id of [...p.merged, ...p.removeIds]) await DB.del('licensees', id);
    await DB.setSetting('cleanup.portalMerge.last', { at: new Date().toISOString(), reason, merged: p.merged.length, removed: p.removeIds.length, kept: p.keptNonPortal.length });
    if (typeof SY !== 'undefined') SY.schedule && SY.schedule(2000);
    return { ...p, done: 1, safety: saf };
  },
  /** once per district after upgrade (website PWA refresh or Android r6); waits until licensees exist */
  async autoOnce() {
    if (await DB.getSetting(PM.FLAG, null)) return null;
    const lics = await DB.all('licensees'); if (!lics.length) return null;
    try { if (typeof SY !== 'undefined') await SY.auto('pre-cleanup'); } catch (e) {}   // pull other phones' inspections first, so links are known
    const r = await PM.run('auto-portal-merge');
    await DB.setSetting(PM.FLAG, { at: new Date().toISOString(), merged: r.merged.length, removed: r.removeIds.length, kept: r.keptNonPortal.length, anyPortal: r.anyPortal });
    if (r.done) toast(`${DIST.info.en}: ${r.merged.length + r.dupLicences} duplicate(s) merged, ${r.removeIds.length} unused non-portal removed, ${r.keptNonPortal.length} inspection-linked kept`);
    return r;
  },
  summary: p => `${p.dupUlns} duplicate ULN group(s) → ${p.merged.length} extra record(s) merged${p.dupLicences ? ` + ${p.dupLicences} repeated licence row(s)` : ''} · ${p.removeIds.length} non-portal licensee(s) with no inspection removed · ${p.keptNonPortal.length} non-portal kept (local history preserved)`,
  async ask(btn) {
    const p = await PM.preview();
    if (!p.merged.length && !p.removeIds.length && !p.dupLicences) return toast('Nothing to merge – list already matches e-Prohibition');
    if (!p.anyPortal) toast('No e-Prohibition import found yet – only duplicates are merged. Import the portal list first.');
    if (!confirm(`Keep ${DIST.info.en} e-Prohibition list & merge duplicate ULNs?\n\n${PM.summary(p)}\n\nInspections, diary days and figures are NOT deleted. A safety backup is made first.`)) return;
    const r = await PM.run('portal-merge'); toast('Done: ' + PM.summary(r)); if (typeof router === 'function') router();
  },
  button: () => `<button class="btn sec block" onclick="busy(this, () => PM.ask(this))">🔗 Keep portal list &amp; merge duplicate ULNs</button>`
};
