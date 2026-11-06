'use strict';
/* v1.7.4 "Clean district data": find licensees of the OTHER district that got into this one (e.g. a Surat backup restored while in Valsad),
   preview with ticks, automatic backup, delete only in THIS district's database (deletes become Drive-sync tombstones), Undo. */
const DC = {
  WORDS: {
    surat: ['surat', 'choryasi', 'chorasi', 'chorayasi', 'olpad', 'kamrej', 'palsana', 'bardoli', 'mahuva', 'mandvi', 'mangrol', 'umarpada', 'sachin', 'hazira', 'pandesara', 'udhna', 'katargam', 'varachha', 'limbayat', 'kosamba', 'kadodara', 'ichhapor', 'kim'],
    valsad: ['valsad', 'pardi', 'vapi', 'umbergaon', 'umargam', 'umbergam', 'dharampur', 'kaprada', 'sarigam', 'bhilad', 'atul', 'killa pardi']
  },
  LIC: { surat: /\b(SUR|SRT|SURAT)\b/i, valsad: /\b(VAL|VLS|VALSAD)\b/i },
  text(l) { const parts = []; const walk = (v, d) => { if (d > 3 || v == null) return; if (typeof v === 'string') parts.push(v); else if (Array.isArray(v)) v.forEach(x => walk(x, d + 1)); else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!/^(_|id$|name$|aka$|photos?)/.test(k)) walk(x, d + 1); };
    walk(l, 0); return parts.join(' ').toLowerCase(); },
  hits(txt, d) { return DC.WORDS[d].filter(w => new RegExp('(^|[^a-z])' + w + '([^a-z]|$)').test(txt)); },
  other: () => DIST.key === 'valsad' ? 'surat' : 'valsad',
  // Cleanup never opens the other district's private stores; ULN / explicit district is sufficient.
  async otherLics() { return null; },
  /** classify every licensee of this district */
  async scan() {
    const lics = await DB.all('licensees');
    const list = lics.filter(l => !TJ.licenseeBelongs(l)).map(l => ({ l, sure: true, why: 'Foreign ULN / explicit other-district field' }));
    const mixed = lics.filter(l => TJ.licenseeBelongs(l) && (l.licences || []).some(x => !TJ.licBelongs(l, x))).map(l => ({ before: l, after: { ...l, licences: l.licences.filter(x => TJ.licBelongs(l, x)) } }));
    const foreignIns = (await DB.all('inspections')).filter(i => !TJ.licBelongs(null, i)).length;
    return { list, mixed, foreignIns, total: lics.length, otherChecked: false };
  },
  /** Deterministic cleanup in THIS open DB only; never use names/addresses/inspection presence as authority. */
  async auto(force = false) {
    if (DC._running) return DC._running;
    DC._running = (async () => {
      const flag = 'cleanup.foreignDistrict.v1';
      if (!force && await DB.getSetting(flag, false)) return { skipped: 'already checked' };
      const r = await DC.scan();
      if (r.list.length && r.list.length === r.total) {
        console.warn('District cleanup stopped: no in-district records remain. Restore the correct district list first.');
        return { blocked: 'would empty district' };
      }
      const result = r.list.length || r.mixed.length || r.foreignIns ? await DC.remove(r.list.map(x => x.l.id), { withRecords: true, patches: r.mixed }) : { licensees: 0 };
      await DB.setSetting(flag, { at: new Date().toISOString(), removed: result.licensees });
      return result;
    })();
    try { return await DC._running; } finally { DC._running = null; }
  },
  UNDO: () => 'bk.cleanUndo',
  async remove(ids, { withRecords, patches = [] }) {
    const set = new Set(ids), lics = (await DB.all('licensees')).filter(l => set.has(l.id));
    if (lics.length && lics.length === (await DB.all('licensees')).length) throw new Error('Refusing to empty this district. Import the correct district list first.');
    const ins = withRecords ? (await DB.all('inspections')).filter(i => {
      if (set.has(i.licenseeId) || !TJ.licBelongs(null, i)) return true;
      const patch = patches.find(p => p.before.id === i.licenseeId), code = normCode(i.typeCode);
      return patch && !patch.after.licences.some(x => normCode(x.typeCode) === code) && patch.before.licences.some(x => normCode(x.typeCode) === code && !TJ.licBelongs(patch.before, x));
    }) : [];
    const vis = (await DB.all('visits')).filter(v => set.has(v.licenseeId) || [...(v.licIds || []), ...(v.doneLics || [])].some(x => set.has(x)));
    const saf = await BK.safety('clean-district');
    await DB.setSetting(DC.UNDO(), { at: new Date().toISOString(), district: DIST.key, licensees: [...lics, ...patches.map(p => p.before)], inspections: ins, visits: vis });   // local only (bk.* is never synced)
    for (const l of lics) await DB.del('licensees', l.id);
    for (const p of patches) await DB.put('licensees', p.after);
    for (const i of ins) await DB.del('inspections', i.id);
    for (const v of vis) {
      const left = (v.licIds || []).filter(x => !set.has(x)), doneLics = (v.doneLics || []).filter(x => !set.has(x));
      if (withRecords && !left.length && !doneLics.length) await DB.del('visits', v.id);
      else await DB.put('visits', { ...v, licIds: left, doneLics, ...(set.has(v.licenseeId) ? { licenseeId: null } : {}) });
    }
    return { licensees: lics.length, mixedRecords: patches.length, inspections: ins.length, visits: vis.length, safety: saf };
  },
  async undo() {
    const u = await DB.getSetting(DC.UNDO(), null); if (!u) throw new Error('Nothing to undo');
    if (u.district !== DIST.key) throw new Error('This undo belongs to ' + DISTRICTS[u.district].en);
    for (const [s, a] of [['licensees', u.licensees], ['inspections', u.inspections], ['visits', u.visits]]) for (const r of a || []) { const { _u, _d, ...rec } = r; await DB.put(s, rec); }   // fresh stamps beat the delete tombstones in Drive sync
    await DB.del('settings', DC.UNDO()); return u.licensees.length;
  },
  /** for restore/import: guess which district a set of licensees belongs to */
  guess(lics) { let s = 0, v = 0; for (const l of lics || []) { const t = DC.text(l); if (DC.hits(t, 'surat').length) s++; if (DC.hits(t, 'valsad').length) v++; } return { surat: s, valsad: v, likely: s > v * 2 && s >= 3 ? 'surat' : v > s * 2 && v >= 3 ? 'valsad' : '' }; },
  /** warning html when a backup / import looks like the other district ('' if fine) */
  restoreWarning(obj) {
    const me = DIST.key, from = obj?.district || DC.guess(obj?.data?.licensees || obj?.licensees).likely;
    if (!from || from === me) return '';
    return `<div class="warnbox" style="margin:10px 0;border:2px solid #c62828">⚠️ This file looks like <b>${esc(DISTRICTS[from].en)}</b> data${obj?.district ? '' : ' (from the licensee addresses)'}, but you are in <b>${esc(DISTRICTS[me].en)}</b>. Switch district first (📍 at the top) unless you are sure. / આ ફાઇલ ${esc(DISTRICTS[from].gu)} ની લાગે છે.</div>`;
  },

  /* ---------- screen #distclean ---------- */
  async route() {
    setTop('Clean district data', 'જિલ્લા ડેટા સફાઈ', true);
    const me = DISTRICTS[DIST.key], ot = DISTRICTS[DC.other()], u = await DB.getSetting(DC.UNDO(), null);
    view().innerHTML = `<div class="card"><div class="muted">Finds <b>${esc(ot.en)}</b> licensees that are inside the <b>${esc(me.en)}</b> district by mistake. Only ${esc(me.en)} data is changed; ${esc(ot.en)} data is never touched. A backup is made before deleting, and you can Undo.</div><div id="dcBody" class="muted" style="margin-top:8px">Checking…</div></div>
      ${u ? `<div class="card"><h3>↶ Undo last clean-up</h3><div class="muted">${u.licensees.length} licensees removed on ${new Date(u.at).toLocaleString('en-IN')}.</div><button class="btn sec block" id="dcUndo">Undo – put them back</button></div>` : ''}`;
    if ($('#dcUndo')) $('#dcUndo').onclick = e => busy(e.target, async () => { if (!confirm('Put back the removed records?')) return; const n = await DC.undo(); toast(n + ' licensees restored'); DC.route(); });
    const r = await DC.scan(), L = r.list;
    if (!L.length) { $('#dcBody').innerHTML = `✅ No ${esc(ot.en)} licensees found among ${r.total} licensees.`; return; }
    const ns = L.filter(x => x.sure).length;
    $('#dcBody').outerHTML = `<div class="okbox" style="margin-top:8px">${r.total} licensees checked · <b>${ns}</b> look like ${esc(ot.en)} (ticked) · ${L.length - ns} unclear (not ticked)${r.otherChecked ? '' : ` · ${esc(ot.en)} data not on this phone, so IDs were not compared`}</div>
      <div class="te-top"><button class="btn sec sm" id="dcAll">Tick all</button><button class="btn sec sm" id="dcNone">Untick all</button></div>
      <ul class="list" id="dcList">${L.map((x, i) => `<li><label class="te-chk" style="flex:1;margin:0;align-items:flex-start"><input type="checkbox" data-i="${i}" ${x.sure ? 'checked' : ''} style="width:22px;height:22px;flex:none"><span><b>${esc(x.l.name || '—')}</b>${x.sure ? '' : ' <span class="pill">unclear</span>'}<br><small class="muted">${esc([x.l.address, x.l.area].filter(Boolean).join(', '))}</small><br><small>${esc(x.why)}</small></span></label></li>`).join('')}</ul>
      <label class="te-chk"><input type="checkbox" id="dcRec"> Also delete their inspections (and visits only for them)</label>
      <button class="btn danger block" id="dcGo" style="margin-top:10px">Remove ticked from ${esc(me.en)}</button>`;
    const ticked = () => $$('#dcList input:checked').map(c => L[+c.dataset.i].l);
    $('#dcAll').onclick = () => $$('#dcList input').forEach(c => c.checked = true); $('#dcNone').onclick = () => $$('#dcList input').forEach(c => c.checked = false);
    $('#dcGo').onclick = e => { const t = ticked(); if (!t.length) return toast('Nothing ticked'); const wr = $('#dcRec').checked;
      if (!confirm(`Remove ${t.length} licensee(s) from ${me.en}${wr ? ' with their inspections' : ''}?\nA backup is made first and you can Undo. ${ot.en} data is not touched.`)) return;
      busy(e.target, async () => { const res = await DC.remove(t.map(l => l.id), { withRecords: wr }); toast(`Removed ${res.licensees} licensees${wr ? ', ' + res.inspections + ' inspections' : ''}`); DC.route(); }); };
  }
};
