'use strict';
/* v1.8.0 District taarij + shared tour days.
   (1) Licence totals of the abstract (પરવાનાની કુલ સંખ્યા) are counted LIVE from THIS district's licensee list
       (the e-Prohibition list imported / Drive-synced into this district). Licences whose ULN belongs to the other
       district (SUR/… in Valsad, VAL/… in Surat) are never counted. Typed totals are used only if "manual totals" is on.
   (2) Day-wise diary rows (tour / office / leave …) are shared between Surat and Valsad on a phone that has both,
       so both diaries show the same tour days. Licensees, inspections and figures stay district-only. */
const TJ = {
  PREFIX: { surat: 'SUR', valsad: 'VAL' },
  otherKey: () => DIST.key === 'valsad' ? 'surat' : 'valsad',
  ulnOf: x => String(x?.uln || x?.licenceNo || (x?.fields || []).find(f => /unique\s*licen[cs]e\s*number|^ULN$/i.test(f.label || ''))?.value || '').toUpperCase().replace(/\s+/g, ''),
  /** does this licence belong to district k? (by ULN prefix, else by the licensee's district field) */
  licBelongs(l, x, k = DIST.key) {
    const u = TJ.ulnOf(x), m = u.match(/^([A-Z]{3})\//);
    if (m && Object.values(TJ.PREFIX).includes(m[1])) return m[1] === TJ.PREFIX[k];
    const d = String(l?.district || '').toLowerCase();
    for (const [kk, info] of Object.entries(DISTRICTS)) if (d.includes(kk) || (info.gu && d.includes(info.gu))) return kk === k;
    return true;   // unknown → it is in this district's own database
  },
  licenseeBelongs(l, k = DIST.key) { const ls = l?.licences || []; return ls.length ? ls.some(x => TJ.licBelongs(l, x, k)) : TJ.licBelongs(l, {}, k); },
  /* v1.8.0-pf40 Sir's standing "do not count" rules (both districts): DS3, DS4, DSP2, DSP3, DSP4, DD2 types; hospitals, clinics,
     schools, colleges, universities and other institutions; RS2 only for factories / companies (Dodel Analytical kept).
     Inspection records are never touched – skipped licences are only left out of totals, inspected and progressive counts. */
  SKIP_TYPES: ['DS3', 'DS4', 'DSP2', 'DSP3', 'DSP4', 'DD2'],
  INST_RE: /hospital|clinic|nursing\s*home|dispensary|maternity|medical\s*college|college|school|university|vidyalaya|vidhyalaya|vidyapith|vidyapeeth|vidya\s*mandir|mahavidyalaya|shala|\bshal\b|institute\s+of|\bpharmacy\s+college|\bp\.?\s*h\.?\s*c\b|\bc\.?\s*h\.?\s*c\b|primary\s+health|community\s+health|health\s+cent(er|re)|sub\s*district\s+hosp|civil\s+hosp|tb\s+(cent|office|hosp)|દવાખાન|હોસ્પિટલ|હોસ્પીટલ|ઇસ્પિતાલ|કોલેજ|કૉલેજ|શાળા|વિદ્યાલય|વિદ્યાપીઠ|યુનિવર્સિટી|આરોગ્ય\s*કેન્દ્ર|પ્રાથમિક\s*આરોગ્ય/i,
  /* RS2 that is NOT a factory: government offices, labs, research bodies */
  RS2_GOVT_RE: /superintendent|government|govt|sarkari|સરકારી|g\.?p\.?c\.?b|pollution\s+control|forensic|\bf\.?s\.?l\b|research\s+(institute|foundation)|snake|\bs\.?r\.?p\b|reserve\s+police|police|collector|mamlatdar|panchayat|municipal|nagar\s*palika|office\s+of|district\s+(tb|health)|tb\s+(cent|office)/i,
  FIRM_RE: /\bp(vt|rivate)\b|\bltd\b|limited|\bllp\b|industr|\bmills?\b|sahakari|khand\s*udyog|udyog|\bco\.?\s*op|co-?operative|factory|chemical|pharma|dyestuff|dyes?\b|textile|laborator|lifescience|rasayan|polymer|plastics?|enterprise|corporation|\bcorp\b|works|manufactur|\bcompany\b|\b&\s*co\b|\bincorporated|\binc\b|organics|fertili|petro|refiner|distiller|brewer|engineering|products|dairy|foods?\b|power\s+station|electricity|\bplant\b|processors?|exports?|traders|trading/i,
  KEEP_RE: /dodel\s+analytical/i,
  /** reason string when this licence must NOT be counted, else '' */
  skipLicence(l, x) {
    const c = normCode(x?.typeCode || TJ.ulnOf(x).split('/')[1] || '');
    if (TJ.SKIP_TYPES.includes(c)) return 'type ' + c;
    const text = [l?.name, ...(l?.aka || []), l?.address].filter(Boolean).join(' ');
    const name = [l?.name, ...(l?.aka || [])].filter(Boolean).join(' ');
    if (TJ.KEEP_RE.test(text)) return '';
    if (TJ.INST_RE.test(name) && !(TJ.FIRM_RE.test(name) && !/hospital|clinic|college|school|university|હોસ્પિટલ|કોલેજ|શાળા/i.test(name))) return 'hospital / school / college';
    if (c === 'RS2' && (TJ.RS2_GOVT_RE.test(name) || !TJ.FIRM_RE.test(name))) return 'RS2 not a factory / company';
    return '';
  },
  // pf41: compare calendar dates in India, never the phone's timezone or UTC midnight.
  todayIST(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Calcutta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const v = k => parts.find(p => p.type === k).value;
    return `${v('year')}-${v('month')}-${v('day')}`;
  },
  validEnd(value) {
    const s = String(value || '').split(/\s+to\s+/i).pop().trim();
    let m, y, mo, d;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/))) [, y, mo, d] = m;
    else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, d, mo, y] = m;
    else return null;
    const date = new Date(Date.UTC(+y, +mo - 1, +d));
    if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  },
  isExpired(x, today = TJ.todayIST()) { const end = TJ.validEnd(x?.validity); return !!end && end < today; },
  isInactive(x, today = TJ.todayIST()) { return x?.status === 'inactive' || TJ.isExpired(x, today); },
  isValidToday(x, today = TJ.todayIST()) { return !TJ.isInactive(x, today); },
  inactiveReason(x) { return x?.inactiveReason || (TJ.isExpired(x) ? 'Validity ended ' + TJ.validEnd(x.validity) : 'inactive'); },
  /** inspection → skip? (looks the licence up on the licensee; else by the inspection's own type / name) */
  skipInspection(i, lic) {
    if (i?.licenseeId && !lic) return true; // Deleted company: keep unknown history, but never count an orphan as an active licence.
    const c = normCode(i?.typeCode);
    const x = (lic?.licences || []).find(y => normCode(y.typeCode) === c) || { typeCode: i?.typeCode };
    return !!i?.excluded || !TJ.licBelongs(lic, i) || !TJ.licBelongs(lic, x) || (lic && !TJ.licenseeBelongs(lic)) || TJ.isInactive(x) || !!TJ.skipLicence(lic || { name: i?.licenseeName || i?.name || i?.firm || '' }, x);
  },
  /** {rowKey: [{name, uln, code}]} – active licences of this district per abstract row */
  async lists(rows) {
    rows ||= await L.abstractRows();
    const out = {}; rows.forEach(r => out[r.key] = []);
    for (const l of await DB.all('licensees')) for (const x of l.licences || []) {
      if (TJ.isInactive(x) || !TJ.licBelongs(l, x) || TJ.skipLicence(l, x)) continue;
      const c = normCode(x.typeCode);
      for (const r of rows) if (r.codes.includes(c)) out[r.key].push({ name: l.name || '', uln: TJ.ulnOf(x), code: x.typeCode || '', area: l.area || '' });
    }
    for (const k in out) out[k].sort((a, b) => a.uln.localeCompare(b.uln));
    return out;
  },
  inspectionKey: i => i.licenseeId || i.reportNo || i.id,
  /** Same per-abstract-row unique-licensee semantics used by taarij and dashboard. */
  rowCounts(lics, ins, rows, per) {
    const lm = Object.fromEntries(lics.map(l => [l.id, l])), by = {};
    for (const r of rows) {
      const entries = [];
      for (const l of lics) for (const lc of l.licences || []) if (TJ.isValidToday(lc) && TJ.licBelongs(l, lc) && !TJ.skipLicence(l, lc) && r.codes.includes(normCode(lc.typeCode))) entries.push({ l, lc, c: normCode(lc.typeCode), row: r });
      const seen = new Set(), done = [];
      for (const i of ins) if (i.date >= per.from && i.date <= per.to && !TJ.skipInspection(i, lm[i.licenseeId]) && r.codes.includes(normCode(i.typeCode))) {
        const key = TJ.inspectionKey(i); if (!seen.has(key)) { seen.add(key); done.push({ i, l: lm[i.licenseeId], lc: lm[i.licenseeId]?.licences?.find(x => normCode(x.typeCode) === normCode(i.typeCode)), c: normCode(i.typeCode), row: r }); }
      }
      const pending = entries.slice();
      for (const d of done) { const n = pending.findIndex(e => e.l.id === d.i.licenseeId); if (n >= 0) pending.splice(n, 1); }
      by[r.key] = { total: entries.length, done: done.length, pending: Math.max(0, entries.length - done.length), entries, inspected: done, remaining: pending };
    }
    return by;
  },
  /** cross-check of this district's licence list before printing the taarij (flags, never silently fixes) */
  async audit() {
    const out = { otherDistrict: [], notPortal: [], badUln: [], dupUln: [], typeMismatch: [] }, seen = {}; let skipped = 0;
    for (const l of await DB.all('licensees')) for (const x of l.licences || []) {
      if (TJ.isInactive(x)) continue;
      const u = TJ.ulnOf(x), tag = `${l.name || '—'} ${u || '(no ULN)'}`;
      if (!TJ.licBelongs(l, x)) { out.otherDistrict.push(tag); continue; }
      if (TJ.skipLicence(l, x)) { skipped++; continue; }   // pf40: not counted → not cross-checked
      const m = u.match(/^([A-Z]{3})\/([A-Z0-9]+)\/(\d{6})\/(\d{5})$/);
      if (!m) out.badUln.push(tag); else if (normCode(m[2]) !== normCode(x.typeCode)) out.typeMismatch.push(`${tag} (type ${x.typeCode})`);
      if (!(typeof PM !== 'undefined' ? PM.licPortal(l, x) : /e-Prohibition/i.test(x.source || l.importedFrom || ''))) out.notPortal.push(tag);
      if (u) { if (seen[u]) out.dupUln.push(tag); seen[u] = 1; }
    }
    out.count = Object.values(out).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0); out.skipped = skipped;
    return out;
  },
  auditHtml(a) {
    const skipNote = `<div class="muted" style="font-size:12px;margin-top:4px">Not counted: inactive / expired licences; hospitals, clinics, schools, colleges and other institutions; DS3, DS4, DSP2, DSP3, DSP4, DD2; RS2 other than factories/companies${a.skipped ? ' (' + a.skipped + ' licence(s) left out)' : ''}. Their inspections are kept.</div>`;
    if (!a.count) return `<div class="card okbox">✓ ${esc(DIST.info.en)} licence list checked: every counted licence has a ${TJ.PREFIX[DIST.key]}/… ULN from e-Prohibition.${skipNote}</div>`;
    const sec = (t, l) => l.length ? `<details><summary>${esc(t)} (${l.length})</summary><div style="font-size:12px">${l.slice(0, 200).map(esc).join('<br>')}</div></details>` : '';
    return `<div class="card warnbox"><b>Licence cross-check with e-Prohibition – ${a.count} item(s) to check</b>
      ${sec(DISTRICTS[TJ.otherKey()].en + ' licences in this district (NOT counted)', a.otherDistrict)}${sec('Not pulled from e-Prohibition (counted – verify on portal)', a.notPortal)}
      ${sec('ULN not in portal format', a.badUln)}${sec('Licence type differs from ULN', a.typeMismatch)}${sec('Same ULN twice', a.dupUln)}
      ${a.dupUln.length || a.notPortal.length ? `<div class="muted">Fix: tap <b>Keep portal list &amp; merge duplicate ULNs</b> (e-Prohibition is the authority; inspections kept). Non-portal licences that have inspections stay listed here by design.</div>${typeof PM !== 'undefined' ? PM.button() : ''}` : ''}
      <div class="muted">Re-import this district's e-Prohibition list (More › Import) to fill details. <i>Clean district data</i> is only for ${esc(DISTRICTS[TJ.otherKey()].en)} licensees put here by mistake.</div>${skipNote}</div>`;
  },
  /* ---------- shared tour days ---------- */
  _dbs: {},
  async otherDb() {
    const k = TJ.otherKey(); if (DIST.locked() && DIST.locked() !== k && DIST.locked() === DIST.key) return null;   // officer phone of one district
    if (TJ._dbs[k]) return TJ._dbs[k];
    const db = await XD._open(DISTRICTS[k].db); if (!db || !db.objectStoreNames.contains('days')) return null;
    return TJ._dbs[k] = db;
  },
  _req: r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }),
  async _otx(fn) { const db = await TJ.otherDb(); if (!db) return null; const t = db.transaction(['days', 'settings'], 'readwrite'); const res = await fn(t.objectStore('days'), t.objectStore('settings')); await new Promise(ok => { t.oncomplete = ok; t.onerror = ok; t.onabort = ok; }); return res; },
  shareable: d => d && !d.auto,
  clean(d) { const { _u, _d, ...r } = d; return r; },
  /** copy one saved day into the other district (raw, with a fresh sync stamp so that district's Drive sync carries it) */
  async mirror(day) {
    if (!TJ.shareable(day)) return;
    await TJ._otx(async (ds, ss) => { ds.put({ ...TJ.clean(day), sharedFrom: day.sharedFrom || DIST.key, _u: day._u || new Date().toISOString(), _d: day._d || 'shared' }); ss.put({ key: 'sync.dirty', value: true }); });
  },
  async mirrorDel(date) { await TJ._otx(async (ds, ss) => { ds.delete(date); ss.put({ key: 'sync.dirty', value: true }); }); },
  install() {
    const put = DB.put, del = DB.del;
    DB.put = async (s, v) => { const r = await put(s, v); if (s === 'days') { try { await TJ.mirror(await DB.get('days', v.date)); } catch (e) { console.warn('tour mirror', e); } } return r; };
    DB.del = async (s, k) => { const r = await del(s, k); if (s === 'days') { try { await TJ.mirrorDel(k); } catch (e) { console.warn(e); } } return r; };
  },
  /** two-way merge of saved diary days between the districts: newest edit of each date wins in both. */
  async reconcile() {
    const db = await TJ.otherDb(); if (!db) return { shared: false, copied: 0 };
    const mine = {}; (await DB.all('days')).forEach(d => mine[d.date] = d);
    const theirs = {}; (await TJ._otx(async ds => TJ._req(ds.getAll())) || []).forEach(d => theirs[d.date] = d);
    let toMe = [], toThem = [];
    for (const date of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const a = mine[date], b = theirs[date];
      if (a && !b) { if (TJ.shareable(a)) toThem.push(a); continue; }
      if (b && !a) { if (TJ.shareable(b)) toMe.push(b); continue; }
      if (SYM.same(TJ.clean(a), TJ.clean(b)) || SYM.same({ ...TJ.clean(a), sharedFrom: 0 }, { ...TJ.clean(b), sharedFrom: 0 })) continue;
      ((a._u || '') >= (b._u || '') ? toThem : toMe).push((a._u || '') >= (b._u || '') ? a : b);
    }
    if (toThem.length) await TJ._otx(async (ds, ss) => { toThem.forEach(d => ds.put({ ...TJ.clean(d), sharedFrom: d.sharedFrom || DIST.key, _u: d._u || new Date().toISOString(), _d: d._d || 'shared' })); ss.put({ key: 'sync.dirty', value: true }); });
    for (const d of toMe) await SY.raw.put('days', { ...TJ.clean(d), _u: d._u || new Date().toISOString(), _d: d._d || 'shared' });
    if (toMe.length) SY.markDirty(SY.FAST_MS);
    return { shared: true, copied: toMe.length + toThem.length };
  },
  /** "Sync diary first": Drive sync of this district + tour-day merge with the other district (+ Drive sync again). */
  async preExport() {
    const msgs = []; let ok = true; const quiet = SY._quietRefresh; SY._quietRefresh = true;
    try { const r = await SY.auto('pre-export'); if (!r || r.needsSignIn || r.offline || r.error) { ok = false; msgs.push((r?.error || 'Drive unavailable / signed out') + ' — using local data'); } else msgs.push('Drive synced'); } catch (e) { ok = false; msgs.push('Drive sync failed: ' + e.message); }
    try { const t = await TJ.reconcile(); msgs.push(t.shared ? `tour days matched with ${DISTRICTS[TJ.otherKey()].en}${t.copied ? ' (' + t.copied + ' updated)' : ''}` : 'other district not on this phone'); if (t.copied) { try { const r = await SY.auto('pre-export'); if (r?.error || r?.offline) { ok = false; msgs.push('Calendar upload pending — using local data'); } } catch (e) { ok = false; } } } catch (e) { ok = false; msgs.push('tour-day sync failed: ' + e.message); }
    try { await DB.setSetting('diary.lastSync', { at: new Date().toISOString(), msgs }); } finally { SY._quietRefresh = quiet; }
    return { ok, msg: msgs.join(' · ') };
  },
  /** Every generation attempts sync; offline/sign-out is a local-data fallback, never a prompt. */
  async gate() {
    toast('Syncing diary, taarij & calendar…');
    const r = await TJ.preExport(); toast(r.msg);
    return true;
  },
  annexPages(m) {
    if (!m.lists) return [];
    const rows = m.abstract.filter(r => (m.lists[r.key] || []).length);
    if (!rows.length) return [];
    return [`<div class="pg"><div class="ttl">પરવાનાની યાદી (${esc(DIST.info.gu)} જિલ્લો) – e-Prohibition મુજબ</div><table class="ab" style="width:100%;font-size:11px"><tr><th>ક્રમ</th><th>પરવાનાનો પ્રકાર</th><th>ULN / પરવાના નં.</th><th>પરવાનેદાર</th></tr>
      ${rows.map(r => m.lists[r.key].map((x, i) => `<tr><td>${i ? '' : esc(r.sr)}</td><td>${i ? '' : esc(r.label) + ' (' + guNum(m.lists[r.key].length) + ')'}</td><td style="text-align:left">${esc(x.uln || '-')}</td><td style="text-align:left">${esc(x.name)}</td></tr>`).join('')).join('')}</table></div>`];
  }
};
if (typeof module !== 'undefined') module.exports = { TJ };
