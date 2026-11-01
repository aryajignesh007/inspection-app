'use strict';
/* Data protection (v1.4.0)
   1. Every change -> automatic backup 8 s later (debounced), plus one daily backup on start / resume.
   2. Native app: dated JSON file in  Documents/InspectionApp/backups  (survives uninstall / "Clear data"),
      plus a private mirror  files/backups/latest.json  (included in Android Auto Backup to Google Drive).
      Keeps the last 30 daily files + 10 safety files.
   3. Safety backup before every restore or import.  4. Auto-restore offer when the app starts empty.
   5. "Last backup" indicator + 7-day reminder.        6. Validated restore with record counts. */
const BK = {
  DIR: (typeof DIST !== 'undefined' ? DIST.info.bkDir : 'InspectionApp/backups'), KEEP: 30, KEEP_SAFETY: 10, DEBOUNCE_MS: 8000, REMIND_DAYS: 7,
  APP_VERSION: '1.7.7', _timer: null, _suspend: 0, _running: null,
  isNative: () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()),
  fs: () => window.Capacitor?.Plugins?.Filesystem,
  stamp(d = new Date()) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; },
  COUNT_STORES: ['licensees', 'inspections', 'days', 'visits', 'diaries', 'templates', 'licenceTypes', 'settings', 'keywords', 'reminders', 'meetings', 'offices', 'pendency', 'staff', 'messages', 'receipts'],
  counts(data) { const c = {}; for (const s of BK.COUNT_STORES) c[s] = Array.isArray(data?.[s]) ? data[s].length : 0; return c; },
  isEmptyData: c => !c.licensees && !c.inspections && !c.days && !c.visits,
  /* ---------- build / validate ---------- */
  async snapshot(reason = 'manual') {
    const data = await DB.dump();
    data.settings = data.settings.filter(s => !/^(bk|sync)\./.test(String(s.key)));   // backup / sync bookkeeping is not data
    delete data.tombstones;
    return { kind: 'batti-mobile-backup', version: 2, app: 'Inspection App', appVersion: BK.APP_VERSION, district: (typeof DIST !== 'undefined' ? DIST.key : ''), createdAt: new Date().toISOString(), reason, counts: BK.counts(data), data };
  },
  validate(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('File is not valid JSON / ફાઇલ યોગ્ય નથી');
    if (obj.kind === 'batti-mobile-private-import') throw new Error('This is the existing-data file, not a backup. Use More › Import data. / આ બેકઅપ નથી – Import data વાપરો.');
    if (obj.kind !== 'batti-mobile-backup' || !obj.data || typeof obj.data !== 'object') throw new Error('Not an Inspection App backup file / આ Inspection App નો બેકઅપ નથી');
    for (const [s, k] of Object.entries(DB.STORES)) {
      const a = obj.data[s]; if (a == null) continue;
      if (!Array.isArray(a)) throw new Error(`Backup is damaged (${s}) / બેકઅપ ખરાબ છે`);
      if (a.some(r => !r || typeof r !== 'object' || r[k] == null)) throw new Error(`Backup is damaged: ${s} record without ${k}`);
    }
    return { createdAt: obj.createdAt || '', appVersion: obj.appVersion || '≤1.3.0', counts: BK.counts(obj.data) };
  },
  /* ---------- low-level file I/O (native) ---------- */
  async writeDoc(name, text) {
    const FS = BK.fs(); await FS.writeFile({ path: `${BK.DIR}/${name}`, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
    const r = await FS.getUri({ path: `${BK.DIR}/${name}`, directory: 'DOCUMENTS' }).catch(() => ({})); return r.uri;
  },
  async writeMirror(text) { await BK.fs().writeFile({ path: 'backups/latest.json', data: text, directory: 'DATA', encoding: 'utf8', recursive: true }); },
  async listDocs() {
    try { const r = await BK.fs().readdir({ path: BK.DIR, directory: 'DOCUMENTS' });
      return (r.files || []).map(f => typeof f === 'string' ? { name: f } : f).filter(f => /^Inspection-App-.*\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
    } catch (e) { return []; }
  },
  async readText(path, directory) { const r = await BK.fs().readFile({ path, directory, encoding: 'utf8' }); return typeof r.data === 'string' ? r.data : await r.data.text(); },
  async rotate() {
    const files = await BK.listDocs(); const daily = files.filter(f => /^Inspection-App-backup-/.test(f.name)), safety = files.filter(f => /^Inspection-App-safety-/.test(f.name));
    for (const f of [...daily.slice(BK.KEEP), ...safety.slice(BK.KEEP_SAFETY)]) await BK.fs().deleteFile({ path: `${BK.DIR}/${f.name}`, directory: 'DOCUMENTS' }).catch(() => {});
  },
  /* ---------- automatic backup ---------- */
  /** Writes today's file (one per day, overwritten during the day) + private mirror. Never throws. */
  async run(reason = 'auto') {
    if (BK._running) return BK._running;
    BK._running = (async () => {
      try {
        const snap = await BK.snapshot(reason);
        if (BK.isEmptyData(snap.counts) && reason !== 'manual') return { skipped: 'empty' };   // never overwrite good backups with an empty phone
        const text = JSON.stringify(snap); const out = { at: snap.createdAt, counts: snap.counts, bytes: text.length };
        if (BK.isNative()) {
          try { await BK.writeMirror(text); out.mirror = true; } catch (e) { out.mirrorError = e.message; }
          try { out.uri = await BK.writeDoc(`Inspection-App-backup-${todayStr()}.json`, text); out.file = `Documents/${BK.DIR}/Inspection-App-backup-${todayStr()}.json`; await BK.rotate(); } catch (e) { out.fileError = e.message; }
        } else {
          try { localStorage.setItem((typeof DIST !== 'undefined' ? DIST.ls('bk.mirror') : 'bk.mirror'), text); out.mirror = true; } catch (e) { out.mirrorError = 'too large for browser mirror'; }
        }
        const ok = out.file || out.mirror;
        await DB.setSetting('bk.last', { ...out, ok: !!ok, reason });
        if (out.file) await DB.setSetting('bk.lastFile', out);
        if (ok && !(await DB.getSetting('bk.first', null))) await DB.setSetting('bk.first', snap.createdAt);
        return out;
      } catch (e) { console.error('backup failed', e); return { error: e.message }; }
    })();
    try { return await BK._running; } finally { BK._running = null; }
  },
  schedule() { if (BK._suspend) return; clearTimeout(BK._timer); BK._timer = setTimeout(() => BK.run('after-save'), BK.DEBOUNCE_MS); },
  flush() { if (BK._timer) { clearTimeout(BK._timer); BK._timer = null; return BK.run('after-save'); } },
  async daily() { const l = await DB.getSetting('bk.last', null); if (!l || !l.ok || String(l.at).slice(0, 10) !== new Date().toISOString().slice(0, 10)) return BK.run('daily'); },
  /** Safety copy right before restore / import. Native: separate file in Documents. Browser: downloads the file. */
  async safety(reason) {
    const snap = await BK.snapshot('safety-' + reason); if (BK.isEmptyData(snap.counts)) return { skipped: 'empty' };
    const text = JSON.stringify(snap), name = `Inspection-App-safety-${BK.stamp()}-before-${reason}.json`;
    if (BK.isNative()) { await BK.writeDoc(name, text); await BK.rotate(); return { file: `Documents/${BK.DIR}/${name}` }; }
    try { localStorage.setItem((typeof DIST !== 'undefined' ? DIST.ls('bk.safety') : 'bk.safety'), text); } catch (e) { await saveFile(new Blob([text], { type: 'application/json' }), name); return { downloaded: name }; }
    return { browser: true };
  },
  /* ---------- restore ---------- */
  async restore(obj, { safety = true } = {}) {
    BK.validate(obj);
    const saf = safety ? await BK.safety('restore') : null;
    BK._suspend++; try { await IM.restore(obj); } finally { BK._suspend--; }
    await DB.setSetting('bk.restoredFrom', { at: new Date().toISOString(), createdAt: obj.createdAt, counts: BK.counts(obj.data) });
    await BK.run('after-restore');
    return { safety: saf, counts: BK.counts(obj.data) };
  },
  /** Newest usable backup found on the device (native mirror first, then Documents folder; browser mirror). */
  async findLatest() {
    const cands = [];
    if (BK.isNative()) {
      try { cands.push({ src: 'App storage (latest.json)', obj: JSON.parse(await BK.readText('backups/latest.json', 'DATA')) }); } catch (e) {}
      for (const f of (await BK.listDocs()).slice(0, 5)) { try { cands.push({ src: `Documents/${BK.DIR}/${f.name}`, obj: JSON.parse(await BK.readText(`${BK.DIR}/${f.name}`, 'DOCUMENTS')) }); } catch (e) {} }
    } else {
      for (const k of [(typeof DIST !== 'undefined' ? DIST.ls('bk.mirror') : 'bk.mirror'), (typeof DIST !== 'undefined' ? DIST.ls('bk.safety') : 'bk.safety')]) { try { const t = localStorage.getItem(k); if (t) cands.push({ src: 'Browser copy', obj: JSON.parse(t) }); } catch (e) {} }
    }
    const good = cands.map(c => { try { return { ...c, info: BK.validate(c.obj) }; } catch (e) { return null; } }).filter(c => c && !BK.isEmptyData(c.info.counts));
    good.sort((a, b) => String(b.info.createdAt).localeCompare(String(a.info.createdAt)));
    return good[0] || null;
  },
  async phoneIsEmpty() { for (const s of ['licensees', 'inspections', 'days', 'visits']) if ((await DB.all(s)).length) return false; return true; },
  /* ---------- share ---------- */
  async share() {
    const snap = await BK.snapshot('share'), text = JSON.stringify(snap), name = `Inspection-App-backup-${BK.stamp()}.json`;
    if (BK.isNative()) {
      const { Filesystem, Share } = Capacitor.Plugins;
      const r = await Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      try { await Share.share({ title: name, text: 'Inspection App backup ' + BK.stamp(), files: [r.uri], dialogTitle: 'Send backup / બેકઅપ મોકલો' }); }
      catch (e) { if (!/cancel/i.test(e.message || '')) { try { await Share.share({ title: name, url: r.uri, dialogTitle: 'Send backup' }); } catch (e2) {} } }
    } else {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') await saveFile(file, name); } }
      else await saveFile(file, name);
    }
    await DB.setSetting('bk.lastShared', { at: snap.createdAt, counts: snap.counts });
    return snap.counts;
  },
  /* ---------- status / UI helpers ---------- */
  async status() {
    const last = await DB.getSetting('bk.last', null), shared = await DB.getSetting('bk.lastShared', null), legacy = await DB.getSetting('lastBackup', null);
    const lastAt = last?.ok ? new Date(last.at) : null;
    const offAt = shared ? new Date(shared.at) : null;   // a copy that left the phone
    const first = await DB.getSetting('bk.first', null), offRef = offAt || (first ? new Date(first) : null);   // never shared: count from first backup
    const ageDays = d => d ? (Date.now() - d.getTime()) / 864e5 : Infinity;
    return { last, lastAt, shared, offAt, legacy, autoAge: ageDays(lastAt), offAge: ageDays(offAt),
      needsReminder: ageDays(BK.isNative() ? lastAt : (offAt || null)) > BK.REMIND_DAYS || (BK.isNative() && !!offRef && ageDays(offRef) > 30) };
  },
  fmt: d => d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never / ક્યારેય નહીં',
  countsHtml(c) {
    const lab = [['licensees', 'Licensees / પરવાનેદાર'], ['inspections', 'Inspections / તપાસણી'], ['days', 'Diary days / ડાયરી દિવસ'], ['visits', 'Planned visits / મુલાકાત'], ['templates', 'Form templates'], ['settings', 'Settings / profile']];
    return `<table class="t">${lab.map(([k, l]) => `<tr><td class="l">${l}</td><td><b>${c[k] || 0}</b></td></tr>`).join('')}</table>`;
  },
  /** Called once at start-up. */
  async init() {
    // hook all data writes -> debounced auto-backup (settings 'bk.*' are bookkeeping and ignored)
    for (const m of ['put', 'putMany', 'del', 'clear']) { const orig = DB[m].bind(DB);
      DB[m] = async (s, v) => { const r = await orig(s, v); if (!(s === 'settings' && m === 'put' && String(v?.key).startsWith('bk.'))) BK.schedule(); return r; }; }
    // safety copy before every import
    for (const fn of ['importPrivate', 'importLicenseesExcel', 'importDiaryExcel', 'importTemplateExcel']) { const orig = IM[fn];
      if (orig) IM[fn] = async function (...a) { try { await BK.safety('import'); } catch (e) { console.warn(e); } return orig.apply(this, a); }; }
    document.addEventListener('visibilitychange', () => { if (document.hidden) BK.flush(); else BK.daily(); });
    window.addEventListener('pagehide', () => BK.flush());
    const persisted = await DB.persist();
    if (await BK.phoneIsEmpty()) { const latest = await BK.findLatest(); if (latest) return { offered: true, latest, persisted }; }
    BK.daily();
    return { persisted };
  },
  offerAutoRestore(latest) {
    const i = latest.info;
    openSheet(`<h3>♻️ Restore your data? / ડેટા પાછો લાવવો છે?</h3>
      <div class="muted">The app is empty, but a backup was found on this phone. / એપ ખાલી છે, પણ ફોનમાં બેકઅપ મળ્યો છે.</div>
      <div class="okbox" style="margin:10px 0">Backup of <b>${esc(BK.fmt(new Date(i.createdAt)))}</b><br><span class="muted">${esc(latest.src)}</span>${BK.countsHtml(i.counts)}</div>
      <button class="btn block" id="arY">Restore now / હમણાં રિસ્ટોર કરો</button>
      <button class="btn sec block" id="arN">Not now / હમણાં નહીં</button>`, el => {
      $('#arY', el).onclick = e => busy(e.target, async () => { await BK.restore(latest.obj, { safety: false }); closeSheet(); toast('Data restored / ડેટા રિસ્ટોર થયો'); router(); });
      $('#arN', el).onclick = () => closeSheet();
    });
  },
  /** Validated restore with record-count confirmation. */
  confirmRestore(obj, srcLabel) {
    let info; try { info = BK.validate(obj); } catch (e) { alert(e.message); return; }
    openSheet(`<h3>Restore this backup? / આ બેકઅપ રિસ્ટોર કરવો?</h3>
      <div class="muted">${esc(srcLabel || '')}</div>
      <div class="okbox" style="margin:10px 0">Backup date / તારીખ: <b>${esc(info.createdAt ? BK.fmt(new Date(info.createdAt)) : 'unknown')}</b> · app v${esc(info.appVersion)}${BK.countsHtml(info.counts)}</div>${typeof DC !== 'undefined' ? DC.restoreWarning(obj) : ''}<div class="muted">Restoring into district: <b>${esc(DIST.info.en)}</b></div>
      <div class="warnbox">All data now on this phone will be <b>replaced</b>. A safety copy of the current data is saved first. / હાલનો ડેટા બદલાઈ જશે – પહેલાં સેફ્ટી કોપી સાચવાશે.</div>
      <button class="btn danger block" id="crY" style="margin-top:10px">Replace &amp; restore / રિસ્ટોર કરો</button>
      <button class="btn sec block" id="crN">Cancel / રદ કરો</button>`, el => {
      $('#crY', el).onclick = e => busy(e.target, async () => { if (typeof DC !== 'undefined' && DC.restoreWarning(obj) && !confirm('This backup looks like the OTHER district. Restore into ' + DIST.info.en + ' anyway?')) return; try { const r = await BK.restore(obj); closeSheet(); toast('Restored / રિસ્ટોર થયો' + (r.safety?.file ? ' · safety copy saved' : '')); go('#home'); } catch (err) { alert(err.message); } });
      $('#crN', el).onclick = () => closeSheet();
    });
  }
};
