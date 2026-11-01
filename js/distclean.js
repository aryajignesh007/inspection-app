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
  /** read-only copy of the other district's licensees (same phone) for ID matching; never written */
  async otherLics() {
    const name = DISTRICTS[DC.other()].db;
    try { if (indexedDB.databases && !(await indexedDB.databases()).some(d => d.name === name)) return null; } catch (e) {}
    return new Promise(ok => { const r = indexedDB.open(name); r.onupgradeneeded = () => { r.transaction.abort(); ok(null); };
      r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('licensees')) { d.close(); return ok(null); } const q = d.transaction('licensees').objectStore('licensees').getAll(); q.onsuccess = () => { d.close(); ok(q.result); }; q.onerror = () => { d.close(); ok(null); }; };
      r.onerror = () => ok(null); });
  },
  /** classify every licensee of this district */
  async scan() {
    const me = DIST.key, ot = DC.other(), lics = await DB.all('licensees'), oth = await DC.otherLics(), ids = new Set((oth || []).map(x => x.id));
    const key = l => (l.name || '').trim().toLowerCase() + '|' + (l.licences || []).map(x => x.licenceNo || '').sort().join(',');
    const keys = new Set((oth || []).map(key));
    const out = [];
    for (const l of lics) {
      const t = DC.text(l), ho = DC.hits(t, ot), hm = DC.hits(t, me), why = [], lic = (l.licences || []).map(x => x.licenceNo || '').join(' ');
      const idm = ids.has(l.id), km = keys.has(key(l)), df = String(l.district || '').toLowerCase(), dfo = df.includes(ot), dfm = df.includes(me), lo = DC.LIC[ot].test(lic), lm = DC.LIC[me].test(lic);
      if (idm) why.push('same record (ID) as in ' + DISTRICTS[ot].en); else if (km) why.push('same name & licence no. as in ' + DISTRICTS[ot].en);
      if (dfo) why.push('district: ' + l.district); if (ho.length) why.push('place: ' + ho.join(', ')); if (lo) why.push('licence no. pattern');
      if (!why.length) continue;
      const mine = hm.length || dfm || lm;
      const sure = !mine && (idm || km || dfo || ho.length > 0);
      out.push({ l, why: why.join(' · ') + (mine ? ` · but also ${DISTRICTS[me].en}: ${[...hm, dfm ? 'district field' : '', lm ? 'licence no.' : ''].filter(Boolean).join(', ')}` : ''), sure });
    }
    return { list: out.sort((a, b) => (b.sure - a.sure) || (a.l.name || '').localeCompare(b.l.name || '')), total: lics.length, otherChecked: !!oth };
  },
  UNDO: () => 'bk.cleanUndo',
  async remove(ids, { withRecords }) {
    const set = new Set(ids), lics = (await DB.all('licensees')).filter(l => set.has(l.id));
    const ins = withRecords ? (await DB.all('inspections')).filter(i => set.has(i.licenseeId)) : [];
    const vis = (await DB.all('visits')).filter(v => (v.licIds || []).some(x => set.has(x)));
    const saf = await BK.safety('clean-district');
    await DB.setSetting(DC.UNDO(), { at: new Date().toISOString(), district: DIST.key, licensees: lics, inspections: ins, visits: vis });   // local only (bk.* is never synced)
    for (const l of lics) await DB.del('licensees', l.id);
    for (const i of ins) await DB.del('inspections', i.id);
    for (const v of vis) { const left = (v.licIds || []).filter(x => !set.has(x)); if (withRecords && !left.length) await DB.del('visits', v.id); else await DB.put('visits', { ...v, licIds: left }); }
    return { licensees: lics.length, inspections: ins.length, visits: vis.length, safety: saf };
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
