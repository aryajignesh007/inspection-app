'use strict';
/* Google Drive sync (v1.5.0, keywords added in v1.6.0) – Android app + iPhone/web app share one JSON file in Sir's own Google Drive
   (hidden "appDataFolder": the app cannot see any other Drive file).
   Model: every record = store + its key (licensee id, inspection id, diary date, month, template code, setting key)
          + _u (updatedAt ISO) + _d (deviceId).  Deletes leave a tombstone {u,d}.  Merge = last-write-wins per record;
          when both phones changed the same record since their last sync, the loser is kept in a conflict log.        */
const LSK = k => (typeof DIST !== 'undefined' ? DIST.ls(k) : k);   // v1.7.0 per-district keys
const SYM = (() => {   // pure merge logic (no I/O) – unit-tested in node
  const SYNC_STORES = ['licensees', 'inspections', 'days', 'diaries', 'templates', 'licenceTypes', 'visits', 'settings', 'keywords', 'reminders', 'meetings', 'offices', 'pendency', 'staff', 'messages', 'receipts'];
  const KEYS = { settings: 'key', licensees: 'id', inspections: 'id', days: 'date', diaries: 'ym', templates: 'code', licenceTypes: 'code', visits: 'id', keywords: 'id', reminders: 'id', meetings: 'id', offices: 'id', pendency: 'id', staff: 'id', messages: 'id', receipts: 'id' };
  const LOCAL_SETTING = /^(bk\.|sync\.|team\.|visitNid$|lastBackup$)/;   // device bookkeeping – never synced
  const BASE_TS = '2000-01-01T00:00:00.000Z';                     // migrated (old) records: any real edit is newer
  const TOMB_DAYS = 365;
  const SEP = '|';
  const rid = (store, key) => store + SEP + key;
  const split = id => { const i = id.indexOf(SEP); return [id.slice(0, i), id.slice(i + 1)]; };
  const syncable = (store, rec) => SYNC_STORES.includes(store) && !(store === 'settings' && LOCAL_SETTING.test(String(rec?.key ?? rec)));
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => k !== '_u' && k !== '_d' && v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const same = (a, b) => stable(a) === stable(b);
  // version tuple of an entry (record or tombstone); deterministic total order so both phones pick the same winner
  const ver = e => e ? [e.u || BASE_TS, e.d || '', e.t ? 'T' : stable(e.r)] : null;
  function newer(a, b) { if (!b) return true; if (!a) return false; const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; }
  /** Build {id: entry} from local stores + tombstone list. entry = {r, u, d} or {t:1, u, d}. */
  function localState(dump, tombs) {
    const st = {};
    for (const s of SYNC_STORES) for (const r of dump[s] || []) { if (!syncable(s, r)) continue; st[rid(s, r[KEYS[s]])] = { r, u: r._u || BASE_TS, d: r._d || '' }; }
    for (const t of tombs || []) { const [s] = split(t.k); if (!SYNC_STORES.includes(s)) continue; const cur = st[t.k], e = { t: 1, u: t.u, d: t.d || '' }; if (!cur || newer(e, cur)) st[t.k] = e; }
    return st;
  }
  function docState(doc) {
    const st = {};
    for (const [id, r] of Object.entries(doc?.records || {})) st[id] = { r, u: r._u || BASE_TS, d: r._d || '' };
    for (const [id, t] of Object.entries(doc?.tombs || {})) { const e = { t: 1, u: t.u, d: t.d || '' }; if (!st[id] || newer(e, st[id])) st[id] = e; }
    return st;
  }
  /** Merge local + remote. since = ISO of this device's last successful sync ('' = never).
      Returns merged doc, local changes to apply, whether the remote must be uploaded, and new conflicts. */
  function merge(local, remoteDoc, { since = '', deviceId = '', deviceName = '', now = new Date().toISOString(), prune = true } = {}) {
    const rem = docState(remoteDoc), out = {}, apply = { put: [], del: [], tomb: [] }, conflicts = [];
    let upload = !remoteDoc;
    for (const id of new Set([...Object.keys(local), ...Object.keys(rem)])) {
      const l = local[id], r = rem[id], win = newer(l, r) ? l : r;
      out[id] = win;
      if (!r || r.u !== win.u || r.d !== win.d || !!r.t !== !!win.t) upload = true;
      if (win !== l && !(l && l.u === win.u && l.d === win.d && !!l.t === !!win.t)) {   // remote is newer -> change this phone
        const [s, k] = split(id);
        if (win.t) { if (l && !l.t) apply.del.push({ store: s, key: k, k: id, u: win.u, d: win.d }); else apply.tomb.push({ k: id, u: win.u, d: win.d }); }
        else apply.put.push({ store: s, rec: win.r, quiet: !!(l && !l.t && same(l.r, win.r)) });
      }
      // conflict: both sides changed after this phone's last sync, and they disagree
      if (l && r && since && l.u > since && r.u > since && l.d !== r.d && !(!!l.t === !!r.t && (l.t || same(l.r, r.r)))) {
        const lose = win === l ? r : l;
        conflicts.push({ id, at: now, kept: { u: win.u, d: win.d, deleted: !!win.t }, lost: { u: lose.u, d: lose.d, deleted: !!lose.t, record: lose.t ? null : lose.r } });
      }
    }
    const records = {}, tombs = {}; const cut = new Date(Date.parse(now) - TOMB_DAYS * 864e5).toISOString();
    for (const [id, e] of Object.entries(out)) { if (e.t) { if (!prune || e.u > cut) tombs[id] = { u: e.u, d: e.d }; } else records[id] = e.r; }
    const devices = { ...(remoteDoc?.devices || {}) }; if (deviceId) devices[deviceId] = { name: deviceName, lastSync: now };
    const conflictLog = [...conflicts, ...(remoteDoc?.conflicts || [])].slice(0, 200);
    if (conflicts.length) upload = true;
    const doc = { kind: 'inspection-app-sync', version: 1, updatedAt: now, updatedBy: deviceId, devices, records, tombs, conflicts: conflictLog };
    return { doc, apply, upload: upload || deviceChanged(remoteDoc, deviceId), conflicts, counts: { records: Object.keys(records).length, tombs: Object.keys(tombs).length } };
  }
  const entryVal = e => e.t ? null : e.r;
  const deviceChanged = (doc, dev) => !!dev && !doc?.devices?.[dev];
  /** One-time migration: give records without _u/_d a stable base stamp. Returns records to write. */
  function migrate(dump, deviceId) {
    const w = [];
    for (const s of SYNC_STORES) for (const r of dump[s] || []) if (syncable(s, r) && !r._u) w.push({ store: s, rec: { ...r, _u: r.updatedAt && r.updatedAt > BASE_TS && s !== 'settings' ? new Date(r.updatedAt).toISOString() : BASE_TS, _d: r._d || '' } });
    return w;
  }
  return { SYNC_STORES, KEYS, LOCAL_SETTING, BASE_TS, rid, split, syncable, stable, same, newer, localState, docState, merge, migrate };
})();

/* ---------------- Google Drive REST (appDataFolder) – fetch is injectable for tests ---------------- */
const GDRIVE = {
  fetch: (...a) => fetch(...a),
  async call(token, url, opt = {}) {
    const r = await GDRIVE.fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + token, ...(opt.headers || {}) } });
    if (r.status === 401) { const e = new Error('Google sign-in expired'); e.auth = true; throw e; }
    if (!r.ok) { let t = ''; try { t = await r.text(); } catch (e) {} const e = new Error(`Drive error ${r.status}: ${t.slice(0, 200)}`); e.status = r.status; throw e; }
    return r;
  },
  async find(token, name) {
    const q = encodeURIComponent(`name='${name}' and trashed=false`);
    const r = await GDRIVE.call(token, `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime,headRevisionId,size)&orderBy=modifiedTime desc`);
    return ((await r.json()).files || [])[0] || null;
  },
  async meta(token, id) { return (await GDRIVE.call(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=id,modifiedTime,headRevisionId,size`)).json(); },
  async download(token, id) { return (await GDRIVE.call(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json(); },
  async create(token, name, obj) {
    const b = 'insp' + Math.random().toString(36).slice(2);
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(obj)}\r\n--${b}--`;
    return (await GDRIVE.call(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime,headRevisionId', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body })).json();
  },
  async update(token, id, obj) {
    return (await GDRIVE.call(token, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id,modifiedTime,headRevisionId`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) })).json();
  }
};

/* ---------------- Sync engine + sign-in ---------------- */
const SY = {
  DEBOUNCE_MS: 20000, FAST_MS: 4000, FAST_STORES: ['inspections', 'visits', 'days', 'diaries'], _timer: null, _running: null, _applying: 0, raw: null, status: { state: 'idle' },
  // v1.6.1: the Google client ID + redirect ALWAYS come from config.js (a saved Setup value caused redirect_uri_mismatch)
  cfg() { const base = Object.assign({}, (typeof window !== 'undefined' && window.APP_CONFIG) || {}), o = { ...(SY._cfgOverride || {}) };
    delete o.GOOGLE_CLIENT_ID; delete o.OAUTH_REDIRECT_URL; const out = { ...base, ...o, GOOGLE_CLIENT_ID: base.GOOGLE_CLIENT_ID, OAUTH_REDIRECT_URL: base.OAUTH_REDIRECT_URL };
    if (typeof DIST !== 'undefined') out.SYNC_FILE_NAME = DIST.info.syncFile; if (base.SCOPES) out.DRIVE_SCOPE = base.SCOPES; return out; },
  async resetSetup() { SY._cfgOverride = null; await SY.rawPut('settings', { key: 'sync.cfg', value: null }); SY.signOutLocal(); localStorage.removeItem(LSK('sync.nonce')); },
  isNative: () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()),
  isIOS: () => /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  now: () => new Date().toISOString(),
  async deviceId() {
    let id = await DB.getSetting('sync.deviceId', null);
    if (!id) { id = (SY.isNative() ? 'and-' : SY.isIOS() ? 'ios-' : 'web-') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); await SY.rawPut('settings', { key: 'sync.deviceId', value: id }); }
    return id;
  },
  deviceName: () => SY.isNative() ? 'Android phone' : SY.isIOS() ? 'iPhone' : 'Browser',
  rawPut: (s, v) => SY.raw ? SY.raw.put(s, v) : DB.put(s, v),
  /** Wrap DB writes: stamp _u/_d on syncable records, tombstone deletes. Called once at start-up, BEFORE BK.init. */
  async hook() {
    if (SY.raw) return;
    SY.raw = { put: DB.put.bind(DB), putMany: DB.putMany.bind(DB), del: DB.del.bind(DB), clear: DB.clear.bind(DB), get: DB.get.bind(DB), all: DB.all.bind(DB) };
    const dev = await SY.deviceId();
    const stamp = (s, v) => (!SY._applying && v && SYM.syncable(s, v)) ? { ...v, _u: SY.now(), _d: dev } : v;
    DB.put = async (s, v) => { const r = await SY.raw.put(s, stamp(s, v)); SY.changed(s, v); return r; };
    DB.putMany = async (s, a) => { const r = await SY.raw.putMany(s, (a || []).map(v => stamp(s, v))); SY.changed(s, a?.[0]); return r; };
    DB.del = async (s, k) => { const r = await SY.raw.del(s, k); if (!SY._applying && SYM.syncable(s, k)) await SY.tomb(s, k, dev); SY.changed(s, k); return r; };
    DB.clear = async s => { if (!SY._applying && SYM.SYNC_STORES.includes(s)) { const old = await SY.raw.all(s); const now = SY.now(); const ts = old.filter(r => SYM.syncable(s, r)).map(r => ({ k: SYM.rid(s, r[SYM.KEYS[s]]), u: now, d: dev })); if (ts.length) await SY.raw.putMany('tombstones', ts); } return SY.raw.clear(s); };
  },
  async tomb(s, k, dev) { await SY.raw.put('tombstones', { k: SYM.rid(s, k), u: SY.now(), d: dev }); },
  changed(s, v) { if (SY._applying || s === 'tombstones' || (s === 'settings' && !SYM.syncable(s, v))) return; SY.markDirty(SY.FAST_STORES.includes(s) ? SY.FAST_MS : SY.DEBOUNCE_MS); },
  // v1.7.9: inspections / visits / diary sync ~4 s after save or delete (was 20 s)
  markDirty(ms) { SY._dirty = true; SY.rawPut('settings', { key: 'sync.dirty', value: true }).catch(() => {}); SY.schedule(ms); },
  schedule(ms) { if (!ms) ms = SY.DEBOUNCE_MS; clearTimeout(SY._timer); SY._timer = setTimeout(() => SY.auto('after-change'), ms); },
  /* ---- token handling ---- */
  token() { try { const t = JSON.parse(localStorage.getItem(LSK('sync.token')) || 'null'); return t && t.exp > Date.now() + 60000 ? t.access_token : null; } catch (e) { return null; } },
  saveToken(access_token, expires_in) { localStorage.setItem(LSK('sync.token'), JSON.stringify({ access_token, exp: Date.now() + (Number(expires_in) || 3600) * 1000 })); },
  signOutLocal() { localStorage.removeItem(LSK('sync.token')); },
  ready() { const c = SY.cfg(); return !!(c.GOOGLE_CLIENT_ID && (SY.isNative() || SY.isIOS() ? c.OAUTH_REDIRECT_URL : true)); },
  authUrl(redirect, state, hint) {
    const c = SY.cfg(), p = new URLSearchParams({ client_id: c.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'token', scope: c.DRIVE_SCOPE, include_granted_scopes: 'true', state, prompt: hint ? '' : 'consent' });
    if (hint) p.set('login_hint', hint); else p.delete('prompt');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + p; console.log('[sync] Google auth URL:', url, '| client_id=' + c.GOOGLE_CLIENT_ID, '| redirect_uri=' + redirect); return url;
  },
  /** Interactive sign-in. Android: system browser (Custom Tab) -> hosted oauth.html -> back into the app via custom scheme.
      iPhone home-screen app: full-page redirect (popups do not work there). Other browsers: Google Identity Services popup. */
  async signIn() {
    const c = SY.cfg(); if (!c.GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not set up yet (client ID missing). See the Google setup guide. / Google સેટઅપ બાકી છે.');
    const hint = (await DB.getSetting('sync.email', '')) || ((typeof DIST !== 'undefined' && (await DB.getSetting('team.role', 'admin')) === 'admin') ? DIST.info.admin : '');
    const nonce = Math.random().toString(36).slice(2);
    if (SY.isNative()) {
      if (!c.OAUTH_REDIRECT_URL) throw new Error('Hosted oauth.html address is missing (setup step 4).');
      localStorage.setItem(LSK('sync.nonce'), nonce);
      await Capacitor.Plugins.Browser.open({ url: SY.authUrl(c.OAUTH_REDIRECT_URL, 'app.' + nonce, hint), presentationStyle: 'popover' });
      return 'browser';
    }
    if (SY.isIOS() || !window.google?.accounts?.oauth2 && c.OAUTH_REDIRECT_URL && !(await SY.loadGis().then(() => true, () => false))) {
      const redirect = c.OAUTH_REDIRECT_URL || new URL('oauth.html', location.href).href;
      localStorage.setItem(LSK('sync.nonce'), nonce); location.href = SY.authUrl(redirect, 'web.' + nonce, hint); return 'redirect';
    }
    await SY.loadGis();
    return new Promise((ok, no) => {
      const tc = (console.log('[sync] GIS popup client_id=' + c.GOOGLE_CLIENT_ID), google.accounts.oauth2.initTokenClient)({ client_id: c.GOOGLE_CLIENT_ID, scope: c.DRIVE_SCOPE, hint: hint || undefined,
        callback: r => { if (r.error) return no(new Error(r.error_description || r.error)); SY.saveToken(r.access_token, r.expires_in); ok('token'); },
        error_callback: e => no(new Error(e.message || e.type || 'Sign-in closed')) });
      tc.requestAccessToken({ prompt: hint ? '' : 'consent' });
    });
  },
  loadGis: () => loadScript('https://accounts.google.com/gsi/client'),
  /** Token arriving back from oauth.html (web redirect) or the custom-scheme URL (Android). */
  acceptRedirect(fragment) {
    const p = new URLSearchParams(String(fragment || '').replace(/^#/, ''));
    const state = p.get('state') || '', nonce = localStorage.getItem(LSK('sync.nonce'));
    if (!p.get('access_token')) { if (p.get('error')) throw new Error('Google: ' + p.get('error')); return false; }
    if (!nonce || state.split('.')[1] !== nonce) throw new Error('Sign-in reply did not match – please try again.');
    localStorage.removeItem(LSK('sync.nonce')); SY.saveToken(p.get('access_token'), p.get('expires_in')); return true;
  },
  async fetchEmail(token) { try { const r = await GDRIVE.call(token, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)'); const u = (await r.json()).user || {}; if (u.emailAddress) await SY.rawPut('settings', { key: 'sync.email', value: u.emailAddress }); return u.emailAddress; } catch (e) { return null; } },
  /* ---- the sync itself ---- */
  async migrateLocal() {
    if (await DB.getSetting('sync.migrated', false)) return 0;
    const dev = await SY.deviceId(), w = SYM.migrate(await SY.dumpRaw(), dev);
    SY._applying++; try { const by = {}; w.forEach(x => (by[x.store] ||= []).push(x.rec)); for (const [s, a] of Object.entries(by)) await SY.raw.putMany(s, a); } finally { SY._applying--; }
    await SY.rawPut('settings', { key: 'sync.migrated', value: SY.now() }); return w.length;
  },
  async dumpRaw() { const o = {}; for (const s of SYM.SYNC_STORES) o[s] = await (SY.raw || DB).all(s); return o; },
  /** Full sync. Returns a summary; never leaves the DB half-applied for one record. */
  async run(reason = 'manual') {
    if (SY._running) return SY._running;
    SY._running = (async () => {
      const token = SY.token();
      if (!token) { SY.setStatus({ state: 'signin', reason }); return { needsSignIn: true }; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { SY.setStatus({ state: 'offline' }); return { offline: true }; }
      SY.setStatus({ state: 'syncing' });
      try {
        await SY.migrateLocal();
        const c = SY.cfg(), dev = await SY.deviceId(), last = await DB.getSetting('sync.last', null);
        if (!last && typeof BK !== 'undefined') { try { await BK.safety('first-sync'); } catch (e) { console.warn('safety', e); } }
        if (!(await DB.getSetting('sync.email', ''))) await SY.fetchEmail(token);
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          const file = await GDRIVE.find(token, c.SYNC_FILE_NAME);
          const remote = file ? await GDRIVE.download(token, file.id) : null;
          if (remote && remote.kind !== 'inspection-app-sync') throw new Error('Unexpected file in Drive app folder');
          const local = SYM.localState(await SY.dumpRaw(), await SY.raw.all('tombstones'));
          const m = SYM.merge(local, remote, { since: last?.at || '', deviceId: dev, deviceName: SY.deviceName() });
          if (m.upload) {
            if (file) { const now = await GDRIVE.meta(token, file.id); if (now.headRevisionId && file.headRevisionId && now.headRevisionId !== file.headRevisionId) continue; await GDRIVE.update(token, file.id, m.doc); }
            else await GDRIVE.create(token, c.SYNC_FILE_NAME, m.doc);
          }
          await SY.applyLocal(m.apply);
          result = { at: SY.now(), reason, received: m.apply.put.filter(x => !x.quiet).length + m.apply.del.length, sent: m.upload, conflicts: m.conflicts.length, records: m.counts.records };
          if (m.conflicts.length) { const old = await DB.getSetting('sync.conflicts', []); await SY.rawPut('settings', { key: 'sync.conflicts', value: [...m.conflicts, ...old].slice(0, 100) }); }
          break;
        }
        if (!result) throw new Error('Drive file kept changing – will retry');
        await SY.rawPut('settings', { key: 'sync.last', value: result });
        await SY.rawPut('settings', { key: 'sync.dirty', value: false }); SY._dirty = false;
        SY.setStatus({ state: 'ok', last: result });
        if (result.received && typeof router === 'function' && !SY._quietRefresh) try { router(); } catch (e) {}
        return result;
      } catch (e) {
        if (e.auth) { SY.signOutLocal(); SY.setStatus({ state: 'signin' }); return { needsSignIn: true }; }
        const offline = e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message);
        SY.setStatus({ state: offline ? 'offline' : 'error', error: e.message });
        return { error: e.message, offline };
      }
    })();
    try { return await SY._running; } finally { SY._running = null; }
  },
  async applyLocal(apply) {
    SY._applying++;
    try {
      const by = {}; for (const p of apply.put) (by[p.store] ||= []).push(p.rec);
      for (const [s, a] of Object.entries(by)) await SY.raw.putMany(s, a);
      for (const d of apply.del) { await SY.raw.del(d.store, d.key); if (/^\d+$/.test(d.key)) await SY.raw.del(d.store, Number(d.key)); }
      const ts = [...apply.del.map(d => ({ k: d.k, u: d.u, d: d.d })), ...(apply.tomb || [])]; if (ts.length) await SY.raw.putMany('tombstones', ts);
    } finally { SY._applying--; }
    if ((apply.put.length || apply.del.length) && typeof BK !== 'undefined') BK.schedule();
  },
  async auto(reason) { if (!(await DB.getSetting('sync.enabled', false))) return null; if (!SY.token()) { SY.setStatus({ state: 'signin' }); return null; } return SY.run(reason); },
  setStatus(s) { SY.status = s; try { document.dispatchEvent(new CustomEvent('syncstatus', { detail: s })); } catch (e) {} },
  async init() {
    await SY.hook();
    const ov = await DB.getSetting('sync.cfg', null);
    if (ov && (ov.GOOGLE_CLIENT_ID || ov.OAUTH_REDIRECT_URL)) { const o2 = { ...ov }; delete o2.GOOGLE_CLIENT_ID; delete o2.OAUTH_REDIRECT_URL; console.log('[sync] removed saved client ID / redirect override', ov); await SY.rawPut('settings', { key: 'sync.cfg', value: Object.keys(o2).length ? o2 : null }); SY._cfgOverride = Object.keys(o2).length ? o2 : null; } else if (ov) SY._cfgOverride = ov;
    if (location.hash.includes('access_token=')) { try { if (SY.acceptRedirect(location.hash)) { await SY.rawPut('settings', { key: 'sync.enabled', value: true }); history.replaceState(null, '', location.pathname + '#sync'); } } catch (e) { alert(e.message); } }
    try { const pend = localStorage.getItem(LSK('sync.pendingFragment')); if (pend) { localStorage.removeItem(LSK('sync.pendingFragment')); if (SY.acceptRedirect(pend)) await SY.rawPut('settings', { key: 'sync.enabled', value: true }); } } catch (e) { console.warn(e); }
    if (SY.isNative() && Capacitor.Plugins.App) {
      Capacitor.Plugins.App.addListener('appUrlOpen', async ({ url }) => {
        if (!String(url).startsWith(SY.cfg().APP_SCHEME + '://oauth')) return;
        try { Capacitor.Plugins.Browser?.close().catch(() => {}); if (SY.acceptRedirect(url.split('#')[1] || url.split('?')[1] || '')) { await SY.rawPut('settings', { key: 'sync.enabled', value: true }); toast('Google Drive connected / જોડાયું'); await SY.run('signin'); if (typeof router === 'function') router(); } } catch (e) { alert(e.message); }
      });
      Capacitor.Plugins.App.addListener('resume', () => SY.auto('resume'));
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) SY.auto('open'); else if (SY._dirty) SY.auto('leave'); });
    window.addEventListener('online', () => SY.auto('online'));
    SY.migrateLocal().catch(e => console.warn('migrate', e));
    setTimeout(() => SY.auto('open'), 1500);
  },
  fmt(iso) { return iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never / ક્યારેય નહીં'; }
};
if (typeof module !== 'undefined') module.exports = { SYM, GDRIVE, SY };
