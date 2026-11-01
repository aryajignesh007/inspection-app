'use strict';
/* Planned visits + WhatsApp alert + reminders (Local Notifications in the Android app). */
const VISIT_PURPOSES = [
  ['નિયમિત તપાસણી', 'Routine inspection'], ['આકસ્મિક તપાસણી', 'Surprise check'], ['ફરિયાદ અંગે તપાસ', 'Complaint enquiry'],
  ['સ્ટોક વેરિફિકેશન', 'Stock verification'], ['નવા પરવાના માટે સ્થળ તપાસ', 'Site check for new licence'], ['દારૂનાશની કામગીરી', 'Liquor destruction'], ['મીટીંગ', 'Meeting']
];
const V = {
  isNative: () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()),
  plugin: n => window.Capacitor?.Plugins?.[n],
  all: async () => (await DB.all('visits')).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))),
  async upcoming(limit = 99) { const t = todayStr(); return (await V.all()).filter(v => v.status === 'planned' && v.date >= t).slice(0, limit); },
  async inMonth(ym) { return (await V.all()).filter(v => v.status === 'planned' && v.date.startsWith(ym)); },
  waDigits(num) { let d = String(num || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; if (d.length === 11 && d[0] === '0') d = '91' + d.slice(1); return d; },
  dateGu(date) { const d = parseYmd(date); return `${guNum(d.getDate())} ${GU_MONTHS[d.getMonth()]} ${guNum(d.getFullYear())} (${GU_WDAYS[d.getDay()]}વાર)`; },
  dateEn(date) { return parseYmd(date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); },
  time12(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; },
  purposeEn: p => (VISIT_PURPOSES.find(x => x[0] === p) || [])[1] || '',
  /* The WhatsApp text: Gujarati first, English alongside. */
  message(v, lm, prof) {
    const L1 = [];
    L1.push('*નિરીક્ષણ મુલાકાત / Planned Visit*', '');
    L1.push(`📅 તારીખ / Date: ${V.dateGu(v.date)}`, `      ${V.dateEn(v.date)}`);
    if (v.time) L1.push(`⏰ સમય / Time: ${guNum(v.time)} કલાકે (${V.time12(v.time)})`);
    const lics = (v.licIds || []).map(id => lm[id]).filter(Boolean);
    lics.forEach((l, i) => {
      L1.push(`🏭 પરવાનેદાર / Licensee${lics.length > 1 ? ' ' + (i + 1) : ''}: ${l.name}`);
      const ls = (l.licences || []).filter(x => x.typeCode).map(x => x.typeCode + (x.licenceNo ? ' – ' + x.licenceNo : ''));
      if (ls.length) L1.push(`      પરવાનો / Licence: ${ls.join(', ')}`);
    });
    const place = v.place || [...new Set(lics.map(l => l.area).filter(Boolean))].join(', ');
    if (place) L1.push(`📍 સ્થળ / Place: ${place}`);
    if (v.purpose) L1.push(`🎯 હેતુ / Purpose: ${v.purpose}${V.purposeEn(v.purpose) ? ' (' + V.purposeEn(v.purpose) + ')' : ''}`);
    if (v.notes) L1.push(`📝 નોંધ / Notes: ${v.notes}`);
    L1.push('', `— ${[prof.designationGu, prof.deptGu, prof.placeGu].filter(Boolean).join(', ')}`);
    return L1.join('\n');
  },
  async waUrl(v) { const prof = await L.profile(), lm = await L.licenseeMap(); return `https://wa.me/${V.waDigits(prof.waNumber)}?text=${encodeURIComponent(V.message(v, lm, prof))}`; },
  async sendWhatsApp(v) {
    const url = await V.waUrl(v);
    v.alertSentAt = new Date().toISOString(); await DB.put('visits', v);
    const AL = V.plugin('AppLauncher');
    if (V.isNative() && AL) { try { await AL.openUrl({ url }); return url; } catch (e) { console.warn(e); } }
    const w = window.open(url, '_blank'); if (!w) location.href = url;
    return url;
  },
  /* ---- reminders ---- */
  async cancelReminders(v) {
    const LN = V.plugin('LocalNotifications'); if (!V.isNative() || !LN || !v.nid) return;
    try { await LN.cancel({ notifications: [{ id: v.nid * 10 + 1 }, { id: v.nid * 10 + 2 }] }); } catch (e) { console.warn(e); }
  },
  async scheduleReminders(v) {
    const LN = V.plugin('LocalNotifications'); if (!V.isNative() || !LN) return { ok: false, why: 'web' };
    const prof = await L.profile(); if (prof.remindersOn === false) return { ok: false, why: 'off' };
    try {
      let perm = await LN.checkPermissions(); if (perm.display !== 'granted') perm = await LN.requestPermissions();
      if (perm.display !== 'granted') return { ok: false, why: 'denied' };
      await V.cancelReminders(v);
      if (!v.nid) { const n = (await DB.getSetting('visitNid', 0)) + 1; await DB.setSetting('visitNid', n); v.nid = n; await DB.put('visits', v); }
      const lm = await L.licenseeMap(), who = (v.licIds || []).map(id => lm[id]?.name).filter(Boolean).join(', ') || v.place || 'visit';
      const at = (date, hm) => { const [h, m] = (hm || '08:00').split(':').map(Number); const d = parseYmd(date); d.setHours(h, m, 0, 0); return d; };
      const prev = ymd(new Date(parseYmd(v.date).getTime() - 864e5));
      const list = [
        { id: v.nid * 10 + 1, at: at(prev, prof.remindEvening || '19:00'), title: 'આવતીકાલે મુલાકાત / Visit tomorrow', body: `${who}${v.time ? ' · ' + V.time12(v.time) : ''} – tap to send WhatsApp alert` },
        { id: v.nid * 10 + 2, at: at(v.date, prof.remindMorning || '08:00'), title: 'આજે મુલાકાત / Visit today', body: `${who}${v.time ? ' · ' + V.time12(v.time) : ''} – tap to send WhatsApp alert` }
      ].filter(n => n.at > new Date());
      if (!list.length) return { ok: true, n: 0 };
      await LN.schedule({ notifications: list.map(n => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, smallIcon: 'ic_stat_batti', extra: { visitId: v.id } })) });
      return { ok: true, n: list.length };
    } catch (e) { console.warn(e); return { ok: false, why: e.message }; }
  },
  initNotifications() {
    const LN = V.plugin('LocalNotifications'); if (!V.isNative() || !LN) return;
    LN.addListener('localNotificationActionPerformed', a => { const id = a?.notification?.extra?.visitId; if (id) go('#visit/' + id + '?alert=1'); });
  },
  async markDone(v, extra = {}) { await V.cancelReminders(v); Object.assign(v, { status: 'done', doneAt: new Date().toISOString() }, extra); await DB.put('visits', v); },
  /* one tap: record as a tour day in the diary */
  async toTourDay(v) {
    const prof = await L.profile(), lm = await L.licenseeMap(), cur = (await DB.get('days', v.date)) || L.defaultDay(v.date, prof);
    const place = v.place || (v.licIds || []).map(id => lm[id]?.area).filter(Boolean)[0] || '';
    const work = /તપાસ/.test(v.purpose || '') || (v.licIds || []).length ? 'કચેરી+ તપાસણી' : (v.purpose || 'કચેરી+ તપાસણી');
    await DB.put('days', { ...cur, auto: false, date: v.date, kind: 'tour', work, from: cur.from && cur.from !== '-' ? cur.from : prof.fromCode, to: place || cur.to || '', vehicle: cur.vehicle || prof.vehicleCode, note: [cur.note, 'Planned visit: ' + (v.purpose || '')].filter(Boolean).join(' | ') });
    await V.markDone(v, { doneAs: 'tour' });
  }
};

/* ---------------- screens ---------------- */
const VISIT_ROUTES = ({
  async visits() {
    setTop('Planned visits', 'આયોજિત મુલાકાતો', true, `<button onclick="go('#visit/new')">＋ Plan</button>`);
    const all = await V.all(), lm = await L.licenseeMap(), t = todayStr();
    const up = all.filter(v => v.status === 'planned' && v.date >= t), past = all.filter(v => !(v.status === 'planned' && v.date >= t)).reverse().slice(0, 30);
    view().innerHTML = `<div class="card"><h3>Upcoming</h3>${visitList(up, lm) || '<div class="muted">No visits planned.</div>'}<button class="btn block" onclick="go('#visit/new')">＋ Plan a visit</button></div>
      <div class="card"><h3>Past / done</h3>${visitList(past, lm) || '<div class="muted">None</div>'}</div>`;
  },
  async visit(arg, qs) {
    if (arg === 'new' || (qs || '').includes('edit=1')) return visitForm(arg === 'new' ? null : arg, qs);
    const v = await DB.get('visits', arg); if (!v) { view().innerHTML = '<div class="card">Visit not found.</div>'; return; }
    const lm = await L.licenseeMap(), prof = await L.profile(), msg = V.message(v, lm, prof), url = await V.waUrl(v);
    const planned = v.status === 'planned', lics = (v.licIds || []).map(id => lm[id]).filter(Boolean);
    setTop('Planned visit', dmy(v.date) + (v.time ? ' · ' + V.time12(v.time) : ''), true, planned ? `<button onclick="go('#visit/${v.id}?edit=1')">Edit</button>` : '');
    view().innerHTML = `${(qs || '').includes('alert=1') && planned ? '<div class="card okbox">⏰ Reminder for this visit. Tap the green button to alert your work WhatsApp.</div>' : ''}
      <div class="card"><div class="row"><h3 style="margin:0">${esc(lics.map(l => l.name).join(', ') || v.place || 'Visit')}</h3><span class="pill ${planned ? '' : 'ok'}" style="flex:0">${planned ? 'Planned' : 'Done'}</span></div>
        <div class="kv" style="margin-top:8px"><div>Date</div><div class="gu">${esc(V.dateGu(v.date))}</div><div>Time</div><div>${esc(V.time12(v.time) || '-')}</div><div>Place</div><div>${esc(v.place || '-')}</div><div>Purpose</div><div class="gu">${esc(v.purpose || '-')}</div><div>Notes</div><div class="gu">${esc(v.notes || '-')}</div>
        <div>WhatsApp alert</div><div>${v.alertSentAt ? 'Opened ' + new Date(v.alertSentAt).toLocaleString('en-IN') : 'not sent yet'}</div></div></div>
      <div class="card"><button class="btn wa block" id="wa">🟢 Send WhatsApp alert</button><div class="muted" style="margin-top:6px">Opens WhatsApp to ${esc(prof.waNumber || '')} with the message below ready – just tap Send.</div>
        <pre class="wamsg gu" id="msg">${esc(msg)}</pre><button class="btn sec sm" id="cp">Copy text</button></div>
      ${planned ? `<div class="card"><h3>Done the visit?</h3><div class="muted">One tap converts this plan into your diary record.</div>
        ${lics.map(l => `<button class="btn acc block" data-insp="${l.id}">📝 Record inspection – ${esc(l.name)}</button>`).join('')}
        <button class="btn ${lics.length ? 'sec' : 'acc'} block" id="tour">🚗 Mark as tour day in diary (${dmy(v.date)})</button></div>` : `<div class="card"><button class="btn sec block" onclick="go('#day/${v.date}')">Open diary day ${dmy(v.date)}</button></div>`}
      <div class="card"><button class="btn danger block" id="del">Delete this plan</button></div>`;
    view().dataset.waUrl = url;
    $('#wa').onclick = async () => { await V.sendWhatsApp(v); };
    $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(msg); toast('Copied'); } catch { toast('Copy not allowed – select the text'); } };
    $$('[data-insp]').forEach(b => b.onclick = () => go(`#inspect/new?date=${v.date}&lic=${b.dataset.insp}&time=${encodeURIComponent(v.time || '')}&to=${encodeURIComponent(v.place || '')}&visit=${v.id}`));
    $('#tour') && ($('#tour').onclick = async () => { await V.toTourDay(v); toast('Diary updated – tour day'); go('#day/' + v.date); });
    $('#del').onclick = async () => { if (!confirm('Delete this planned visit?')) return; await V.cancelReminders(v); await DB.del('visits', v.id); toast('Deleted'); history.back(); };
  }
});
function visitList(vs, lm) {
  if (!vs.length) return '';
  return `<ul class="list">${vs.map(v => `<li onclick="go('#visit/${v.id}')"><div style="width:46px;text-align:center"><b>${+v.date.slice(8)}</b><div class="muted">${EN_MON3[+v.date.slice(5, 7) - 1]}</div></div><div class="main"><div class="t">${esc((v.licIds || []).map(id => lm[id]?.name).filter(Boolean).join(', ') || v.place || 'Visit')}</div><div class="s gu">${esc([V.time12(v.time), v.place, v.purpose].filter(Boolean).join(' · '))}</div></div><span class="pill ${v.status === 'done' ? 'ok' : ''}">${v.status === 'done' ? 'done' : v.alertSentAt ? '✓ WA' : 'planned'}</span></li>`).join('')}</ul>`;
}
async function visitForm(id, qs) {
  const params = new URLSearchParams(qs || ''), editing = id ? await DB.get('visits', id) : null;
  const t = todayStr(), tomorrow = ymd(new Date(Date.now() + 864e5));
  const v = editing || { id: uid(), date: params.get('date') && params.get('date') >= t ? params.get('date') : tomorrow, time: '11:00', licIds: params.get('lic') ? [params.get('lic')] : [], place: '', purpose: VISIT_PURPOSES[0][0], notes: '', status: 'planned' };
  const lics = (await DB.all('licensees')).sort((a, b) => a.name.localeCompare(b.name)), lm = Object.fromEntries(lics.map(l => [l.id, l]));
  setTop(editing ? 'Edit visit' : 'Plan a visit', 'મુલાકાતનું આયોજન', true);
  view().innerHTML = `<div class="card">
    <div class="grid2"><div><label>Date</label><input type="date" id="vd" min="${t}" value="${v.date}"></div><div><label>Time (optional)</label><input type="time" id="vt" value="${esc(v.time || '')}"></div></div><div class="muted" id="vhint"></div>
    <label>Licensee(s)</label><div class="chips" id="sel"></div><input id="vq" placeholder="Search ${lics.length} licensees…" autocomplete="off"><ul class="list" id="vres" style="max-height:200px;overflow:auto"></ul>
    <label>Place / સ્થળ</label><input id="vp" value="${esc(v.place || '')}" list="vpl" placeholder="auto from licensee area"><datalist id="vpl">${PLACE_PRESETS.map(p => `<option value="${p}">`).join('')}</datalist>
    <label>Purpose / હેતુ</label><div class="chips gu" id="purp">${VISIT_PURPOSES.map(([g, e]) => `<button class="chip" data-p="${esc(g)}">${esc(g)} <small>${esc(e)}</small></button>`).join('')}</div><input id="vpu" class="gu" value="${esc(v.purpose || '')}">
    <label>Notes / નોંધ</label><textarea id="vn" class="gu">${esc(v.notes || '')}</textarea>
    <button class="btn acc block" id="vsave">💾 Save plan</button></div>`;
  let sel = [...(v.licIds || [])];
  const drawSel = () => { $('#sel').innerHTML = sel.map(i => `<button class="chip on" data-x="${i}">${esc(lm[i]?.name || '?')} ✕</button>`).join('') || '<span class="muted">None picked (you can plan a place-only visit).</span>';
    $$('#sel [data-x]').forEach(b => b.onclick = () => { sel = sel.filter(x => x !== b.dataset.x); drawSel(); }); };
  const drawP = () => $$('#purp .chip').forEach(b => b.classList.toggle('on', b.dataset.p === $('#vpu').value));
  $$('#purp .chip').forEach(b => b.onclick = () => { $('#vpu').value = b.dataset.p; drawP(); }); $('#vpu').oninput = drawP;
  $('#vq').oninput = () => { const q = $('#vq').value.toLowerCase().trim(); if (!q) { $('#vres').innerHTML = ''; return; }
    $('#vres').innerHTML = lics.filter(l => (l.name + ' ' + (l.area || '')).toLowerCase().includes(q)).slice(0, 30).map(l => `<li data-id="${l.id}"><div class="main"><div class="t">${esc(l.name)}</div><div class="s">${esc(l.area || '')} · ${(l.licences || []).map(x => x.typeCode).join(', ')}</div></div></li>`).join('') || '<li class="muted">No match</li>';
    $$('#vres li[data-id]').forEach(li => li.onclick = () => { const l = lm[li.dataset.id]; if (!sel.includes(l.id)) sel.push(l.id); if (!$('#vp').value && l.area) $('#vp').value = l.area; $('#vq').value = ''; $('#vres').innerHTML = ''; drawSel(); }); };
  drawSel(); drawP();
  const prof0 = await L.profile(), hint = () => { const d = $('#vd').value; if (!d) return; const day = L.defaultDay(d, prof0); $('#vhint').innerHTML = day.kind === 'holiday' ? `⚠️ <span class="gu">${esc(day.work)}</span> – this is a holiday` : ''; };
  $('#vd').onchange = hint; hint();
  $('#vsave').onclick = async () => {
    const date = $('#vd').value; if (!date) return alert('Please pick the date');
    if (date < t && !confirm('This date is in the past. Save anyway?')) return;
    if (!sel.length && !$('#vp').value.trim()) return alert('Pick a licensee or enter a place');
    Object.assign(v, { date, time: $('#vt').value, licIds: sel, place: $('#vp').value.trim(), purpose: $('#vpu').value.trim(), notes: $('#vn').value.trim(), updatedAt: new Date().toISOString() });
    v.createdAt ||= v.updatedAt; await DB.put('visits', v);
    const r = await V.scheduleReminders(v), prof = await L.profile();
    const remTxt = r.ok ? (r.n ? `🔔 Reminders set: ${r.n === 2 ? 'evening before (' + (prof.remindEvening || '19:00') + ') and ' : ''}visit morning (${prof.remindMorning || '08:00'}).` : '')
      : r.why === 'web' ? 'ℹ️ Reminders work in the Android app only. In the browser, use the WhatsApp alert.' : r.why === 'off' ? '' : '⚠️ Reminder not set – allow notifications for Inspection App in phone settings.';
    history.replaceState(null, '', '#visit/' + v.id);
    openSheet(`<h3>Visit planned ✅</h3><div class="muted gu">${esc(V.dateGu(v.date))}${v.time ? ' · ' + esc(V.time12(v.time)) : ''}</div>${remTxt ? `<div class="muted" style="margin:8px 0">${remTxt}</div>` : ''}
      <button class="btn wa block" id="swa">🟢 Send WhatsApp alert</button><button class="btn sec block" id="snot">Not now</button>`, el => {
      $('#swa', el).onclick = async () => { await V.sendWhatsApp(v); closeSheet(); routes.visit(v.id); };
      $('#snot', el).onclick = () => { closeSheet(); routes.visit(v.id); }; });
  };
}
