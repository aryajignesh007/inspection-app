'use strict';
/* v1.7.0 Team: staff register (licence types + place per officer), team chat with read receipts, Google Meet,
   monitoring board, district switcher.
   Transport: a "team folder" in the district Gmail's Google Drive, shared with every officer.
   Every phone writes ONLY its own file  member-<gmail>.json  (its messages, read receipts, inspection summary);
   Sir's phone also writes roster.json (staff register) and lic-<gmail>.json (each officer's licensees).
   One writer per file = no edit conflicts. Delivery happens whenever the app syncs (not real-time).          */
const TEAML = {   // pure logic (unit-tested in node)
  norm: s => String(s || '').trim().toLowerCase(),
  /** assigned item 'DS' covers DS1…DS7, 'FL' covers FL1/FL2/FL3, 'MA1' is exact */
  typeMatches(code, assigned) { const c = normCode(code); return (assigned || []).some(a => { const x = normCode(a); return x === c || (/^[A-Z]+$/.test(x) && c.replace(/\d+$/, '') === x) || (x === 'MA12' && /^MA[12]$/.test(c)) || (c === 'MA12' && /^MA[12]$/.test(x)); }); },
  placeMatch(l, place) { const p = TEAML.norm(place); if (!p) return true; return [l.area, l.district, l.address, l.taluka, l.city].some(v => TEAML.norm(v).includes(p)); },
  /** licensees an officer handles: any active licence of an assigned type, inside the place of posting. Licences of other types are removed. */
  scope(lics, st) {
    if (!st) return lics;
    return lics.filter(l => TEAML.placeMatch(l, st.place)).map(l => ({ ...l, licences: (l.licences || []).filter(x => TEAML.typeMatches(x.typeCode, st.types)) })).filter(l => l.licences.length);
  },
  audience(msg, staff) { const act = staff.filter(s => s.active !== false && s.email); const to = msg.to || { type: 'all' };
    if (to.type === 'officer') return act.filter(s => TEAML.norm(s.email) === TEAML.norm(to.value));
    if (to.type === 'place') return act.filter(s => TEAML.norm(s.place) === TEAML.norm(to.value));
    return act; },
  visibleTo(msg, me, staff, all) {   // me = {email, admin}
    if (me.admin) return true; const e = TEAML.norm(me.email);
    if (TEAML.norm(msg.from) === e) return true;
    if (msg.replyTo) { const p = all.find(m => m.id === msg.replyTo); return !!p && (TEAML.norm(p.from) === e) && TEAML.norm(msg.to?.value) === e; }
    return TEAML.audience(msg, staff).some(s => TEAML.norm(s.email) === e);
  },
  receipts(msg, staff, receipts) { return TEAML.audience(msg, staff).map(s => { const r = receipts.find(x => x.msgId === msg.id && TEAML.norm(x.email) === TEAML.norm(s.email)); return { staff: s, at: r?.at || null }; }); },
  /** monitoring board numbers for one officer */
  officerStats(st, lics, ins, per) { const mine = TEAML.scope(lics, st); const s = DSH.licStats(mine, ins, per); return { ...s, licensees: mine.length }; },
  memberFile({ district, email, name, role, messages, receipts, ins, at }) {
    const e = TEAML.norm(email);
    return { kind: 'inspection-app-team', v: 1, district, email: e, name, role, at,
      messages: messages.filter(m => TEAML.norm(m.from) === e), receipts: receipts.filter(r => TEAML.norm(r.email) === e),
      ins: (ins || []).filter(i => !i.excluded).map(i => ({ id: i.id, date: i.date, licenseeId: i.licenseeId, typeCode: i.typeCode, violations: i.violations || '' })) };
  },
  fileName: (kind, email) => kind + (email ? '-' + TEAML.norm(email) : '') + '.json',
  officerLicFile: (lics, st) => ({ kind: 'inspection-app-team-lic', district: DIST.key, email: TEAML.norm(st.email), types: st.types || [], place: st.place || '', licensees: TEAML.scope(lics, st).map(({ _u, _d, ...l }) => l) }),
  meetEvent({ title, start, minutes = 45, emails, requestId, tz = 'Asia/Kolkata' }) {
    const end = new Date(start.getTime() + minutes * 60000), f = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    return { summary: title, description: 'Team meeting – Inspection App / ટીમ મીટીંગ', start: { dateTime: f(start), timeZone: tz }, end: { dateTime: f(end), timeZone: tz },
      attendees: [...new Set(emails.map(TEAML.norm).filter(Boolean))].map(email => ({ email })), conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } };
  }
};
const GAPI = {   // Google Drive (team folder, drive.file) + Calendar
  async call(url, opt) { const t = SY.token(); if (!t) { const e = new Error('Please sign in with Google first (More › Sync). / પહેલા Google સાઇન-ઇન કરો'); e.auth = true; throw e; } return GDRIVE.call(t, url, opt); },
  async json(url, opt) { return (await GAPI.call(url, opt)).json(); },
  q: s => encodeURIComponent(s),
  async createFolder(name) { return GAPI.json('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', appProperties: { district: DIST.key } }) }); },
  async share(folderId, email) { return GAPI.json(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions?sendNotificationEmail=true&emailMessage=${GAPI.q('Inspection App team folder – open the Inspection App and join with this code: ' + folderId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }) }); },
  async list(folderId) { return (await GAPI.json(`https://www.googleapis.com/drive/v3/files?q=${GAPI.q(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,modifiedTime,owners(emailAddress))&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`)).files || []; },
  async get(id) { return GAPI.json(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`); },
  async put(folderId, files, name, obj) {
    const ex = files.find(f => f.name === name);
    if (ex) return GAPI.json(`https://www.googleapis.com/upload/drive/v3/files/${ex.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
    const b = 'insp' + Math.random().toString(36).slice(2), body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(obj)}\r\n--${b}--`;
    return GAPI.json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
  },
  async createMeet(ev) { const r = await GAPI.json('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
    return { eventId: r.id, link: r.hangoutLink || r.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || '', htmlLink: r.htmlLink }; }
};
const TEAM = {
  /** start-up: finish a join that switched district, set up a new district's profile */
  async init() {
    try { const pj = JSON.parse(localStorage.getItem(DIST.ls('team.pendingJoin')) || 'null'); if (pj) { localStorage.removeItem(DIST.ls('team.pendingJoin')); await DB.setSetting('team.role', pj.role); if (pj.code) await DB.setSetting('team.folder', pj.code); } } catch (e) { console.warn(e); }
    if (DIST.key !== 'surat' && !(await DB.get('settings', 'profile'))) await L.saveProfile({ ...DEFAULT_PROFILE, placeGu: DIST.info.gu, waNumber: '' });
    document.addEventListener('syncstatus', e => { if (e.detail?.state === 'ok' && e.detail.last?.reason !== 'team') TEAM.sync('after-sync').then(r => { if (r?.received) REM.resyncAll(); }).catch(err => console.warn('team', err)); });
  },
  async role() { return DB.getSetting('team.role', 'admin'); },
  async myEmail() { return TEAML.norm((await DB.getSetting('sync.email', '')) || ((await TEAM.role()) === 'admin' ? DIST.info.admin : '')); },
  async me() { const role = await TEAM.role(), email = await TEAM.myEmail(); if (role === 'admin') return { admin: true, email, name: 'Sir (' + DIST.info.en + ')' };
    const st = (await DB.all('staff')).find(s => TEAML.norm(s.email) === email); return { admin: false, email, name: st?.name || email, staff: st }; },
  async scopeLicensees(lics) { const me = await TEAM.me(); return me.admin ? lics : TEAML.scope(lics, me.staff || { place: '', types: [] }); },
  async allTypes() { const rows = await L.abstractRows(), used = (await DB.all('licensees')).flatMap(l => (l.licences || []).map(x => normCode(x.typeCode)));
    return [...new Set(['MA1', 'MA2', 'DS', 'RS', 'FL', ...rows.flatMap(r => r.codes), ...used])].filter(Boolean); },
  when: iso => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
  async inboxForMe() { const me = await TEAM.me(); if (me.admin) return { unread: [] }; const [msgs, rec, staff] = await Promise.all(['messages', 'receipts', 'staff'].map(s => DB.all(s)));
    const mine = msgs.filter(m => !m.replyTo && TEAML.norm(m.from) !== me.email && TEAML.visibleTo(m, me, staff, msgs));
    return { unread: mine.filter(m => !rec.some(r => r.msgId === m.id && TEAML.norm(r.email) === me.email)).sort((a, b) => b.at.localeCompare(a.at)) }; },
  async markRead(msgId) { const e = await TEAM.myEmail(); await DB.put('receipts', { id: msgId + '|' + e, msgId, email: e, at: new Date().toISOString() }); TEAM.later(); },
  async post({ text, to, replyTo, kind = 'msg', meet }) { const me = await TEAM.me(); const m = { id: uid(), from: me.email, fromName: me.name, to: to || { type: 'all' }, text, replyTo: replyTo || '', kind, meet: meet || null, at: new Date().toISOString() }; await DB.put('messages', m); TEAM.later(); return m; },
  later() { clearTimeout(TEAM._t); TEAM._t = setTimeout(() => TEAM.sync('auto').catch(() => {}), 3000); },
  /** exchange files with the team folder */
  async sync(reason = 'manual') {
    const folder = await DB.getSetting('team.folder', ''); if (!folder) return { skipped: 'no folder' };
    if (!SY.token()) return { needsSignIn: true };
    if (TEAM._running) return TEAM._running;
    TEAM._running = (async () => {
      const me = await TEAM.me(); if (!me.email) await SY.fetchEmail(SY.token());
      const email = await TEAM.myEmail(), role = await TEAM.role();
      // Check folder identity BEFORE listing member data or uploading anything.
      const meta = await GAPI.json(`https://www.googleapis.com/drive/v3/files/${folder}?fields=id,name,appProperties`);
      if (meta.appProperties?.district ? meta.appProperties.district !== DIST.key : meta.name !== `Inspection App – ${DIST.info.en} team`) throw new Error('Wrong-district team folder. Open this district’s own team folder.');
      const files = await GAPI.list(folder);
      const rosterFile = files.find(f => f.name === 'roster.json');
      if (rosterFile) { const roster = await GAPI.get(rosterFile.id); if (roster.district !== DIST.key) throw new Error('Team roster belongs to another district. No data sent.'); }
      const [msgs, rec, ins, staff, lics] = await Promise.all(['messages', 'receipts', 'inspections', 'staff', 'licensees'].map(s => DB.all(s)));
      await GAPI.put(folder, files, TEAML.fileName('member', email), TEAML.memberFile({ district: DIST.key, email, name: me.name, role, messages: msgs, receipts: rec, ins, at: new Date().toISOString() }));
      if (role === 'admin') {
        await GAPI.put(folder, files, 'roster.json', { kind: 'inspection-app-team-roster', district: DIST.key, admin: email, at: new Date().toISOString(), staff: staff.map(({ _u, _d, ...s }) => s) });
        for (const st of staff.filter(s => s.active !== false && s.email)) await GAPI.put(folder, files, TEAML.fileName('lic', st.email), TEAML.officerLicFile(lics, st));
      }
      let got = 0; const put = async (store, rec2) => { const cur = await DB.get(store, rec2[DB.STORES[store]]); if (cur && SYM.same(cur, rec2)) return; await DB.put(store, rec2); got++; };
      for (const f of files) {
        if (/^member-/.test(f.name) && f.name !== TEAML.fileName('member', email)) {
          const d = await GAPI.get(f.id); if (d?.kind !== 'inspection-app-team' || d.district !== DIST.key) continue;
          for (const m of d.messages || []) await put('messages', m); for (const r of d.receipts || []) await put('receipts', r);
          if (role === 'admin') await SY.raw.put('teamdata', { id: d.email, name: d.name, at: d.at, ins: d.ins || [] });
        } else if (role !== 'admin' && f.name === 'roster.json') {
          const d = await GAPI.get(f.id); if (d?.kind === 'inspection-app-team-roster' && d.district === DIST.key) { for (const s of d.staff || []) await put('staff', s); await DB.setSetting('team.admin', d.admin); }
        } else if (role !== 'admin' && f.name === TEAML.fileName('lic', email)) {
          const d = await GAPI.get(f.id), h = JSON.stringify(d.licensees || []).length + ':' + (d.types || []).join(',') + ':' + d.place;
          if (d?.kind === 'inspection-app-team-lic' && d.district === DIST.key && (d.licensees || []).every(l => TJ.licenseeBelongs(l)) && h !== await DB.getSetting('team.licHash', '')) { await DB.clear('licensees'); await DB.putMany('licensees', d.licensees || []); await DB.setSetting('team.licHash', h); got++; }
        }
      }
      // meetings posted to the team chat appear in everyone's Meetings list
      const allMsgs = await DB.all('messages'), staff2 = await DB.all('staff'), me2 = await TEAM.me();
      for (const m of allMsgs.filter(x => x.kind === 'meet' && x.meet && TEAML.visibleTo(x, me2, staff2, allMsgs))) if (!(await DB.get('meetings', 'meet-' + m.id))) await DB.put('meetings', { id: 'meet-' + m.id, title: m.meet.title, date: m.meet.date, time: m.meet.time, place: 'Google Meet', meetLink: m.meet.link, notes: 'From ' + (m.fromName || m.from) });
      const res = { at: new Date().toISOString(), files: files.length, received: got, reason }; await DB.setSetting('team.last', res); return res;
    })();
    try { return await TEAM._running; } finally { TEAM._running = null; }
  },
  async startMeet({ title, date, time }) {
    const staff = (await DB.all('staff')).filter(s => s.active !== false && s.email); if (!staff.length) throw new Error('Add officers with their Gmail in the Staff register first.');
    const [h, m] = time.split(':').map(Number), start = new Date(parseYmd(date).setHours(h, m, 0, 0));
    const ev = TEAML.meetEvent({ title, start, emails: staff.map(s => s.email), requestId: uid() }); console.log('[meet] creating Calendar event', ev);
    const r = await GAPI.createMeet(ev); if (!r.link) throw new Error('Google did not return a Meet link');
    const meet = { title, date, time, link: r.link, eventId: r.eventId };
    const msg = await TEAM.post({ text: `🎥 ${title} – ${dmy(date)} ${time}\n${r.link}`, kind: 'meet', meet });
    await DB.put('meetings', { id: 'meet-' + msg.id, title, date, time, place: 'Google Meet', meetLink: r.link, notes: 'Calendar invitation sent to ' + staff.length + ' officers' });
    TEAM.sync('meet').catch(e => console.warn(e)); return meet;
  }
};
/* ---------- district switcher (top bar) ---------- */
function distBadge() { const b = document.getElementById('distBtn'); if (!b) return; b.textContent = '📍 ' + DIST.info.gu + ' ▾'; b.onclick = () => {
  openSheet(`<h3>District / જિલ્લો</h3><div class="muted">Each district has its own licence/inspection data, office Drive, backups, staff and chat. Only calendar tour days are shared on this phone.</div><ul class="list">${Object.values(DISTRICTS).map(d => `<li data-d="${d.key}" class="${DIST.canSwitch(d.key) ? '' : 'disabled'}"><span style="font-size:22px">${d.key === DIST.key ? '✅' : '📍'}</span><div class="main"><div class="t">${d.en} / <span class="gu">${d.gu}</span></div><div class="s">${esc(d.admin)}${DIST.canSwitch(d.key) ? '' : ' · 🔒 this phone joined ' + esc(DISTRICTS[DIST.locked()].en)}</div></div></li>`).join('')}</ul>`, c => {
    $$('li[data-d]', c).forEach(li => li.onclick = async () => { const k = li.dataset.d; if (k === DIST.key) return closeSheet(); try { if (BK.run) await BK.run('switch').catch(() => {}); DIST.switchTo(k); toast('Opening ' + DISTRICTS[k].en + '…'); location.hash = '#home'; setTimeout(() => location.reload(), 300); } catch (e) { alert(e.message); } }); }); }; }
/* ---------- screens ---------- */
const typeChips = (all, sel, attr = 'data-ty') => all.map(t => `<button type="button" class="chip ${sel.includes(t) ? 'on' : ''}" ${attr}="${esc(t)}">${esc(t)}</button>`).join('');
const TEAM_ROUTES = {
  async staff() {
    setTop('Staff register', 'કર્મચારી રજીસ્ટર – ' + DIST.info.gu, true, `<button onclick="go('#staffedit/new')">＋</button>`);
    const staff = (await DB.all('staff')).sort((a, b) => String(a.place).localeCompare(String(b.place)) || a.name.localeCompare(b.name)), folder = await DB.getSetting('team.folder', ''), lics = await DB.all('licensees');
    view().innerHTML = `<div class="card"><h3>Officers (${staff.length})</h3>${staff.length ? `<ul class="list">${staff.map(s => `<li onclick="go('#staffedit/${esc(s.id)}')"><span class="avatar">${esc((s.name || '?').slice(0, 1))}</span><div class="main"><div class="t">${esc(s.name)} <small class="muted">${esc(s.designation || '')}</small></div><div class="s">📍 ${esc(s.place || 'all places')} · ${esc(s.email || 'no Gmail')}</div><div class="chips" style="margin-top:4px">${(s.types || []).map(t => `<span class="chip on sm">${esc(t)}</span>`).join('')}<span class="pill">${TEAML.scope(lics, s).length} licensees</span>${s.active === false ? '<span class="pill bad">inactive</span>' : ''}</div></div></li>`).join('')}</ul>` : '<div class="muted">No officers yet.</div>'}
      <button class="btn block" onclick="go('#staffedit/new')">＋ Add officer</button></div>
      <div class="card"><h3>📁 Team folder (Google Drive)</h3>${folder ? `<div>Folder ready ✓ <span class="muted">· join code for officers:</span></div><div class="code">${esc(folder)}</div><div class="btns"><button class="btn" id="tshare">Share with all officers</button><button class="btn sec" id="tsync">Sync team now</button></div>` : `<div class="muted">Create one folder in ${esc(DIST.info.admin)}'s Drive. It is shared with the officers' Gmail so chat, read receipts, roster and each officer's licensees can travel.</div><button class="btn block" id="tmk">Create team folder</button>`}
      <div class="muted" id="tlast"></div></div>`;
    const last = await DB.getSetting('team.last', null); if (last) $('#tlast').textContent = 'Last team sync: ' + TEAM.when(last.at);
    $('#tmk') && ($('#tmk').onclick = e => busy(e.target, async () => { const f = await GAPI.createFolder(`Inspection App – ${DIST.info.en} team`); await DB.setSetting('team.folder', f.id); toast('Folder created'); TEAM_ROUTES.staff(); }));
    $('#tshare') && ($('#tshare').onclick = e => busy(e.target, async () => { let n = 0; for (const s of staff.filter(x => x.active !== false && x.email)) { await GAPI.share(folder, s.email); n++; } toast(`Shared with ${n} officers (Google emails them)`); }));
    $('#tsync') && ($('#tsync').onclick = e => busy(e.target, async () => { const r = await TEAM.sync('manual'); toast(r.needsSignIn ? 'Please sign in (More › Sync)' : `Team synced · ${r.received || 0} new`); TEAM_ROUTES.staff(); }));
  },
  async staffedit(id) {
    const s = id === 'new' ? { id: uid(), name: '', designation: 'નિરીક્ષક', email: '', phone: '', place: '', types: [], active: true } : await DB.get('staff', id); if (!s) return go('#staff');
    setTop(id === 'new' ? 'Add officer' : 'Officer', 'કર્મચારી', true);
    const types = await TEAM.allTypes(), sel = new Set(s.types || []), lics = await DB.all('licensees');
    view().innerHTML = `<div class="card gu"><label>Name / નામ</label><input id="sn" value="${esc(s.name)}"><label>Designation / હોદ્દો</label><input id="sd" value="${esc(s.designation || '')}" list="dsg"><datalist id="dsg"><option value="નિરીક્ષક"><option value="નાયબ અધિક્ષક"><option value="સબ ઇન્સ્પેક્ટર"><option value="ક્લાર્ક"></datalist>
      <label>Gmail (for team chat &amp; Meet)</label><input id="se" type="email" autocapitalize="off" value="${esc(s.email || '')}" placeholder="name@gmail.com"><label>Mobile</label><input id="sp" inputmode="tel" value="${esc(s.phone || '')}">
      <label>Place of posting / નિમણૂક સ્થળ</label><input id="spl" value="${esc(s.place || '')}" placeholder="e.g. Sachin, Bardoli (blank = whole district)">
      <label>Licence types handled / સંભાળતા પરવાના</label><div class="chips" id="sty">${typeChips(types, [...sel])}</div><div class="muted">“DS” covers DS-1…DS-7, “FL” covers FL-1/2/3, “RS” covers RS-1/2/6.</div>
      <div class="okbox" id="scnt" style="margin-top:8px"></div>
      <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="sa" style="width:auto" ${s.active !== false ? 'checked' : ''}> Active</label>
      <button class="btn block" id="save">Save</button>${id === 'new' ? '' : '<button class="btn danger block" id="del">Remove</button>'}</div>`;
    const cnt = () => { const st = { place: $('#spl').value, types: [...sel] }; $('#scnt').textContent = `This officer will see ${TEAML.scope(lics, st).length} of ${lics.length} licensees.`; };
    $$('#sty .chip').forEach(b => b.onclick = () => { const t = b.dataset.ty; sel.has(t) ? sel.delete(t) : sel.add(t); b.classList.toggle('on'); cnt(); }); $('#spl').oninput = cnt; cnt();
    $('#save').onclick = async () => { const e = TEAML.norm($('#se').value); if (!$('#sn').value.trim()) return alert('Name is required'); if (e && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) return alert('Please check the Gmail address');
      Object.assign(s, { name: $('#sn').value.trim(), designation: $('#sd').value, email: e, phone: $('#sp').value, place: $('#spl').value.trim(), types: [...sel], active: $('#sa').checked }); await DB.put('staff', s); TEAM.later(); toast('Saved'); go('#staff'); };
    $('#del') && ($('#del').onclick = async () => { if (!confirm('Remove this officer from the register?')) return; await DB.del('staff', s.id); go('#staff'); });
  },
  async team() {
    const me = await TEAM.me(), folder = await DB.getSetting('team.folder', '');
    setTop('Team chat', 'ટીમ – ' + DIST.info.gu, false, `<button id="tsy">⟳</button>`);
    if (!folder && !me.admin) return TEAM_ROUTES.join();
    const [msgs, rec, staff] = await Promise.all(['messages', 'receipts', 'staff'].map(s => DB.all(s)));
    const vis = msgs.filter(m => TEAML.visibleTo(m, me, staff, msgs)), top = vis.filter(m => !m.replyTo).sort((a, b) => b.at.localeCompare(a.at));
    const places = [...new Set(staff.map(s => s.place).filter(Boolean))].sort();
    const toLbl = t => !t || t.type === 'all' ? 'Everyone / બધા' : t.type === 'place' ? '📍 ' + t.value : '👤 ' + (staff.find(s => TEAML.norm(s.email) === TEAML.norm(t.value))?.name || t.value);
    view().innerHTML = `${!folder ? `<div class="card warnbox">Create the team folder in the <a href="#staff">Staff register</a> so messages can reach the officers.</div>` : ''}
      <div class="card"><h3>${me.admin ? 'New instruction / નવી સૂચના' : 'Message to Sir'}</h3>
      ${me.admin ? `<label>To</label><select id="tto"><option value="all">Everyone / બધા (${staff.filter(s => s.active !== false).length})</option>${places.map(p => `<option value="place:${esc(p)}">📍 ${esc(p)}</option>`).join('')}${staff.filter(s => s.email).map(s => `<option value="officer:${esc(s.email)}">👤 ${esc(s.name)}</option>`).join('')}</select>` : ''}
      <textarea id="ttx" class="gu" rows="3" placeholder="Type here… / અહીં લખો"></textarea><div class="btns"><button class="btn" id="tsend">Send ➤</button>${me.admin ? `<button class="btn acc" onclick="go('#meetnow')">🎥 Start team meeting</button>` : ''}</div>
      <div class="muted">Delivered when the phones sync (not instant).</div></div>
      ${top.map(m => { const reps = vis.filter(r => r.replyTo === m.id).sort((a, b) => a.at.localeCompare(b.at)), rs = me.admin ? TEAML.receipts(m, staff, rec) : [], read = rs.filter(x => x.at).length, mineRead = rec.some(r => r.msgId === m.id && TEAML.norm(r.email) === me.email);
        return `<div class="card msg ${m.kind === 'meet' ? 'meet' : ''}"><div class="row"><div class="main"><b>${esc(m.fromName || m.from)}</b> <span class="muted">→ ${esc(toLbl(m.to))} · ${esc(TEAM.when(m.at))}</span></div></div>
          <div class="gu mtext">${esc(m.text).replace(/(https:\/\/meet\.google\.com\/[\w-]+)/g, '<a href="$1" target="_blank">$1</a>')}</div>
          ${m.kind === 'meet' && m.meet?.link ? `<a class="btn acc sm" href="${esc(m.meet.link)}" target="_blank">🎥 Join meeting</a>` : ''}
          ${me.admin ? `<details class="rcpt"><summary>✓ Read by ${read}/${rs.length}</summary>${rs.map(x => `<div class="row"><span style="flex:1">${esc(x.staff.name)} <small class="muted">${esc(x.staff.place || '')}</small></span>${x.at ? `<span class="pill ok">✓ ${esc(TEAM.when(x.at))}</span>` : '<span class="pill warn">not yet</span>'}</div>`).join('')}</details>` : (TEAML.norm(m.from) !== me.email ? `<button class="btn ${mineRead ? 'sec' : ''} sm" data-read="${esc(m.id)}" ${mineRead ? 'disabled' : ''}>${mineRead ? 'Read ✓' : 'Mark Read ✓'}</button>` : '')}
          ${reps.map(r => `<div class="reply"><b>${esc(r.fromName || r.from)}</b> <span class="muted">${esc(TEAM.when(r.at))}</span><div class="gu">${esc(r.text)}</div></div>`).join('')}
          <div class="row"><input data-rin="${esc(m.id)}" placeholder="Reply… / જવાબ"><button class="btn sec sm" style="flex:0" data-rep="${esc(m.id)}">↩</button></div></div>`; }).join('') || '<div class="card muted">No messages yet.</div>'}`;
    KW.attach($('#ttx'), { cat: 'remark' });
    $('#tsy').onclick = async () => { const r = await TEAM.sync('manual').catch(e => ({ error: e.message })); toast(r.error || (r.needsSignIn ? 'Please sign in (More › Sync)' : r.skipped ? 'No team folder yet' : `Synced · ${r.received || 0} new`)); TEAM_ROUTES.team(); };
    $('#tsend').onclick = async () => { const text = $('#ttx').value.trim(); if (!text) return; let to = { type: 'all' };
      if (me.admin) { const v = $('#tto').value, i = v.indexOf(':'); if (i > 0) to = { type: v.slice(0, i), value: v.slice(i + 1) }; } else to = { type: 'officer', value: await DB.getSetting('team.admin', DIST.info.admin) };
      await TEAM.post({ text, to }); toast('Sent – delivered at next sync'); TEAM_ROUTES.team(); };
    $$('[data-read]').forEach(b => b.onclick = async () => { await TEAM.markRead(b.dataset.read); TEAM_ROUTES.team(); });
    $$('[data-rep]').forEach(b => b.onclick = async () => { const inp = $(`[data-rin="${b.dataset.rep}"]`), p = msgs.find(m => m.id === b.dataset.rep); if (!inp.value.trim()) return;
      await TEAM.post({ text: inp.value.trim(), replyTo: p.id, to: { type: 'officer', value: me.admin ? (TEAML.norm(p.from) === me.email ? '' : p.from) : p.from } }); if (!me.admin && TEAML.norm(p.from) !== me.email) await TEAM.markRead(p.id); TEAM_ROUTES.team(); });
  },
  async join() {
    setTop('Join team', 'ટીમમાં જોડાઓ', true);
    view().innerHTML = `<div class="card gu"><h3>This phone is used by / આ ફોન કોનો છે</h3><div class="seg" id="jr"><button data-r="admin">Sir (district admin)</button><button data-r="officer" class="on">Officer / અધિકારી</button></div>
      <label>District / જિલ્લો</label><select id="jd">${Object.values(DISTRICTS).map(d => `<option value="${d.key}" ${d.key === DIST.key ? 'selected' : ''}>${d.en} / ${d.gu}</option>`).join('')}</select>
      <label>Join code or folder link (from Sir's e-mail)</label><input id="jc" autocapitalize="off" placeholder="1AbC… or https://drive.google.com/drive/folders/…">
      <div class="muted">After joining, sign in with your own Gmail under More › Sync, then tap ⟳ in Team. An officer phone joins exactly one district.</div>
      <button class="btn block" id="jok">Join</button></div>`;
    let role = 'officer'; $$('#jr button').forEach(b => b.onclick = () => { role = b.dataset.r; $$('#jr button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#jok').onclick = async () => { const d = $('#jd').value, code = (/folders\/([\w-]+)/.exec($('#jc').value) || [, $('#jc').value.trim()])[1];
      if (role === 'officer' && !/^[\w-]{10,}$/.test(code || '')) return alert('Please paste the join code');
      if (d !== DIST.key) { localStorage.setItem(DISTRICTS[d].ls + 'team.pendingJoin', JSON.stringify({ role, code })); DIST.switchTo(d); if (role === 'officer') DIST.lock(d); location.hash = '#sync'; setTimeout(() => location.reload(), 300); return; }
      await DB.setSetting('team.role', role); if (code) await DB.setSetting('team.folder', code); if (role === 'officer') DIST.lock(d);
      toast('Joined ' + DISTRICTS[d].en); location.hash = '#sync'; setTimeout(() => location.reload(), 300); };
  },
  async meetnow() {
    setTop('Team meeting', 'Google Meet', true);
    const staff = (await DB.all('staff')).filter(s => s.active !== false && s.email), n = new Date(Date.now() + 5 * 60000);
    view().innerHTML = `<div class="card gu"><h3>🎥 Google Meet</h3><div class="muted">Creates a Google Calendar event with a Meet link in ${esc(DIST.info.admin)}'s calendar, invites ${staff.length} officers by Gmail, posts the link in Team chat and adds it to everyone's Meetings.</div>
      <label>Title / વિષય</label><input id="mt" value="Team meeting / ટીમ મીટીંગ"><button class="btn acc block" id="now">🎥 Start team meeting now</button>
      <div class="sec-title">or schedule / અથવા સમય નક્કી કરો</div><div class="grid2"><div><label>Date</label><input type="date" id="md" value="${todayStr()}"></div><div><label>Time</label><input type="time" id="mh" value="11:00"></div></div>
      <button class="btn block" id="sch">📅 Schedule meeting</button>
      <div class="sec-title">Invited (${staff.length})</div><div class="chips">${staff.map(s => `<span class="chip">${esc(s.name)}</span>`).join('') || '<span class="muted">Add officers with Gmail in the Staff register.</span>'}</div></div><div id="mres"></div>`;
    const run = (btn, date, time) => busy(btn, async () => { const m = await TEAM.startMeet({ title: $('#mt').value.trim() || 'Team meeting', date, time });
      $('#mres').innerHTML = `<div class="card okbox"><b>Meeting created ✓</b><div>${dmy(m.date)} ${esc(m.time)}</div><a class="btn acc block" href="${esc(m.link)}" target="_blank">Join ${esc(m.link.replace('https://', ''))}</a></div>`; });
    $('#now').onclick = e => run(e.target, ymd(n), pad(n.getHours()) + ':' + pad(n.getMinutes()));
    $('#sch').onclick = e => run(e.target, $('#md').value, $('#mh').value);
  },
  async monitor() {
    setTop('Monitoring board', 'દેખરેખ – ' + DIST.info.gu, true);
    const t = todayStr(), per = DSH.periods(t); S.mPer ||= 'fy'; const P = per[S.mPer];
    const [staff, lics, td, msgs, rec, own] = await Promise.all(['staff', 'licensees', 'teamdata', 'messages', 'receipts', 'inspections'].map(s => DB.all(s)));
    const act = staff.filter(s => s.active !== false), allIns = [...own, ...td.flatMap(d => d.ins || [])];
    const rows = act.map(s => { const d = td.find(x => TEAML.norm(x.id) === TEAML.norm(s.email)), ins = d?.ins || []; const st = TEAML.officerStats(s, lics, ins, P);
      const unread = msgs.filter(m => !m.replyTo && TEAML.audience(m, staff).some(x => x.id === s.id) && !rec.some(r => r.msgId === m.id && TEAML.norm(r.email) === TEAML.norm(s.email))).length; return { s, st, d, unread }; });
    const dist = DSH.licStats(lics, allIns, P), tot = rows.reduce((a, r) => ({ total: a.total + r.st.total, done: a.done + r.st.done }), { total: 0, done: 0 });
    view().innerHTML = `<div class="card"><div class="seg">${['fy', 'q', 'm'].map(k => `<button data-mp="${k}" class="${k === S.mPer ? 'on' : ''}">${esc(per[k].en)}</button>`).join('')}</div>
      <div class="stats" style="margin-top:10px"><div class="stat"><b>${act.length}</b><span>Officers</span></div><div class="stat"><b>${dist.done}/${dist.total}</b><span>District licences inspected</span></div><div class="stat"><b>${dist.total ? Math.round(100 * dist.done / dist.total) : 0}%</b><span>Done</span></div></div></div>
      <div class="dash">${rows.map(({ s, st, d, unread }) => `<div class="card"><div class="row"><span class="avatar">${esc(s.name.slice(0, 1))}</span><div class="main"><b>${esc(s.name)}</b> <small class="muted">${esc(s.designation || '')}</small><div class="muted">📍 ${esc(s.place || 'whole district')} · ${st.licensees} licensees</div></div>${DSH.svgDonut(st.done, st.total, { size: 64 })}</div>
        <div class="chips">${(s.types || []).map(x => `<span class="chip on sm">${esc(x)}</span>`).join('')}</div>
        ${DSH.svgBars(st.rows, { w: 320, bar: 14, gap: 6 })}
        <div class="muted">${st.done}/${st.total} inspected · ${st.pending} pending · ${unread ? `<span class="bad">${unread} instruction(s) unread</span>` : 'all instructions read ✓'} · last sync ${d ? esc(TEAM.when(d.at)) : '—'}</div></div>`).join('') || '<div class="card muted">Add officers in the Staff register.</div>'}</div>
      <div class="card"><h3>By licence type – whole district</h3>${DSH.svgBars(dist.rows)}<div class="muted">Includes your own inspections and those reported by officers.</div></div>`;
    $$('[data-mp]').forEach(b => b.onclick = () => { S.mPer = b.dataset.mp; TEAM_ROUTES.monitor(); });
  }
};
if (typeof module !== 'undefined') module.exports = { TEAML, TEAM, GAPI };
