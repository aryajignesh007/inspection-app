'use strict';
/* UI – small hash router, one render function per screen. */
const S = { ym: todayStr().slice(0, 7), weekStart: null, histYm: todayStr().slice(0, 7), licQ: '' };
const view = () => $('#view');
function setTop(title, sub = '', back = false, actions = '') {
  $('#title').textContent = title; $('#subtitle').textContent = sub; $('#backBtn').classList.toggle('hidden', !back); $('#topActions').innerHTML = actions;
}
function go(h) { location.hash = h; }
$('#backBtn').onclick = () => history.length > 1 ? history.back() : go('#home');
$$('#tabs button').forEach(b => b.onclick = () => go('#' + (b.dataset.tab === 'inspect' ? 'inspect/new' : b.dataset.tab)));
function openSheet(html, onMount) { const s = $('#sheet'); $('.sheet-card', s).innerHTML = html; s.classList.remove('hidden'); s.onclick = e => { if (e.target === s) closeSheet(); }; onMount && onMount($('.sheet-card', s)); }
function closeSheet() { $('#sheet').classList.add('hidden'); }
const kindPill = k => `<span class="pill ${k === 'holiday' ? 'warn' : k === 'tour' ? '' : k === 'leave' ? 'ok' : ''}">${DAY_KINDS[k]?.en || k}</span>`;
async function busy(btn, fn) { const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '⏳ Working…'; try { await fn(); } catch (e) { console.error(e); alert('Sorry, something went wrong: ' + e.message); } finally { btn.disabled = false; btn.innerHTML = t; } }

const routes = {
  /* ---------------- HOME ---------------- */
  async today() {
    const prof = await L.profile(), t = todayStr(), ym = t.slice(0, 7);
    setTop('Inspection App', 'નશાબંધી અને આબકારી – ' + (prof.placeGu || ''));
    const day = (await DB.get('days', t)) || L.defaultDay(t, prof);
    const c = await L.computeMonth(ym), due = (await L.dueList()).filter(d => d.overdue);
    const nLic = (await DB.all('licensees')).length, upv = await V.upcoming(5), lmap = upv.length ? await L.licenseeMap() : {};
    const bst = await BK.status(); const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    view().innerHTML = `
    <div class="card"><h3>${greet}, Sir</h3><div class="muted">${parseYmd(t).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div style="margin-top:10px" class="row"><div><div class="gu" style="font-weight:600">${esc(day.work)}</div><div class="muted">${day.kind === 'tour' ? esc(`${day.from} → ${day.to} · ${day.vehicle}`) : ''}</div></div><div style="flex:0">${kindPill(day.kind)}</div></div>
      <div class="chips gu" id="quick">${(await KW.list('work')).slice(0, 8).map(k => `<button class="chip" data-w="${esc(k.text)}" data-k="${k.kind || 'office'}">${esc(k.text)}</button>`).join('')}<button class="chip" onclick="go('#keywords/work')" title="Keywords">⚙</button></div>
      <button class="btn sec block" onclick="go('#day/${t}')">Edit today's diary entry</button></div>
    <div class="card ${bst.needsReminder ? 'warnbox' : ''}" onclick="go('#backup')" style="cursor:pointer;padding:10px 14px"><div class="row"><div>${bst.needsReminder ? '⚠️' : '💾'} <b>Last backup / છેલ્લો બેકઅપ:</b> ${esc(BK.fmt(BK.isNative() ? bst.lastAt : bst.offAt))}${bst.needsReminder ? '<br><span class="gu">બેકઅપ લેવા અહીં દબાવો · Tap to back up</span>' : ''}</div><div style="flex:0">›</div></div></div>
    ${await syncCard()}
    ${nLic ? '' : `<div class="card okbox">Lost your data or changed phone? <a href="#backup">Restore a backup / બેકઅપ રિસ્ટોર કરો</a></div>`}
    ${nLic ? '' : `<div class="card warnbox"><b>Start here, Sir:</b> load your existing data (licensees + inspections) from <a href="#import">More → Import data</a>, then fill in your name and letterhead under <a href="#settings">Settings</a>.</div>`}
    <div class="card"><h3>${esc(monthLabelEn(ym))} <small class="gu">${esc(monthLabelGu(ym))}</small></h3>
      <div class="stats"><div class="stat"><b>${c.summary.working}</b><span>Working days</span></div><div class="stat"><b>${c.summary.travel}</b><span>Tour days</span></div><div class="stat"><b>${c.ins.length}</b><span>Inspections</span></div></div>
      <div class="btns"><button class="btn" onclick="go('#month/${ym}')">📄 Monthly diary</button><button class="btn sec" onclick="go('#week')">🗓 Weekly diary</button></div></div>
    <div class="card"><h3>Upcoming visits <small class="gu">આયોજિત મુલાકાતો</small></h3>${visitList(upv, lmap) || '<div class="muted">No visits planned.</div>'}
      <div class="btns"><button class="btn" onclick="go('#visit/new')">＋ Plan visit</button>${upv.length ? `<button class="btn sec" onclick="go('#visits')">All visits</button>` : ''}</div></div>
    <div class="card"><h3>Inspections due <small>(${due.length} overdue as per ધોરણ)</small></h3>
      ${due.length ? `<ul class="list">${due.slice(0, 6).map(d => `<li onclick="go('#lic/${d.lic.id}')"><div class="main"><div class="t">${esc(d.lic.name)}</div><div class="s">${esc(d.code)} · ${esc(d.row.std)} · last: ${d.lastDate ? dmy(d.lastDate) : 'never'}</div></div><span class="pill bad">${d.due ? 'due ' + dmy(d.due) : 'not inspected'}</span></li>`).join('')}</ul>
      <button class="btn sec block" onclick="go('#due')">See all due inspections</button>` : '<div class="muted">Nothing overdue. 👍</div>'}</div>`;
    $$('#quick .chip').forEach(b => b.onclick = async () => { await saveDayQuick(t, b.dataset.w, b.dataset.k); routes.today(); });
  },
  async due() {
    setTop('Due inspections', 'પરવાના તપાસવાનું ધોરણ મુજબ', true);
    const all = await L.dueList();
    view().innerHTML = `<div class="card"><div class="muted">Based on the last inspection of each licence and its standard (દર માસે, દર બે માસે …).</div>
      <ul class="list">${all.map(d => `<li onclick="go('#lic/${d.lic.id}')"><div class="main"><div class="t">${esc(d.lic.name)}</div><div class="s">${esc(d.code)} · ${esc(d.row.std)} · last ${d.lastDate ? dmy(d.lastDate) : '—'}</div></div><span class="pill ${d.overdue ? 'bad' : 'ok'}">${d.due ? dmy(d.due) : 'never'}</span></li>`).join('') || '<li class="empty">No licences with a standard yet.</li>'}</ul></div>`;
  },
  /* ---------------- DIARY (calendar) ---------------- */
  async diary() {
    try { const t = await TJ.reconcile(); if (t.copied) toast(t.copied + ' tour day(s) matched with ' + DISTRICTS[TJ.otherKey()].en); } catch (e) { console.warn('[tour sync]', e); }
    const ym = S.ym, prof = await L.profile(), days = await L.monthDays(ym, prof);
    setTop('Diary', 'ડાયરી – ' + monthLabelGu(ym), false, `<button onclick="go('#week')">Week</button>`);
    const [y, m] = ym.split('-').map(Number), first = new Date(y, m - 1, 1).getDay();
    const insDates = new Set((await L.inspectionsIn(ym + '-01', ym + '-31')).map(i => i.date)), t = todayStr();
    const planned = {}; (await V.inMonth(ym)).forEach(v => (planned[v.date] ||= []).push(v));
    const xd = {}; try { (await XD.inRange(ym + '-01', ym + '-31')).forEach(x => (xd[x.date] ||= []).push(x)); } catch (e) { console.warn('[xdist]', e); }
    const xdName = XD.others().map(d => d.en).join(', ');
    view().innerHTML = `<div class="card"><div class="month-nav"><button id="pm">‹</button><b>${monthLabelEn(ym)}</b><button id="nm">›</button></div>
      <div class="days">${['S','M','T','W','T','F','S'].map(d => `<div class="dh">${d}</div>`).join('')}${'<div></div>'.repeat(first)}
      ${days.map(d => `<div class="day ${DAY_KINDS[d.kind]?.cls} ${d.date === t ? 'today' : ''} ${planned[d.date] ? 'planned' : ''}" data-d="${d.date}">${insDates.has(d.date) ? '<i class="dot"></i>' : ''}${xd[d.date] ? `<i class="xdot" title="${esc(xd[d.date].map(x => x.dEn + ': ' + x.name).join('; '))}"></i>` : ''}${planned[d.date] ? `<i class="pdot">${planned[d.date].length > 1 ? planned[d.date].length : ''}</i>` : ''}<b>${+d.date.slice(8)}</b>${calLabel(d, prof)}</div>`).join('')}</div>
      <div class="legend"><span><i style="background:#fff"></i>Office</span><span><i style="background:var(--yel)"></i>Tour</span><span><i style="background:var(--org)"></i>Holiday</span><span><i style="background:var(--blu)"></i>Leave</span><span><i style="background:var(--acc);border-radius:50%"></i>Inspection</span><span><i style="background:#7b1fa2;border-radius:50%"></i>${esc(xdName)} district</span><span><i style="background:#fff;border:2px dashed #1565c0"></i>Planned visit</span><span><i style="background:#fff;border-color:#7b1fa2"></i><b style="color:#7b1fa2">name</b> = optional holiday</span></div>
      <div class="btns"><button class="btn" id="plan">＋ Plan visit</button><button class="btn sec" onclick="go('#visits')">Planned visits</button></div></div>
      <div class="card"><h3>Monthly diary <small class="gu">માસિક ડાયરી</small></h3><div class="muted">Covering letter, day-wise table, તારીજ and licence abstract – same layout as your office diary.</div>
      <button class="btn block" onclick="go('#month/${ym}')">Preview &amp; export ${monthLabelEn(ym)}</button>
      <button class="btn sec block" id="dsync">⟳ Sync diary details / ડાયરી sync</button>
      <button class="btn sec block" onclick="go('#perf/${ym}')">Monthly performance report (portals) / માસિક કામગીરી</button>
      <button class="btn sec block" id="bulk">Fill several days at once…</button></div>`;
    $('#dsync').onclick = e => busy(e.target, async () => { const r = await TJ.preExport(); toast(r.msg); routes.diary(); });
    $('#pm').onclick = () => { S.ym = addMonths(S.ym, -1); routes.diary(); };
    $('#nm').onclick = () => { S.ym = addMonths(S.ym, 1); routes.diary(); };
    $$('.day[data-d]').forEach(el => el.onclick = () => go('#day/' + el.dataset.d));
    $('#bulk').onclick = () => bulkDays(ym);
    $('#plan').onclick = () => go('#visit/new' + (S.ym > t.slice(0, 7) ? '?date=' + S.ym + '-01' : ''));
  },
  async day(date) {
    const prof = await L.profile(), d = (await DB.get('days', date)) || L.defaultDay(date, prof);
    const ins = await L.inspectionsIn(date, date), lm = await L.licenseeMap(), dv = (await V.all()).filter(v => v.date === date);
    let xdl = []; try { xdl = await XD.inRange(date, date); } catch (e) { }
    setTop(dmy(date), GU_WDAYS[parseYmd(date).getDay()] + 'વાર', true);
    const gh = prof._hol?.[date], taken = (prof.optionalTaken || []).includes(date);
    const holBox = gh ? `<div class="card ${gh.public ? 'warnbox' : ''}" style="font-size:13px">${gh.public ? `🏛 <b>Government holiday</b> <span class="gu">${esc(gh.public.gu)}</span> – ${esc(gh.public.en)}` : ''}${gh.sunday ? `🏛 <span class="gu">${esc(gh.sunday.gu)}</span> (falls on Sunday)` : ''}
      ${gh.optional?.length ? `<div>🟣 <b>Optional holiday</b> (મરજીયાત): <span class="gu">${esc(gh.optional.map(o => o.gu).join(' / '))}</span> – ${esc(gh.optional.map(o => o.en).join(' / '))}</div>
      <button class="btn sec sm" id="optT" style="margin-top:6px">${taken ? '✓ Taken as optional holiday – undo' : 'I am taking this optional holiday'}</button>` : ''}</div>` : '';
    view().innerHTML = `${holBox}<div class="card gu">
      <label>Type of day</label><div class="seg" id="kind">${Object.entries(DAY_KINDS).map(([k, v]) => `<button data-k="${k}" class="${d.kind === k ? 'on' : ''}">${v.en}</button>`).join('')}</div>
      <label>કામગીરી (work)</label><input id="work" value="${esc(d.work)}" autocomplete="off">
      <div class="grid2"><div><label>From</label><input id="from" value="${esc(d.from)}"></div><div><label>To &amp; fro</label><input id="to" value="${esc(d.to)}" list="pl"><datalist id="pl">${PLACE_PRESETS.map(p => `<option value="${p}">`).join('')}</datalist></div>
      <div><label>Vehicle</label><input id="veh" value="${esc(d.vehicle)}" list="vl"><datalist id="vl"><option value="G">${(prof.vehicles || []).map(v => `<option value="${esc(v)}">`).join('')}</datalist></div><div><label>Km (for TA)</label><input id="km" inputmode="decimal" value="${esc(d.km || '')}"></div></div>
      <label>Note (not printed in monthly diary)</label><textarea id="note">${esc(d.note || '')}</textarea>
      <button class="btn sec sm" onclick="go('#keywords/work')" style="margin-top:8px">🏷 Keywords / કીવર્ડ્સ</button>
      <button class="btn block" id="save">Save</button>${d.auto ? '' : '<button class="btn danger block" id="reset">Reset to default</button>'}</div>
      <div class="card"><h3>Photos <small class="gu">ફોટા</small></h3><div class="muted">Stamped with date, time (IST) and GPS location. Printed as attachment pages after the diary.</div>
      <div class="phgrid" id="phg"></div><button class="btn block" id="phcap">📷 Capture photo</button>
      <div class="btns"><button class="btn sec" id="dpdf">Day diary PDF</button><button class="btn sec" id="dpr">Print day diary</button></div></div>
      <div class="card"><h3>Inspections on this day <span class="pill">${esc(DIST.info.en)}</span></h3>${ins.length ? `<ul class="list">${ins.map(i => `<li onclick="go('#insp/${i.id}')"><div class="main"><div class="t">${esc(lm[i.licenseeId]?.name || '-')}</div><div class="s">${esc(i.typeCode)} · ${esc(i.reportNo)}</div></div>${/^y/i.test(i.violations) ? '<span class="pill bad">violation</span>' : ''}</li>`).join('')}</ul>` : '<div class="muted">None</div>'}
      <button class="btn sec block" onclick="go('#inspect/new?date=${date}')">＋ Add inspection on ${dmy(date)}</button></div>${XD.html(xdl)}
      <div class="card"><h3>Planned visits <small class="gu">આયોજિત મુલાકાત</small></h3>${visitList(dv, lm) || '<div class="muted">None</div>'}${date >= todayStr() ? `<button class="btn sec block" onclick="go('#visit/new?date=${date}')">＋ Plan visit on ${dmy(date)}</button>` : ''}</div>`;
    let kind = d.kind;
    const setKind = k => { kind = k; $$('#kind button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); if (k !== 'tour') { $('#from').value = '-'; $('#to').value = '-'; $('#veh').value = ''; } else { if ($('#from').value === '-') $('#from').value = prof.fromCode || 'SRT'; if (!$('#veh').value) $('#veh').value = prof.vehicleCode || 'G'; if ($('#to').value === '-') $('#to').value = ''; } };
    $$('#kind button').forEach(b => b.onclick = () => setKind(b.dataset.k));
    const workKw = new Set((await KW.list('work')).map(k => k.text));
    await KW.attach($('#work'), { cat: 'work', sep: '+', always: true, onPick: (w, el, k) => {
      if (!el.value.trim() || workKw.has(el.value.trim()) || el.value.trim() === '-') { el.value = w; if (k) setKind(k); if (/ગાંધીનગર/.test(w)) $('#to').value = 'GNR'; return false; }
      if (k === 'tour' && kind !== 'tour') setKind('tour'); } });
    await KW.attach($('#note'), { cat: 'remark' });
    $('#save').onclick = async () => { await DB.put('days', { date, kind, work: $('#work').value, from: $('#from').value || '-', to: $('#to').value || '-', vehicle: $('#veh').value, km: $('#km').value, note: $('#note').value }); toast('Saved'); history.back(); };
    const phRender = async () => { const ps = await PH.forDate(date); $('#phg').innerHTML = ps.map((p, i) => `<img data-i="${i}" src="${PH.url(p)}" alt="Photo ${i + 1}">`).join('') || '<div class="muted" style="grid-column:1/-1">No photos</div>';
      $$('#phg img').forEach(im => im.onclick = () => { const p = ps[+im.dataset.i]; openSheet(`<div class="phview"><img src="${PH.url(p)}"><div style="font-size:12px">${esc(p.stamp)}<br>${(p.size / 1048576).toFixed(2)} MB · ${p.w}×${p.h}</div><div class="btns"><button class="btn danger" id="phdel">Delete photo</button><button class="btn sec" id="phx">Close</button></div></div>`, c => {
        $('#phx', c).onclick = closeSheet; $('#phdel', c).onclick = async () => { if (!confirm('Delete this photo?')) return; await DB.del('photos', p.id); closeSheet(); toast('Photo deleted'); phRender(); }; }); }); };
    await phRender();
    $('#phcap').onclick = e => busy(e.target, async () => { const r = await PH.capture(date); if (r) { toast(r.loc ? 'Photo saved' : 'Photo saved – location unavailable'); phRender(); } });
    const dayPages = async () => X.dayPages(date);
    $('#dpdf').onclick = e => busy(e.target, async () => saveFile(await X.pagesToPdf(await dayPages()), `Day-Diary-${date}.pdf`));
    $('#dpr').onclick = async () => X.printPages(await dayPages());
    $('#reset') && ($('#reset').onclick = async () => { await DB.del('days', date); toast('Reset'); routes.day(date); });
    $('#optT') && ($('#optT').onclick = async () => { const p2 = await L.profile(); const s = new Set(p2.optionalTaken || []); s.has(date) ? s.delete(date) : s.add(date); p2.optionalTaken = [...s]; await L.saveProfile(p2); if (d.auto) {} else if (confirm('This day has a saved entry. Reset it so the holiday is filled in automatically?')) await DB.del('days', date); routes.day(date); });
  },
  async week() {
    if (!S.weekStart) { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); S.weekStart = ymd(d); }
    const from = S.weekStart, to = ymd(new Date(parseYmd(from).setDate(parseYmd(from).getDate() + 6)));
    const w = await X.weekData(from, to);
    setTop('Weekly diary', 'સાપ્તાહિક ડાયરી', true);
    view().innerHTML = `<div class="card"><div class="month-nav"><button id="pw">‹</button><b>${dmy(from)} – ${dmy(to)}</b><button id="nw">›</button></div>
      <ul class="list gu">${w.days.map(d => `<li onclick="go('#day/${d.date}')"><div style="width:44px;text-align:center"><b>${+d.date.slice(8)}</b><div class="muted">${EN_MON3[+d.date.slice(5, 7) - 1]}</div></div><div class="main"><div class="t">${esc(d.work)}</div><div class="s">${d.kind === 'tour' ? esc(`${d.from} → ${d.to} · ${d.vehicle}`) : ''} ${(w.det[d.date] || []).map(esc).join(', ')}</div></div>${kindPill(d.kind)}</li>`).join('')}</ul></div>
      <div class="card"><h3>Export this week</h3><div class="btns"><button class="btn" id="wp">PDF</button><button class="btn" id="ww">Word</button><button class="btn" id="wx">Excel</button><button class="btn sec" id="wpr">Print</button></div></div>`;
    $('#pw').onclick = () => { S.weekStart = ymd(new Date(parseYmd(from).setDate(parseYmd(from).getDate() - 7))); routes.week(); };
    $('#nw').onclick = () => { S.weekStart = ymd(new Date(parseYmd(from).setDate(parseYmd(from).getDate() + 7))); routes.week(); };
    const nm = `Weekly-Diary-${from}-to-${to}`;
    $('#wp').onclick = e => busy(e.target, async () => (await TJ.gate()) && saveFile(await X.pagesToPdf([...await X.weekPages(w), ...PH.pages(await PH.inRange(from, to))]), nm + '.pdf'));
    $('#ww').onclick = e => busy(e.target, async () => (await TJ.gate()) && saveFile(await X.weekDocx(w), nm + '.docx'));
    $('#wx').onclick = e => busy(e.target, async () => (await TJ.gate()) && saveFile(X.weekXlsx(w), nm + '.xlsx'));
    $('#wpr').onclick = async () => X.printPages([...await X.weekPages(w), ...PH.pages(await PH.inRange(from, to))]);
  },
  /* ---------------- MONTHLY DIARY PREVIEW / EXPORT ---------------- */
  async month(ym) {
    S.ym = ym;
    const m = await L.monthForExport(ym), saved = (await DB.get('diaries', ym)) || { ym };
    setTop('Monthly diary', 'માહે-' + monthLabelGu(ym), true);
    const lm = await L.licenseeMap();
    view().innerHTML = `
    ${m.prof.officerNameGu === '(નામ)' ? '<div class="card warnbox">Your name for the signature is not set yet – <a href="#settings">open Settings</a>.</div>' : ''}
    ${m.unmapped.length ? `<div class="card warnbox">Inspections with licence type <b>${m.unmapped.map(esc).join(', ')}</b> are not linked to any abstract row. Link them under <a href="#abstract">Licence types &amp; abstract</a>.</div>` : ''}
    ${TJ.auditHtml(await TJ.audit())}
    <div class="card"><h3>Export <small>(${esc(monthLabelEn(ym))} · ${esc(DIST.info.en)})</small></h3>
      <button class="btn sec block" id="psync" style="margin-bottom:8px">⟳ Sync diary first / પહેલાં sync કરો</button><div class="muted" id="psyncMsg"></div>
      <label style="display:flex;gap:8px;align-items:center;color:var(--txt)"><input type="checkbox" id="annex" style="width:auto"> Add licence list (ULN) page to PDF / Print</label>
      <div class="btns"><button class="btn" id="ex">Excel</button><button class="btn" id="wd">Word</button><button class="btn" id="pdf">PDF</button><button class="btn sec" id="pr">Print</button></div>
      <div class="muted" style="margin-top:8px">Excel uses your office's own diary workbook layout (fonts, colours, Gujarati digits, page breaks).</div></div>
    <div class="card gu"><h3>Covering letter</h3><label>ક્રમાંક</label><input id="ref" value="${esc(m.refNo)}"><label>તારીખ line</label><input id="ldate" value="${esc(m.letterDate)}">
      <label style="display:flex;gap:8px;align-items:center;color:var(--txt)"><input type="checkbox" id="route" style="width:auto" ${m.showRoute ? 'checked' : ''}> Show From / To &amp; fro / Vehicle columns</label>
      <label style="display:flex;gap:8px;align-items:center;color:var(--txt)"><input type="checkbox" id="extra" style="width:auto" ${m.showExtra ? 'checked' : ''}> Show rows 5–6 of તારીજ (તાબાની કચેરી, પ્રચાર)</label></div>
    <div class="card gu"><h3>માહે-${esc(monthLabelGu(ym))}ની તારીજ <small>auto – edit if needed</small></h3>
      <table class="t">${SUMMARY_ROWS.map(r => `<tr><td class="l">${esc(r.label)}</td><td style="width:90px"><input data-s="${r.key}" value="${esc(m.summary[r.key])}"></td></tr>`).join('')}</table>
      <div class="muted" style="margin-top:6px">Auto: working = days − holidays − leave; tour days = yellow days; licences = column 5 total; defects = inspections with violations. Total km logged: ${m.km}.</div></div>
    <div class="card gu"><h3>માસિક ડાયરીનું એબ્સ્ટ્રેક્ટ</h3><div class="scroll-x"><table class="t"><tr><th>ક્રમ</th><th>પ્રકાર</th><th>કુલ (4)</th><th>માસ (5)</th><th>બાકી (6)</th><th>પ્રોગ્રેસીવ (7)</th></tr>
      ${['imp', 'main', 'minor', 'gen'].map(k => `<tr class="cat"><td colspan="6">${CATS[k]}</td></tr>` + m.abstract.filter(r => r.cat === k).map(r => `<tr data-k="${r.key}"><td>${esc(r.sr)}</td><td class="l">${esc(r.label)}</td><td><input data-a="total" inputmode="numeric" value="${r.total}" ${m.manual ? '' : 'readonly'} title="${esc(DIST.info.en)} e-Prohibition count"></td><td><input data-a="inspected" inputmode="numeric" value="${r.inspected}"></td><td><input data-a="remaining" inputmode="numeric" value="${r.remaining}"></td><td><input data-a="progressive" inputmode="numeric" value="${r.progressive}"></td></tr>`).join('')).join('')}</table></div>
      <div class="muted" style="margin-top:6px">બાકી = કુલ − પ્રોગ્રેસીવ (as in your Excel). Progressive counts licences inspected since ${DIST.key === 'valsad' && (DISTRICT_PROFILE.valsad || {}).chargeFrom ? '30 September 2026 (the day you took additional charge of Valsad)' : '1 April'}${(await L.abstractCfg()).baseline ? ' (or since the carry-forward month set under Licence types & abstract)' : ''}.</div>
      <div class="btns"><button class="btn sec" id="saveEd">Save edits</button><button class="btn danger" id="resetEd">Recalculate (clear edits)</button></div></div>
    <div class="card"><h3>Inspections this month (${m.ins.length})</h3><ul class="list">${m.ins.map(i => `<li onclick="go('#insp/${i.id}')"><div class="main"><div class="t">${esc(lm[i.licenseeId]?.name || '-')}</div><div class="s">${dmy(i.date)} · ${esc(i.typeCode)}</div></div>${/^y/i.test(i.violations) ? '<span class="pill bad">violation</span>' : ''}</li>`).join('') || '<li class="muted">None</li>'}</ul></div>`;
    const collect = async () => {
      const auto = await L.computeMonth(ym), o = { ym, summary: {}, abstract: {}, refNo: $('#ref').value, letterDate: $('#ldate').value, showRoute: $('#route').checked, showExtra: $('#extra').checked };
      $$('[data-s]').forEach(i => { if (String(auto.summary[i.dataset.s]) !== i.value) o.summary[i.dataset.s] = i.value; });
      $$('tr[data-k]').forEach(tr => { const k = tr.dataset.k, a = auto.abstract.find(r => r.key === k), ov = {};
        $$('[data-a]', tr).forEach(i => { const v = i.value === '' ? '' : Number(i.value); const autoV = i.dataset.a === 'remaining' ? Math.max(0, Number($('[data-a=total]', tr).value) - Number($('[data-a=progressive]', tr).value)) : a[i.dataset.a]; if (v !== autoV) ov[i.dataset.a] = v; });
        if (Object.keys(ov).length) o.abstract[k] = ov; });
      await DB.put('diaries', o); return o;
    };
    $('#saveEd').onclick = async () => { await collect(); toast('Edits saved for ' + monthLabelEn(ym)); };
    $('#resetEd').onclick = async () => { if (confirm('Clear your edits and recalculate this month?')) { await DB.del('diaries', ym); routes.month(ym); } };
    const fname = `Diary-${EN_MONTHS[+ym.slice(5) - 1]}-${ym.slice(0, 4)}`;
    $('#ex').onclick = e => busy(e.target, async () => { if (!(await TJ.gate())) return; await collect(); saveFile(await X.diaryXlsx(await L.monthForExport(ym)), fname + '.xlsx'); });
    $('#wd').onclick = e => busy(e.target, async () => { if (!(await TJ.gate())) return; await collect(); saveFile(await X.diaryDocx(await L.monthForExport(ym)), fname + '.docx'); });
    $('#pdf').onclick = e => busy(e.target, async () => { if (!(await TJ.gate())) return; await collect(); const mm = await L.monthForExport(ym); saveFile(await X.pagesToPdf([...await X.diaryPages(mm), ...await annex(mm), ...PH.pages(await PH.inRange(ym + '-01', ym + '-31'))]), fname + '.pdf'); });
    $('#psync').onclick = e => busy(e.target, async () => { const r = await TJ.preExport(); $('#psyncMsg').textContent = r.msg; toast(r.msg); });
    const annex = async mm => $('#annex').checked ? TJ.annexPages(mm) : [];
    $('#pr').onclick = async () => { if (!(await TJ.gate())) return; await collect(); const mm = await L.monthForExport(ym); X.printPages([...await X.diaryPages(mm), ...await annex(mm), ...PH.pages(await PH.inRange(ym + '-01', ym + '-31'))]); };
  },
  /* ---------------- INSPECTION FORM ---------------- */
  async inspect(arg, qs) {
    const editing = arg && arg !== 'new' ? await DB.get('inspections', arg) : null;
    const prof = await L.profile(), lics = (await DB.all('licensees')).sort((a, b) => a.name.localeCompare(b.name));
    const params = new URLSearchParams(qs || ''), visit = params.get('visit') ? await DB.get('visits', params.get('visit')) : null;
    const i = editing || { date: params.get('date') || todayStr(), time: params.get('time') || new Date().toTimeString().slice(0, 5), licenseeId: params.get('lic') || '', to: params.get('to') || '', typeCode: '', violations: 'No', vehicle: '', fields: [] };
    if (!editing && i.licenseeId && !i.typeCode) { const l0 = lics.find(l => l.id === i.licenseeId); if (l0?.licences?.length === 1) i.typeCode = l0.licences[0].typeCode; }
    setTop(editing ? 'Edit inspection' : 'New inspection', 'નિરીક્ષણ', true);
    const allCodes = [...new Set([...ABSTRACT_ROWS.flatMap(r => r.codes), ...(await DB.all('templates')).map(t => t.code), ...Object.keys(DEFAULT_TEMPLATES)])].sort();
    const T = id => `<span class="auto hidden" data-tag="${id}"></span>`;
    view().innerHTML = `<div class="card">
      ${editing ? '' : '<div class="autobar">Fields marked <span class="auto">auto</span> were filled for you from the licensee record, the last inspection, your profile or standard answers. Please check them; anything you change loses the tag.</div>'}
      <div class="grid2"><div><label>Date ${T('date')}</label><input type="date" id="date" value="${i.date}"></div><div><label>Time ${T('time')}</label><input type="time" id="time" value="${esc(i.time || '')}"></div></div>
      <label>Licensee</label><input id="licq" placeholder="Type to search ${lics.length} licensees…" value="${esc(lics.find(l => l.id === i.licenseeId)?.name || '')}" autocomplete="off">
      <ul class="list" id="licres" style="max-height:220px;overflow:auto"></ul>
      <button class="btn sec sm" id="newlic" style="margin-top:6px">＋ New licensee</button>
      <div id="licinfo"></div>
      <label>Licence type</label><div class="chips" id="codes"></div><input id="code" placeholder="e.g. MA1, FL2, RS2" value="${esc(i.typeCode)}" style="margin-top:6px">
      <label>Report No. ${T('rno')}</label><div class="row"><input id="rno" value="${esc(i.reportNo || '')}" placeholder="auto"><button class="btn sec sm" id="autoNo" style="flex:0">Auto</button></div>
      <div class="sec-title">Travel (goes into the diary)</div>
      <div class="grid2"><div><label>Place (To &amp; fro) ${T('to')}</label><input id="to" value="${esc(i.to || '')}" list="pl2"><datalist id="pl2">${PLACE_PRESETS.map(p => `<option value="${p}">`).join('')}</datalist></div>
      <div><label>Vehicle ${T('veh')}</label><input id="veh" value="${esc(i.vehicle || '')}" list="vl2" placeholder="${esc(prof.vehicles?.[0] || 'G')}"><datalist id="vl2">${(prof.vehicles || []).map(v => `<option value="${esc(v)}">`).join('')}</datalist></div></div>
      <label>Distance from office (km) ${T('km')}</label><div class="row"><input id="km" inputmode="decimal" value="${esc(i.distanceKm || '')}"><button class="btn sec sm" id="gps" style="flex:0;white-space:nowrap">📍 Use GPS</button></div><div class="muted" id="kmhint"></div>
      <div class="sec-title">Findings</div>
      <label>Violations found? / ક્ષતિ</label><div class="seg" id="viol"><button data-v="No">No</button><button data-v="Yes">Yes</button></div>
      <label>Violation details</label><textarea id="vnotes">${esc(i.violationNotes || '')}</textarea>
      <label>Rules applicable ${T('rules')}</label><input id="rules" value="${esc(i.rules || '')}" list="rl"><datalist id="rl">${PF_RULES.map(r => `<option value="${r[1]}">`).join('')}</datalist>
      <label>Remarks of Inspecting Officer</label><textarea id="rem">${esc(i.remarks || '')}</textarea>
      <label>Subordinate staff present ${T('staff')}</label><input id="staff" value="${esc(i.staff || '')}">
      <button class="btn sec sm" onclick="go('#keywords/insp')" style="margin-top:8px">🏷 Keywords / કીવર્ડ્સ</button>
      <div class="sec-title">Detailed form <span class="muted" style="text-transform:none" id="tplname"></span> <button type="button" class="btn sec sm" id="tplEdit" style="text-transform:none">✏️ Edit inspection template</button></div>
      <div class="row"><button class="btn sec sm" id="lastVisit">↺ Copy all answers from last visit</button><button class="btn sec sm" id="openAll">Open all sections</button></div><div id="form"></div>
      <button class="btn acc block" id="save">💾 Save inspection</button></div>`;
    let licId = i.licenseeId, viol = i.violations || 'No';
    const mainAuto = {}, autoKeys = {}, touched = new Set();
    const tag = (id, src, note) => { const t = $(`[data-tag="${id}"]`); if (!t) return; if (src) { mainAuto[id] = src; t.textContent = 'auto'; t.title = PF_SRC[src] + (note ? ' – ' + note : ''); t.classList.remove('hidden'); } else { delete mainAuto[id]; t.classList.add('hidden'); } };
    const setMain = (id, inputId, v, src, note) => { const el = $('#' + inputId); if (v == null || v === '') return; if (!el.value || mainAuto[id]) { el.value = v; tag(id, src, note); } };
    [['date', 'date'], ['time', 'time'], ['rno', 'rno'], ['to', 'to'], ['veh', 'veh'], ['km', 'km'], ['rules', 'rules'], ['staff', 'staff']].forEach(([t, id]) => $('#' + id).addEventListener('input', () => tag(t, null)));
    const setViol = v => { viol = v; $$('#viol button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); syncViol(); }; 
    const syncViol = () => $$('#form [data-f]').forEach(el => { if (/\|(violations found or not\?|is there any violations\?)$/i.test(el.dataset.f) && autoKeys[el.dataset.f]) el.value = viol; });
    $$('#viol button').forEach(b => b.onclick = () => setViol(b.dataset.v));
    const curLic = () => lics.find(x => x.id === licId);
    const missingOf = l => L.missingDetails(l);
    const showInfo = () => { const l = curLic(); if (!l) { $('#licinfo').innerHTML = ''; return; }
      const lc = PF.licenceFor(l, normCode($('#code').value)), miss = missingOf(l);
      $('#licinfo').innerHTML = `<div class="licinfo"><div><b>${esc(l.name)}</b> ${inactivePill(l)}</div>${lc && TJ.isInactive(lc) ? `<div class="warnline">⛔ ${esc(lc.typeCode)} licence inactive – ${esc(TJ.inactiveReason(lc))}</div>` : ''}<div class="muted">${esc([l.address, l.area, l.district].filter(Boolean).filter((v, n, a) => a.indexOf(v) === n).join(', ') || 'Address not recorded')}</div>
        ${lc ? `<div class="muted">${esc(lc.typeCode)} · ULN ${esc(lc.uln || lc.licenceNo || '(not recorded)')}${lc.currentLicenceNo ? ' · licence no. ' + esc(lc.currentLicenceNo) : ''}${lc.validity ? ' · valid ' + esc(lc.validity) : ''}</div>` : (l.licences || []).length ? `<div class="muted">${(l.licences || []).slice(0, 8).map(x => esc(x.typeCode) + ' · ULN ' + esc(x.uln || x.licenceNo || '–')).join('<br>')}</div>` : ''}
        ${l.authorisedPerson || l.contactPerson ? `<div class="muted">Authorised person: ${esc(l.authorisedPerson || l.contactPerson)}</div>` : ''}
        ${miss.length ? `<div class="warnline">⚠️ Missing in licensee record: ${miss.map(esc).join(', ')} – <a href="#licedit/${l.id}?ret=inspect">complete details</a></div>` : ''}</div>`; };
    const showCodes = () => { const l = curLic(); const cs = l ? [...new Set((l.licences || []).map(x => x.typeCode))] : [];
      $('#codes').innerHTML = (cs.length ? cs : allCodes.slice(0, 0)).map(c => `<button class="chip ${normCode($('#code').value) === c ? 'on' : ''}" data-c="${c}">${c}</button>`).join('') || '<span class="muted">Pick a licensee to see their licences, or type a code.</span>';
      $$('#codes .chip').forEach(b => b.onclick = () => { $('#code').value = b.dataset.c; refresh(); }); };
    const kmFor = () => { const l = curLic(); const k = L.distanceFor(l, prof); if (k) setMain('km', 'km', k, l?.lat ? 'system' : 'master', l?.lat ? 'GPS of licensee' : 'area km table'); $('#kmhint').textContent = l ? (l.lat ? 'Auto from licensee GPS location (straight line × road factor ' + (prof.roadFactor || 1.3) + ')' : 'Tip: at the site, tap “Use GPS” to save this licensee’s location for next time.') : ''; if (l) setMain('to', 'to', l.area || l.address, 'master'); };
    let ctx = null;
    async function prefillMain() {
      if (editing) return;
      const l = curLic(), code = normCode($('#code').value);
      ctx = await PF.context({ lic: l, code, prof, date: $('#date').value, time: $('#time').value, visit, excludeId: i.id });
      if (!i.date || params.get('date')) tag('date', visit ? 'visit' : 'system'); else tag('date', 'system');
      tag('time', visit && visit.time ? 'visit' : 'system');
      setMain('rules', 'rules', PF.codeFrom(PF_RULES, code), 'default', 'rules for ' + code);
      setMain('staff', 'staff', ctx.prev?.staff || ctx.prevAny?.staff, 'previous', ctx.prevAny ? 'from ' + dmy(ctx.prevAny.date) : '');
      setMain('veh', 'veh', ctx.prevAny?.vehicle || prof.vehicles?.[0], ctx.prevAny?.vehicle ? 'previous' : 'officer');
      if (l && code) setMain('rno', 'rno', await L.nextReportNo({ date: $('#date').value, typeCode: code }, l), 'system', 'next number in series');
    }
    const pick = id => { licId = id; const l = curLic(); $('#licq').value = l?.name || ''; $('#licres').innerHTML = ''; if (l && l.licences?.length === 1 && (!$('#code').value || !l.licences.some(x => x.typeCode === normCode($('#code').value)))) $('#code').value = l.licences[0].typeCode; refresh(); };
    async function refresh() { showCodes(); showInfo(); kmFor(); await prefillMain(); await renderForm(); }
    $('#licq').oninput = () => { const q = $('#licq').value.toLowerCase().trim(); if (!q) { $('#licres').innerHTML = ''; return; }
      $('#licres').innerHTML = lics.filter(l => (l.name + ' ' + (l.aka || []).join(' ') + ' ' + (l.area || '') + ' ' + (l.address || '')).toLowerCase().includes(q)).slice(0, 30).map(l => `<li data-id="${l.id}"><div class="main"><div class="t">${esc(l.name)}</div><div class="s">${esc(l.area || l.address || '')} · ${(l.licences || []).map(x => x.typeCode).join(', ')}</div></div>${inactivePill(l)}</li>`).join('') || '<li class="muted">No match – tap “New licensee”.</li>';
      $$('#licres li[data-id]').forEach(li => li.onclick = () => pick(li.dataset.id)); };
    $('#newlic').onclick = () => go('#licedit/new?ret=inspect');
    $('#code').oninput = () => refresh();
    $('#date').onchange = () => refresh();
    $('#autoNo').onclick = async () => { $('#rno').value = await L.nextReportNo({ date: $('#date').value, typeCode: normCode($('#code').value) }, curLic()); tag('rno', 'system'); };
    $('#gps').onclick = () => { if (!navigator.geolocation) return alert('GPS not available'); toast('Getting location…');
      navigator.geolocation.getCurrentPosition(async pos => { const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        $('#km').value = Math.round(haversineKm({ lat: prof.officeLat, lng: prof.officeLng }, here) * (prof.roadFactor || 1.3)); tag('km', 'system', 'GPS');
        const l = curLic(); if (l && confirm(`Save this location for ${l.name}?`)) { Object.assign(l, here); await DB.put('licensees', l); } toast('Distance ≈ ' + $('#km').value + ' km'); },
        e => alert('Could not get location: ' + e.message), { enableHighAccuracy: true, timeout: 15000 }); };
    let values = {}; (i.fields || []).forEach(f => values[(f.section || '') + '|' + f.label] = f.value);
    (editing?.autoFields || []).forEach(k => autoKeys[k] = 'saved');
    const grab = () => $$('#form [data-f]').forEach(el => values[el.dataset.f] = el.type === 'checkbox' ? (el.checked ? 'Yes' : '') : el.value);
    async function renderForm() {
      const code = normCode($('#code').value), tpl = (await DB.get('templates', code))?.fields || DEFAULT_TEMPLATES[code] || DEFAULT_TEMPLATES[code.replace(/\d+$/, '1')] || (code === 'MA12' ? DEFAULT_TEMPLATES.MA1 : null) || null;
      grab();
      const open = new Set($$('#form details[open]').map(d => d.dataset.s));
      const bg = ctx && !editing ? PF.background(ctx) : [];
      const fields = [...bg, ...(tpl || [])];
      $('#tplname').textContent = tpl ? `(${code} form, ${tpl.length} fields)` : '(no form for this type – only the fields above)';
      if (!fields.length) { $('#form').innerHTML = ''; return; }
      // auto-fill every field that you have not typed in yourself
      let nAuto = 0;
      for (const f of fields) {
        const k = (f.section || 'Details') + '|' + f.label;
        if (editing || touched.has(k)) continue;
        if (values[k] != null && values[k] !== '' && !autoKeys[k]) continue;
        const r = f.pre !== undefined ? f.pre : ctx ? PF.forField(f, ctx) : null;
        if (r) { values[k] = r.v; autoKeys[k] = r.src + (r.note ? ' – ' + r.note : ''); nAuto++; } else if (autoKeys[k]) { delete autoKeys[k]; values[k] = ''; }
      }
      const secs = {}; fields.forEach(f => (secs[f.section || 'Details'] ||= []).push(f));
      const tagH = k => autoKeys[k] ? `<span class="auto" title="${esc(PF_SRC[autoKeys[k].split(' – ')[0]] || autoKeys[k])}${autoKeys[k].includes(' – ') ? esc(' – ' + autoKeys[k].split(' – ').slice(1).join(' – ')) : ''}">auto${/^default/.test(autoKeys[k]) ? ' · default' : ''}</span>` : '';
      $('#form').innerHTML = Object.entries(secs).map(([s, fs]) => { const keys = fs.map(f => s + '|' + f.label), na = keys.filter(k => autoKeys[k]).length;
        return `<details class="fs" data-s="${esc(s)}" ${open.has(s) || s.startsWith('(0)') ? 'open' : ''}><summary>${esc(s)} <small class="muted">${na ? `· ${na} auto` : ''} · ${fs.length - na} to fill</small></summary><div class="in">${fs.map(f => { const k = s + '|' + f.label, v = values[k] ?? ''; const opts = Array.isArray(f.options) ? f.options.map(String) : [];
        const lab = `${esc(f.label)} ${tagH(k)}`;
        if (f.type === 'yesno') { const yo = opts.length ? opts : ['Yes', 'No', 'Not Applicable'], all = v && !yo.includes(v) ? [...yo, v] : yo; return `<label>${lab}</label><select data-f="${esc(k)}"><option value=""></option>${all.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; }
        if (f.type === 'number') return `<label>${lab}</label><input data-f="${esc(k)}" type="number" inputmode="decimal" value="${esc(v)}">`;
        if (f.type === 'photo') return `<label>${lab}</label><input type="hidden" data-f="${esc(k)}" value="${esc(v)}"><div class="te-photo">${/^data:image/.test(v) ? `<img src="${esc(v)}">` : ''}<input type="file" accept="image/*" capture="environment" data-ph="${esc(k)}"></div>`;
        if (f.type === 'checkbox' && opts.length <= 1) return `<label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" style="width:auto" data-f="${esc(k)}" ${v && v !== 'No' ? 'checked' : ''}>${lab}</label>`;
        if ((f.type === 'dropdown' || f.type === 'checkbox') && opts.length) { const all = v && !opts.includes(v) ? [...opts, v] : opts; return `<label>${lab}</label><select data-f="${esc(k)}"><option value=""></option>${all.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; }
        if (f.type === 'dropdown' && !opts.length) return `<label>${lab}</label><input data-f="${esc(k)}" list="yn" value="${esc(v)}">`;
        if (f.type === 'textarea') return `<label>${lab}</label><textarea data-f="${esc(k)}">${esc(v)}</textarea>`;
        return `<label>${lab}</label><input data-f="${esc(k)}" ${f.type === 'date' && /^\d{4}-\d\d-\d\d$/.test(v) ? 'type="date"' : ''} value="${esc(v)}">`; }).join('')}</div></details>`; }).join('') + '<datalist id="yn"><option value="Yes"><option value="No"><option value="Not Applicable"></datalist>';
      $$('#form input[data-f]:not([type=date]):not([type=checkbox]), #form textarea[data-f]').forEach(el => KW.attach(el, { cat: 'insp', code: () => normCode($('#code').value), field: el.dataset.f.split('|').slice(1).join('|') }));
      $$('#form [data-ph]').forEach(el => el.onchange = async () => { const f = el.files[0]; if (!f) return; try { const d = await TE.photoData(f), h = $$('#form [data-f]').find(x => x.dataset.f === el.dataset.ph); h.value = d; touched.add(h.dataset.f); let im = el.parentNode.querySelector('img'); if (!im) { im = document.createElement('img'); el.parentNode.prepend(im); } im.src = d; } catch (e) { alert(e.message); } });
      $$('#form [data-f]').forEach(el => { const ev = () => { touched.add(el.dataset.f); delete autoKeys[el.dataset.f]; const t = el.closest('label')?.querySelector('.auto') || el.previousElementSibling?.querySelector?.('.auto'); t && t.remove(); }; el.addEventListener('input', ev); el.addEventListener('change', ev); });
      syncViol();
    }
    $('#tplEdit').onclick = () => { const c = normCode($('#code').value); if (!c) return toast('Choose the licence type first'); if (!confirm('Open the form editor? Unsaved entries on this inspection will be lost.')) return; TE._st = null; go('#tpledit/' + encodeURIComponent(c)); };
    $('#openAll').onclick = () => $$('#form details').forEach(d => d.open = true);
    $('#lastVisit').onclick = async () => { if (!licId) return toast('Pick a licensee first');
      const prev = (await DB.all('inspections')).filter(x => x.licenseeId === licId && x.id !== i.id && (!$('#code').value || normCode(x.typeCode) === normCode($('#code').value))).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!prev) return toast('No earlier inspection found');
      (prev.fields || []).forEach(f => { const k = (f.section || '') + '|' + f.label; values[k] = f.value; autoKeys[k] = 'previous – copied from ' + dmy(prev.date); touched.delete(k); }); if (!$('#rules').value) $('#rules').value = prev.rules || ''; if (!$('#staff').value) $('#staff').value = prev.staff || '';
      const keepTouched = new Set(touched); touched.clear(); Object.keys(values).forEach(k => { if (autoKeys[k]?.startsWith('previous – copied')) keepTouched.add(k); });
      keepTouched.forEach(k => touched.add(k)); await renderForm(); toast('Copied from ' + dmy(prev.date)); };
    $('#save').onclick = async () => {
      if (!$('#date').value) return alert('Please enter the date');
      grab();
      const lc = PF.licenceFor(curLic(), normCode($('#code').value));
      const rec = Object.assign(editing || {}, { date: $('#date').value, time: $('#time').value, licenseeId: licId || null, typeCode: normCode($('#code').value), licenceNo: lc?.licenceNo || editing?.licenceNo || '', uln: lc?.uln || lc?.licenceNo || editing?.uln || '', licenseeAddress: curLic()?.address || editing?.licenseeAddress || '', licenseeArea: curLic()?.area || editing?.licenseeArea || '', district: DIST.key, to: $('#to').value, vehicle: $('#veh').value, distanceKm: $('#km').value,
        violations: viol, violationNotes: $('#vnotes').value, rules: $('#rules').value, remarks: $('#rem').value, staff: $('#staff').value, visitId: visit?.id || editing?.visitId,
        fields: Object.entries(values).filter(([, v]) => v !== '' && v != null).map(([k, v]) => { const [section, ...rest] = k.split('|'); return { section, label: rest.join('|'), value: v }; }),
        autoFields: Object.keys(autoKeys).filter(k => values[k] !== '' && values[k] != null) });
      rec.reportNo = $('#rno').value || await L.nextReportNo(rec, curLic());
      await L.saveInspection(rec);
      const vid = params.get('visit'); if (vid && !editing) { const pv = await DB.get('visits', vid); if (pv) { pv.inspectionIds = [...(pv.inspectionIds || []), rec.id]; const left = (pv.licIds || []).filter(x => !(pv.doneLics || []).concat(licId).includes(x)); pv.doneLics = [...(pv.doneLics || []), licId]; if (!left.length) await V.markDone(pv, { doneAs: 'inspection' }); else await DB.put('visits', pv); } }
      toast('Inspection saved – diary updated'); go('#insp/' + rec.id);
    };
    setViol(/^y/i.test(viol) ? 'Yes' : 'No');
    [['vnotes', 'Violation details'], ['rem', 'Remarks of Inspecting Officer'], ['staff', 'Subordinate staff present']].forEach(([id, f]) => KW.attach($('#' + id), { cat: 'insp', code: () => normCode($('#code').value), field: f }));
    await refresh();
  },
  async insp(id) {
    const i = await DB.get('inspections', id); if (!i) return go('#history');
    const lic = i.licenseeId ? await DB.get('licensees', i.licenseeId) : null, prof = await L.profile();
    setTop('Inspection', i.reportNo || '', true, `<button onclick="go('#inspect/${id}')">Edit</button>`);
    const f = (i.fields || []).filter(x => String(x.value ?? '').trim());
    view().innerHTML = `<div class="card"><h3>${esc(lic?.name || '—')}</h3><div class="kv">
      <div>Date</div><div>${dmy(i.date)} ${esc(i.time || '')}</div><div>Licence type</div><div>${esc(i.typeCode)}</div><div>Report No.</div><div>${esc(i.reportNo)}</div>
      <div>Place / vehicle</div><div>${esc([i.to, i.vehicle, i.distanceKm ? i.distanceKm + ' km' : ''].filter(Boolean).join(' · ') || '-')}</div>
      <div>Violations</div><div>${/^y/i.test(i.violations) ? '<span class="pill bad">Yes</span>' : '<span class="pill ok">No</span>'} ${esc(i.violationNotes || '')}</div>
      <div>Rules</div><div>${esc(i.rules || '-')}</div><div>Remarks</div><div>${esc(i.remarks || '-')}</div><div>Staff</div><div>${esc(i.staff || '-')}</div></div>
      ${i.flags?.length ? `<div class="warnbox" style="margin-top:8px">Imported record flagged: ${i.flags.map(esc).join('; ')}</div>` : ''}</div>
      ${f.length ? `<div class="card"><h3>Form details (${f.length})</h3><div class="kv">${f.map(x => `<div>${esc(x.label)}</div><div>${/^data:image\//.test(x.value) ? `<img src="${esc(x.value)}" style="max-width:100%;border-radius:8px">` : esc(x.value)}</div>`).join('')}</div></div>` : ''}
      <div class="card"><h3>Inspection report</h3><div class="btns"><button class="btn" id="ip">PDF</button><button class="btn" id="iw">Word</button><button class="btn" id="ix">Excel</button><button class="btn sec" id="ipr">Print</button></div>
      </div><div class="card"><h3>Lapse notice <small class="gu">ક્ષતિ અંગે નોટીસ</small></h3><div class="muted">Draft a Gujarati show-cause notice for a lapse found in this inspection (Word / PDF).</div><button class="btn ${/^y/i.test(i.violations) ? '' : 'sec'} block" onclick="go('#notice/${id}')">📝 Prepare notice</button>
      <button class="btn danger block" id="del">Delete inspection</button></div>`;
    const lm = { [i.licenseeId]: lic }, nm = 'Inspection-' + (i.reportNo || i.id).replace(/[\/\\\s]+/g, '_');
    const page = async () => [X.inspectionPage(i, lic, (await X.letterheadJpeg(prof)).dataUrl, prof)];
    $('#ip').onclick = e => busy(e.target, async () => saveFile(await X.pagesToPdf(await page()), nm + '.pdf'));
    $('#iw').onclick = e => busy(e.target, async () => saveFile(await X.inspectionDocx([i], lm, prof), nm + '.docx'));
    $('#ix').onclick = e => busy(e.target, async () => saveFile(X.inspectionXlsx([i], lm), nm + '.xlsx'));
    $('#ipr').onclick = async () => X.printPages(await page());
    $('#del').onclick = async () => { if (confirm('Delete this inspection? (The diary day entry stays.)')) { await DB.del('inspections', id); toast('Deleted'); history.back(); } };
  },
  async history() {
    const ym = S.histYm, lm = await L.licenseeMap(), [y, m] = ym.split('-').map(Number);
    const all = (await DB.all('inspections')).filter(i => i.date?.startsWith(ym)).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    setTop('Inspection register', 'નિરીક્ષણ હિસ્ટરી', true);
    view().innerHTML = `<div class="card"><div class="month-nav"><button id="pm">‹</button><b>${monthLabelEn(ym)}</b><button id="nm">›</button></div>
      <div class="btns"><button class="btn sm" id="rx">Register (Excel)</button><button class="btn sm" id="rw">All reports (Word)</button><button class="btn sm" id="rp">All reports (PDF)</button></div></div>
      <div class="card"><ul class="list">${all.map(i => `<li onclick="go('#insp/${i.id}')"><div class="main"><div class="t">${esc(lm[i.licenseeId]?.name || '—')}</div><div class="s">${dmy(i.date)} · ${esc(i.typeCode)} · ${esc(i.reportNo)}</div></div>${i.flags?.length ? '<span class="pill warn">check</span>' : ''}${/^y/i.test(i.violations) ? '<span class="pill bad">V</span>' : ''}</li>`).join('') || '<li class="empty">No inspections in this month.</li>'}</ul></div>`;
    $('#pm').onclick = () => { S.histYm = addMonths(ym, -1); routes.history(); }; $('#nm').onclick = () => { S.histYm = addMonths(ym, 1); routes.history(); };
    const list = [...all].reverse(), prof = await L.profile(), nm = `Inspections-${EN_MON3[m - 1]}-${y}`;
    $('#rx').onclick = e => busy(e.target, async () => saveFile(X.registerXlsx(list, lm, `Inspection register – ${monthLabelEn(ym)}`), nm + '-register.xlsx'));
    $('#rw').onclick = e => busy(e.target, async () => { if (!list.length) return toast('Nothing to export'); saveFile(await X.inspectionDocx(list, lm, prof), nm + '.docx'); });
    $('#rp').onclick = e => busy(e.target, async () => { if (!list.length) return toast('Nothing to export'); const lh = (await X.letterheadJpeg(prof)).dataUrl; saveFile(await X.pagesToPdf(list.map(i => X.inspectionPage(i, lm[i.licenseeId], lh, prof))), nm + '.pdf'); });
  },
  /* ---------------- LICENSEES ---------------- */
  async licensees() {
    const lics = (await DB.all('licensees')).sort((a, b) => a.name.localeCompare(b.name));
    setTop('Licensees', `લાયસન્સી – ${lics.length}`, false, `<button onclick="go('#licmissing')">⚠ Details</button><button onclick="go('#licedit/new')">＋ Add</button>`);
    view().innerHTML = `<div class="search"><input id="q" placeholder="Search name, area, licence type…" value="${esc(S.licQ)}"></div><div class="card"><ul class="list" id="ll"></ul></div>`;
    const draw = () => { const q = $('#q').value.toLowerCase().trim(); S.licQ = q;
      const f = lics.filter(l => !q || (l.name + ' ' + (l.area || '') + ' ' + (l.address || '') + ' ' + (l.licences || []).map(x => x.typeCode).join(' ')).toLowerCase().includes(q));
      $('#ll').innerHTML = f.slice(0, 200).map(l => `<li onclick="go('#lic/${l.id}')"><div class="main"><div class="t">${esc(l.name)}</div><div class="s">${esc(l.area || l.address || '')}</div></div><div>${inactivePill(l)}${[...new Set((l.licences || []).map(x => x.typeCode))].slice(0, 3).map(c => `<span class="pill">${esc(c)}</span>`).join(' ')}</div></li>`).join('') || '<li class="empty">No licensees yet. Add one, or import your old data from More → Import.</li>'; };
    $('#q').oninput = draw; draw();
  },
  async lic(id) {
    const l = await DB.get('licensees', id); if (!l) return go('#licensees');
    const ins = (await DB.all('inspections')).filter(i => i.licenseeId === id).sort((a, b) => b.date.localeCompare(a.date));
    const due = (await L.dueList()).filter(d => d.lic.id === id), miss = L.missingDetails(l);
    setTop(l.name, l.area || '', true, `<button onclick="go('#licedit/${id}')">Edit</button>`);
    const kv = (k, v) => `<div>${k}</div><div>${v || '<span class="muted">—</span>'}</div>`;
    view().innerHTML = `${miss.length ? `<div class="card warnbox" style="font-size:13px">⚠️ Missing: ${miss.map(esc).join(', ')}. These are needed to auto-fill inspection forms. <a href="#licedit/${id}">Complete details</a></div>` : ''}
      <div class="card"><div class="kv">${kv('Address', esc(l.address))}${kv('Area / GIDC', esc(l.area))}${kv('District', esc(l.district))}${kv('Authorised person / Nokarnama', esc(l.authorisedPerson || l.contactPerson))}${kv('Nokarnama holder', esc(l.nokarnamaHolder))}
      ${kv('Phone', l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : '')}${kv('Email', esc(l.email))}${kv('GSTIN', esc(l.gstin))}${kv('Storage / godown', esc(l.premises))}
      ${kv('Location', l.lat ? `${(+l.lat).toFixed(4)}, ${(+l.lng).toFixed(4)} <a href="https://maps.google.com/?q=${l.lat},${l.lng}" target="_blank" rel="noopener">map</a>` : 'not set')}${kv('Km from office', esc(L.distanceFor(l, await L.profile())))}
      ${l.aka?.length ? kv('Also written as', esc(l.aka.join('; '))) : ''}</div>
      <button class="btn acc block" onclick="go('#inspect/new?lic=${id}')">＋ New inspection</button></div>
      ${licInactive(l) ? `<div class="card warnbox">⛔ <b>Inactive</b> ${esc((l.licences || []).filter(x => TJ.isInactive(x)).map(x => x.typeCode + ' – ' + TJ.inactiveReason(x)).join('; '))}</div>` : ''}<div class="card"><h3>Licences</h3>${(l.licences || []).map(x => { const d = due.find(z => z.code === x.typeCode); return `<div class="lcbox"><div class="row"><b style="flex:1">${esc(x.typeCode)} ${esc(x.licenceNo || '')}</b>${TJ.isInactive(x) ? `<span class="pill bad" style="flex:0" title="${esc(TJ.inactiveReason(x))}">Inactive</span>` : ''}${!TJ.isInactive(x) && d ? `<span class="pill ${d.overdue ? 'bad' : 'ok'}" style="flex:0">${d.due ? 'due ' + dmy(d.due) : 'never inspected'}</span>` : ''}</div>
        <div class="kv">${kv('Validity', esc(x.validity))}${kv('Prohibited item', esc(x.prohibitedItems))}${kv('Purpose', esc([x.purpose, x.otherPurpose].filter(Boolean).join('; ')))}${kv('Possession limit', esc(x.possessionLimit))}${kv('Consumption limit', esc(x.consumptionLimit))}${kv('Last amendment', esc(x.lastAmendment))}${kv('Products (GPCB)', esc(x.productsGpcb))}${kv('Stored in', esc(x.storedIn))}</div></div>`; }).join('') || '<div class="muted">No licences recorded</div>'}</div>
      <div class="card"><h3>Inspection history (${ins.length})</h3><ul class="list">${ins.map(i => `<li onclick="go('#insp/${i.id}')"><div class="main"><div class="t">${dmy(i.date)} · ${esc(i.typeCode)}</div><div class="s">${esc(i.reportNo)}</div></div>${/^y/i.test(i.violations) ? '<span class="pill bad">V</span>' : ''}</li>`).join('') || '<li class="muted">None</li>'}</ul></div>`;
  },
  async licedit(id, qs) {
    const l = id === 'new' ? { id: uid(), name: '', district: 'Surat District', licences: [] } : await DB.get('licensees', id);
    setTop(id === 'new' ? 'New licensee' : 'Edit licensee', 'લાયસન્સી', true);
    const F = (k, lab, t = 'text') => `<label>${lab}</label><input id="f_${k}" type="${t}" value="${esc(l[k] ?? '')}">`;
    const LF = [['licenceNo', 'Licence no.'], ['validity', 'Validity (e.g. 01/04/2026 To 31/03/2027)'], ['prohibitedItems', 'Prohibited item(s)'], ['purpose', 'Purpose'], ['otherPurpose', 'Other purposes'], ['possessionLimit', 'Possession limit'], ['consumptionLimit', 'Consumption limit'], ['lastAmendment', 'Last amendment date'], ['productsGpcb', 'No. of products approved (GPCB)'], ['storedIn', 'Stored in (tank / drums …)']];
    const miss = new Set(L.missingDetails(l));
    view().innerHTML = `<div class="card">${F('name', 'Name *')}${F('address', 'Full address' + (miss.has('full address') ? ' <span class="pill warn">missing</span>' : ''))}${F('area', 'Area / GIDC')}${F('district', 'District')}
      ${F('authorisedPerson', 'Authorised person / Nokarnama holder name' + (miss.has('authorised person') ? ' <span class="pill warn">missing</span>' : ''))}${F('nokarnamaHolder', 'Nokarnama holder? (Yes/No)')}${F('phone', 'Phone' + (miss.has('phone') ? ' <span class="pill warn">missing</span>' : ''), 'tel')}${F('email', 'Email', 'email')}${F('gstin', 'GSTIN')}${F('premises', 'Storage / godown / premises')}
      <div class="grid2">${F('lat', 'Latitude')}${F('lng', 'Longitude')}</div>${F('distanceKm', 'Fixed km from office (optional)')}
      <label>Notes</label><textarea id="f_notes">${esc(l.notes || '')}</textarea>
      <div class="sec-title">Licences</div><div id="lcs"></div><button class="btn sec sm" id="addlc">＋ Add licence</button>
      <button class="btn block" id="save">Save</button>${id === 'new' ? '' : '<button class="btn danger block" id="del">Delete licensee</button>'}</div>`;
    const drawL = () => { $('#lcs').innerHTML = l.licences.map((x, n) => `<div class="lcbox"><div class="row"><input data-n="${n}" data-k="typeCode" placeholder="Type e.g. MA1" value="${esc(x.typeCode)}" style="flex:.6"><button class="btn danger sm" data-rm="${n}" style="flex:0">✕</button></div>
        <div class="grid2">${LF.map(([k, lab]) => `<div><label>${lab}${!x[k] && ['licenceNo', 'validity'].includes(k) ? ' <span class="pill warn">missing</span>' : ''}</label><input data-n="${n}" data-k="${k}" value="${esc(x[k] || '')}"></div>`).join('')}</div></div>`).join('');
      $$('#lcs input').forEach(i => i.oninput = () => l.licences[i.dataset.n][i.dataset.k] = i.dataset.k === 'typeCode' ? normCode(i.value) : i.value);
      $$('#lcs [data-rm]').forEach(b => b.onclick = () => { l.licences.splice(+b.dataset.rm, 1); drawL(); }); };
    drawL(); $('#addlc').onclick = () => { l.licences.push({ typeCode: '', licenceNo: '', status: 'active' }); drawL(); };
    $('#save').onclick = async () => { for (const k of ['name', 'address', 'area', 'district', 'authorisedPerson', 'nokarnamaHolder', 'phone', 'email', 'gstin', 'premises', 'lat', 'lng', 'distanceKm']) l[k] = $('#f_' + k).value.trim(); l.notes = $('#f_notes').value;
      if (!l.name) return alert('Name is required'); l.lat = l.lat ? +l.lat : null; l.lng = l.lng ? +l.lng : null; l.licences = l.licences.filter(x => x.typeCode);
      await DB.put('licensees', l); toast('Saved'); new URLSearchParams(qs || '').get('ret') === 'inspect' ? (history.length > 1 ? history.back() : go('#inspect/new?lic=' + l.id)) : new URLSearchParams(qs || '').get('ret') === 'missing' ? go('#licmissing') : go('#lic/' + l.id); };
    $('#del') && ($('#del').onclick = async () => { if (confirm('Delete ' + l.name + '? Inspections stay but lose the link.')) { await DB.del('licensees', l.id); go('#licensees'); } });
  },
  async licmissing() {
    const lics = (await DB.all('licensees')).map(l => ({ l, m: L.missingDetails(l) })).filter(x => x.m.length).sort((a, b) => b.m.length - a.m.length || a.l.name.localeCompare(b.l.name));
    const total = (await DB.all('licensees')).length, cnt = {};
    lics.forEach(x => x.m.forEach(k => { const key = k.replace(/^[A-Z0-9?]+ /, 'licence: '); cnt[key] = (cnt[key] || 0) + 1; }));
    setTop('Complete licensee details', `${lics.length} of ${total} need details`, true);
    view().innerHTML = `<div class="card"><div class="muted">These details are printed in the inspection forms (Address, Authorised person, Validity, Possession / Consumption limit, Purpose …). Once entered, they are filled in automatically at every inspection.</div>
      <div class="chips" style="margin-top:8px">${Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `<span class="chip">${esc(k)}: ${v}</span>`).join('')}</div></div>
      <div class="card"><ul class="list">${lics.map(({ l, m }) => `<li onclick="go('#licedit/${l.id}?ret=missing')"><div class="main"><div class="t">${esc(l.name)}</div><div class="s">${esc(m.join(', '))}</div></div><span class="pill warn">${m.length}</span></li>`).join('') || '<li class="empty">All licensee records are complete 👍</li>'}</ul></div>`;
  },
  /* ---------------- MORE ---------------- */
  async more() {
    setTop('More', '');
    const items = [['#today', '📝', 'Today (classic home)', 'Diary chips, month summary, due list'], ['#staff', '👮', 'Staff register / કર્મચારી', 'Officers, places, licence types, team folder'], ['#monitor', '📈', 'Monitoring board', 'Officer-wise inspection progress'], ['#reminders', '⏰', 'Reminders', 'રીમાઇન્ડર'], ['#meetings', '👥', 'Meetings', 'મીટીંગ · Google Meet'], ['#offices', '🏢', 'Offices under you', 'તાબાની કચેરી તપાસણી'], ['#pendency/eprohibition', '📋', 'Portal pendency', 'Manual entries · e-Prohibition · e-Sarkar · LEMS (Liquor and Excise Management System)'], ['#join', '🔗', 'Join a team (officer phone)', 'Officer / district setup'],['#visits', '📍', 'Planned visits', 'Plan visits, WhatsApp alerts, reminders'], ['#licmissing', '📇', 'Complete licensee details', 'Licensees with missing address, validity, limits …'], ['#holidays', '🏛', 'Holiday list', 'Govt of Gujarat 2026 (GAD) · update for new years'], ['#history', '📋', 'Inspection register', 'History, monthly register, reports'], ['#week', '🗓', 'Weekly diary', 'સાપ્તાહિક ડાયરી'], ['#due', '⏰', 'Due inspections', 'As per standard'],
      ['#abstract', '🏷', 'Licence types & abstract', 'Totals, ધોરણ, code mapping, carry-forward'], ['#templates', '🧾', 'Inspection forms', 'M-A / F.L. form templates'], ['#keywords', '🏷', 'Keywords / કીવર્ડ્સ', 'Your own quick words for diary & forms'],
      ['#import', '⬇️', 'Import data', 'Existing data, Excel lists, old diaries'], ['#sync', '🔄', 'Sync with Google Drive', 'Google Drive સાથે સિંક · Android ⇄ iPhone'], ['#portalmerge', '🔗', 'Keep portal list & merge duplicate ULNs', 'e-Prohibition is authority · inspections kept · same ULN once'], ['#distclean', '🧹', 'Clean district data', 'Remove the other district’s licensees put here by mistake'], ['#backup', '💾', 'Backup & restore', 'બેકઅપ · auto-backup, share, restore'], ['#settings', '⚙️', 'Settings', 'Name, letterhead, holidays, office']];
    view().innerHTML = `<div class="card"><ul class="list">${items.map(([h, i, t, s]) => `<li onclick="go('${h}')"><span style="font-size:22px">${i}</span><div class="main"><div class="t">${t}</div><div class="s">${s}</div></div>›</li>`).join('')}</ul></div>
      <div class="card muted">Inspection App v1.8.0 · Data is stored on this phone; if you switch on Google Drive sync, a copy is kept in a hidden app folder of your own Google Drive (no other server). Automatic backups: More › Backup & restore.</div>`;
  },
  async abstract() {
    const cfg = await L.abstractCfg(), rows = await L.abstractRows();
    setTop('Licence types & abstract', 'એબ્સ્ટ્રેક્ટ', true);
    const known = new Set(rows.flatMap(r => r.codes)), used = new Set([...(await DB.all('inspections')).map(i => normCode(i.typeCode)), ...(await DB.all('licensees')).flatMap(l => (l.licences || []).map(x => x.typeCode))]);
    const unk = [...used].filter(c => c && !known.has(c));
    view().innerHTML = `<div class="card gu"><h3>Rows of the abstract</h3><div class="muted">Total = પરવાનાની કુલ સંખ્યા, counted automatically from ${esc(DIST.info.en)} district's e-Prohibition licensee list (only ${TJ.PREFIX[DIST.key]}/… ULNs; ${esc(DISTRICTS[TJ.otherKey()].en)} licences are never counted). Codes = which licence types count in that row (comma separated).</div>
      <label class="te-chk"><input type="checkbox" id="manT" ${cfg.manualTotals ? 'checked' : ''}> Use typed totals instead of the e-Prohibition count</label>
      <div class="scroll-x"><table class="t"><tr><th>ક્રમ</th><th>પ્રકાર</th><th>ધોરણ</th><th>કુલ</th><th>Codes</th></tr>
      ${rows.map(r => `<tr data-k="${r.key}"><td>${esc(r.sr)}</td><td class="l">${esc(r.label)}</td><td><select data-x="std">${['દર માસે', 'દર બે માસે', 'દર ત્રણ માસે', 'દર ચાર માસે', 'દર છ માસે', 'વર્ષે એક વખત', '-', '-\u00a0'].map(s => `<option ${s === r.std ? 'selected' : ''} value="${s}">${s.trim()}</option>`).join('')}</select></td><td><input data-x="total" inputmode="numeric" value="${r.total}" ${cfg.manualTotals ? '' : 'readonly'} title="e-Prohibition count: ${r.liveTotal}"></td><td><input data-x="codes" value="${esc(r.codes.join(','))}" style="min-width:120px"></td></tr>`).join('')}</table></div>
      ${unk.length ? `<div class="warnbox" style="margin-top:8px">Codes in your data not linked to any row: <b>${unk.map(esc).join(', ')}</b></div>` : ''}</div>
      <div class="card"><h3>Carry-forward of progressive (col. 7)</h3><div class="muted">Progressive counts licences inspected since 1 April. If your earlier months were done outside this app, enter the progressive as printed in a past diary; later months in the same year add to it.</div>
      <label>As of month</label><input type="month" id="bm" value="${esc(cfg.baseline?.month || '')}">
      <div class="scroll-x"><table class="t">${rows.map(r => `<tr><td class="l gu">${esc(r.label)}</td><td style="width:80px"><input data-b="${r.key}" inputmode="numeric" value="${esc(cfg.baseline?.values?.[r.key] ?? '')}"></td></tr>`).join('')}</table></div></div>
      <button class="btn block" id="save">Save</button>`;
    $('#save').onclick = async () => {
      $$('tr[data-k]').forEach(tr => { const k = tr.dataset.k, base = ABSTRACT_ROWS.find(r => r.key === k);
        cfg.std[k] = $('[data-x=std]', tr).value; if ($('#manT').checked) cfg.totals[k] = Number($('[data-x=total]', tr).value) || 0;
        cfg.extraCodes[k] = $('[data-x=codes]', tr).value.split(',').map(normCode).filter(c => c && !base.codes.includes(c)); });
      const vals = {}; $$('[data-b]').forEach(i => { if (i.value !== '') vals[i.dataset.b] = Number(i.value); });
      cfg.manualTotals = $('#manT').checked;
      cfg.baseline = $('#bm').value ? { month: $('#bm').value, values: vals } : null;
      await L.saveAbstractCfg(cfg); toast('Saved'); };
  },
  async distclean() { return DC.route(); },
  async portalmerge() { location.hash = '#more'; setTimeout(() => PM.ask(), 300); },
  async tpledit(code) { return TE.route(decodeURIComponent(code || '')); },
  async templates() {
    setTop('Inspection forms', 'ટેમ્પલેટ', true);
    const saved = await DB.all('templates'), codes = [...new Set([...Object.keys(DEFAULT_TEMPLATES), ...saved.map(t => t.code)])].sort();
    view().innerHTML = `<div class="card"><div class="muted">Each licence type can have its own detailed form. Built-in forms come from your old Windows app template (M-A.1, M-A.2, F.L., R.S., D.S., S.A., S.P.). Upload an Excel in the same format (license_type_code, field_label, field_type, field_options, section_name, field_order, is_required) to add or replace forms.</div>
      <button class="btn sec block" id="up">Upload form template (Excel/CSV)</button></div>
      <div class="card"><h3>✏️ Edit inspection template</h3><div class="muted">Tap <b>Edit</b> next to a form to change, delete, re-order or add questions and sections, and to find repeated questions.</div>
      <label>New form for licence type (code)</label><div class="te-top"><input id="newc" placeholder="e.g. FL3"><button class="btn" id="newb">Create</button></div></div>
      <div class="card"><ul class="list">${codes.map(c => { const s = saved.find(t => t.code === c); const n = (s?.fields || DEFAULT_TEMPLATES[c] || []).length; return `<li><div class="main"><div class="t">${esc(c)}</div><div class="s">${n} questions · ${s ? (s.version ? 'edited v' + s.version : 'uploaded') : 'built-in'}</div></div><button class="btn sm" data-ed="${esc(c)}">✏️ Edit</button>${s ? `<button class="btn danger sm" data-del="${esc(c)}">Remove</button>` : ''}</li>`; }).join('')}</ul></div>`;
    $('#up').onclick = async () => { const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; try { const c = await IM.importTemplateExcel(f); toast('Loaded forms: ' + c.join(', ')); routes.templates(); } catch (e) { alert(e.message); } };
    $$('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Remove your saved ' + b.dataset.del + ' form and go back to the built-in one?')) return; await DB.del('templates', b.dataset.del); routes.templates(); });
    $$('[data-ed]').forEach(b => b.onclick = () => { TE._st = null; go('#tpledit/' + encodeURIComponent(b.dataset.ed)); });
    $('#newb').onclick = () => { const c = normCode($('#newc').value); if (!c) return alert('Type a licence code'); TE._st = null; go('#tpledit/' + encodeURIComponent(c)); };
  },
  async import() {
    setTop('Import data', '', true);
    view().innerHTML = `<div class="card"><h3>1. Your existing data</h3><div class="muted">Pick the file <b>PRIVATE-inspection-app-existing-data.json</b> (sent to you separately). It contains your ${'licensees'}, inspections, letterhead and abstract totals from the old Windows app. It is read only on this phone. Importing an updated file again is safe: it only adds missing details and merges duplicate firm names – your own edits are kept.</div>
        <button class="btn block" id="p1">Choose existing-data file</button><div id="p1r"></div></div>
      <div class="card"><h3>1A. e-Prohibition licensee list <small class="gu">ઈ-પ્રોહિબિશન પરવાનેદારો</small></h3><div class="muted">Pick <b>PRIVATE-eProhibition-licensees-${DIST.key}.json</b> from your Google Drive (Inspection App folder). Adds MA1, MA2, DS5, SA1, SA2 … licensees of <b>${DIST.info.en}</b> with ULN, address and area. Matches by ULN, then name; only adds – nothing is deleted or overwritten. Drive sync then updates your other phones.</div>
        <button class="btn block" id="pp">Choose e-Prohibition licensee file</button><div id="ppr"></div></div>
      <div class="card"><h3>2. Licensee list from Excel</h3><div class="muted">Columns: name, address, area, district, phone, authorised_person, gstin, license_type_code, license_number, validity, possession_limit, consumption_limit, purpose, prohibited_item. Only empty details are filled.</div><button class="btn sec block" id="p2">Choose Excel / CSV</button></div>
      <div class="card"><h3>3. Old monthly diary (Excel)</h3><div class="muted">Reads the day-wise table (dates, From/To, vehicle, કામગીરી and colours) from a diary workbook in the office format, so past months appear in the calendar.</div><button class="btn sec block" id="p3">Choose diary .xlsx</button></div>
      <div class="card"><h3>4. Inspection form template</h3><button class="btn sec block" onclick="go('#templates')">Open form templates</button></div>`;
    $('#p1').onclick = async () => { const f = await pickFile('.json,application/json'); if (!f) return;
      try { const data = JSON.parse(await readFile(f)); const pv = IM.previewPrivate(data);
        $('#p1r').innerHTML = `<div class="okbox" style="margin-top:10px">Found <b>${pv.licensees}</b> licensees and <b>${pv.inspections}</b> inspections${pv.hasLetterhead ? ' + office letterhead' : ''}.<br>
          <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="skip" checked style="width:auto"> Skip ${pv.suspect} doubtful records (3 test entries + bulk copies made on 23–24 Jul 2026 where each licensee was copied for every licence type)</label>
          <button class="btn block" id="go1">Import now</button></div>`;
        $('#go1').onclick = e => busy(e.target, async () => { if (DC.restoreWarning(data) && !confirm('This file looks like the OTHER district\'s data. Import into ' + DIST.info.en + ' anyway?')) return; const r = await IM.importPrivate(data, { skipSuspect: $('#skip').checked }); toast(`Imported ${r.licensees} licensees, ${r.inspections} inspections`); $('#p1r').innerHTML = `<div class="okbox" style="margin-top:10px">Done: ${r.licensees} licensees, ${r.inspections} inspections. You can now delete the file from Downloads.</div>`; });
      } catch (e) { alert(e.message); } };
    $('#pp').onclick = async () => { const f = await pickFile('.json,application/json'); if (!f) return;
      try { const data = JSON.parse(await readFile(f)); const pv = IM.previewPortal(data, DIST.key);
        if (pv.wrongDistrict) return alert('This file is for ' + pv.district + ' district, but the app is in ' + DIST.info.en + '. Switch district first.');
        $('#ppr').innerHTML = `<div class="okbox" style="margin-top:10px">Found <b>${pv.licensees}</b> licensees with <b>${pv.licences}</b> licences (${Object.entries(pv.codes).sort().map(([c, n]) => esc(c) + ' ' + n).join(', ')}).<br><span class="muted">${esc(pv.source)}</span><button class="btn block" id="gop">Add to ${esc(DIST.info.en)} licensees</button></div>`;
        $('#gop').onclick = e => busy(e.target, async () => { const r = await IM.importPortal(data, DIST.key); toast(`Added ${r.added}, updated ${r.updated}`); $('#ppr').innerHTML = `<div class="okbox" style="margin-top:10px">Done: ${r.added} new licensees, ${r.updated} existing ones completed, ${r.licAdded} licences added. Total now ${r.total}. Existing data kept.${r.merge && r.merge.done ? ' ' + esc(PM.summary(r.merge)) + '.' : ''}</div>`; if (typeof SY !== 'undefined') SY.auto('portal-import').catch(() => {}); });
      } catch (e) { alert(e.message); } };
    $('#p2').onclick = async () => { const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; try { toast(`Imported ${await IM.importLicenseesExcel(f)} rows`); } catch (e) { alert(e.message); } };
    $('#p3').onclick = async () => { const f = await pickFile('.xlsx,.xls'); if (!f) return; try { const d = await IM.importDiaryExcel(f); if (!d.length) return alert('No diary rows found (expected dates in B37:B67).'); S.ym = d[0].date.slice(0, 7); toast(`Loaded ${d.length} days of ${monthLabelEn(S.ym)}`); go('#diary'); } catch (e) { alert(e.message); } };
  },
  async backup() {
    setTop('Backup & restore', 'બેકઅપ અને રિસ્ટોર', true);
    const st = await BK.status(), nat = BK.isNative(), persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    const files = nat ? await BK.listDocs() : [];
    const lf = await DB.getSetting('bk.lastFile', null);
    view().innerHTML = `<div class="card ${st.needsReminder ? 'warnbox' : 'okbox'}"><h3>${st.needsReminder ? '⚠️' : '✅'} Last backup / છેલ્લો બેકઅપ</h3>
        <div>Automatic / ઓટોમેટિક: <b>${esc(BK.fmt(st.lastAt))}</b></div>
        <div>Sent off the phone / ફોન બહાર મોકલેલ: <b>${esc(BK.fmt(st.offAt))}</b></div>
        ${lf?.file ? `<div class="muted" style="margin-top:4px">📁 ${esc(lf.file)}</div>` : ''}
        ${st.needsReminder ? `<div style="margin-top:6px">${nat && st.autoAge <= 7 ? 'No copy has left this phone for 30+ days. Tap "Share backup" and send it to WhatsApp / email / Drive.<br><span class="gu">૩૦ દિવસથી બેકઅપ ફોન બહાર મોકલ્યો નથી – "બેકઅપ મોકલો" દબાવો.</span>' : 'No backup for 7+ days. Tap a button below.<br><span class="gu">૭ દિવસથી બેકઅપ નથી – નીચેનું બટન દબાવો.</span>'}</div>` : ''}</div>
      <div class="card"><h3>💾 Backup now / હમણાં બેકઅપ</h3><div class="muted">${nat ? `The app saves a backup automatically after every change and once a day in <b>Documents/${BK.DIR}</b> (last ${BK.KEEP} days kept). These files stay even if the app is uninstalled.` : 'In the browser version, backups must be downloaded or shared.'} / દરેક ફેરફાર પછી આપમેળે બેકઅપ થાય છે.</div>
        <button class="btn block" id="bnow">💾 Backup now / હમણાં બેકઅપ લો</button>
        <button class="btn block" id="bshare">📤 Share backup (WhatsApp / Email / Drive) / બેકઅપ મોકલો</button></div>
      <div class="card"><h3>♻️ Restore / રિસ્ટોર</h3><div class="muted">You will see the record counts before anything is replaced. A safety copy is saved first. / બદલતાં પહેલાં ગણતરી બતાવાશે.</div>
        <button class="btn danger block" id="r">Restore from a backup file / ફાઇલમાંથી રિસ્ટોર</button>
        ${files.length ? `<ul class="list" style="margin-top:8px">${files.slice(0, 40).map(f => `<li data-f="${esc(f.name)}"><span style="font-size:20px">${/safety/.test(f.name) ? '🛟' : '🗂'}</span><div class="main"><div class="t">${esc(f.name.replace(/^Inspection-App-|\.json$/g, ''))}</div><div class="s">${f.size ? Math.round(f.size / 1024) + ' KB · ' : ''}tap to restore</div></div>›</li>`).join('')}</ul>` : ''}</div>
      <div class="card muted">🔒 Storage protection: ${nat ? '✅ Android app storage (not cleared by the browser) + automatic backup files' + (persisted ? ' + persistent storage' : '') : persisted ? '✅ persistent storage granted – Android/browser will not clear app data on its own' : '⚠️ not guaranteed'}${nat ? ' · Android Auto Backup to your Google account is enabled for this app' : ''}.</div>`;
    $('#bnow').onclick = e => busy(e.target, async () => {
      if (nat) { const r = await BK.run('manual'); if (r.fileError && !r.mirror) throw new Error(r.fileError); toast(r.file ? 'Saved: ' + r.file : 'Backup saved in app storage'); }
      else { const snap = await BK.snapshot('manual'); await saveFile(new Blob([JSON.stringify(snap)], { type: 'application/json' }), `Inspection-App-backup-${BK.stamp()}.json`); await DB.setSetting('bk.lastShared', { at: snap.createdAt, counts: snap.counts }); await BK.run('manual'); }
      routes.backup(); });
    $('#bshare').onclick = e => busy(e.target, async () => { await BK.share(); routes.backup(); });
    $('#r').onclick = async () => { const f = await pickFile('.json,application/json'); if (!f) return; let obj; try { obj = JSON.parse(await readFile(f)); } catch (e) { return alert('File is not valid JSON / ફાઇલ યોગ્ય નથી'); } BK.confirmRestore(obj, f.name); };
    $$('[data-f]').forEach(li => li.onclick = async () => { try { BK.confirmRestore(JSON.parse(await BK.readText(`${BK.DIR}/${li.dataset.f}`, 'DOCUMENTS')), li.dataset.f); } catch (e) { alert('Cannot read this file: ' + e.message); } });
  },
  async settings() {
    const p = await L.profile();
    setTop('Settings', '', true);
    const F = (k, lab, extra = '') => `<label>${lab}</label><input id="s_${k}" value="${esc(p[k] ?? '')}" ${extra}>`;
    view().innerHTML = `<div class="card gu"><h3>Signature &amp; letter</h3>${F('officerNameGu', 'Name in signature, e.g. (નામ)')}${F('designationGu', 'Designation')}${F('deptGu', 'Department')}${F('placeGu', 'Place')}
      ${F('refPrefix', 'Reference no. prefix ({YEAR} = year in Gujarati digits)')}<label>Addressed to (one line each)</label><textarea id="s_to">${esc((p.toLines || []).join('\n'))}</textarea></div>
      <div class="card"><h3>Letterhead</h3><img id="lhimg" src="${esc(p.letterhead || '')}" style="width:100%;${p.letterhead ? '' : 'display:none'}"><div class="muted">${p.letterhead ? '' : 'Not set – a plain text heading is used. '}Photo/scan of the office letterhead strip (wide image).</div>
        ${F('officeTitleGu', 'Office title (used when no image)')}${F('officeAddressGu', 'Office address line (used when no image)')}<div class="btns"><button class="btn sec" id="lh">Choose image</button>${p.letterhead ? '<button class="btn danger" id="lhx">Remove</button>' : ''}</div></div>
      <div class="card"><h3>Diary defaults</h3><div class="grid2">${F('fromCode', 'From code')}${F('vehicleCode', 'Vehicle code in diary')}</div>
        <label>Government vehicles (comma separated)</label><input id="s_veh" value="${esc((p.vehicles || []).join(', '))}">
        <label>Saturdays that are holidays</label><div class="chips" id="sats">${[1, 2, 3, 4, 5].map(n => `<button class="chip ${(p.holidaySat || []).includes(n) ? 'on' : ''}" data-n="${n}">${n}${['st', 'nd', 'rd', 'th', 'th'][n - 1]}</button>`).join('')}</div>
        <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="s_govh" style="width:auto" ${p.useGovtHolidays !== false ? 'checked' : ''}> Use Government of Gujarat holiday list (built-in 2026 GAD list)</label>
        <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="s_hname" style="width:auto" ${p.holidayNameInDiary !== false ? 'checked' : ''}> Write the holiday name in the diary, e.g. જાહેર રજા - દશેરા – untick for plain “જાહેર રજા”</label>
        <button class="btn sec sm" onclick="go('#holidays')" style="margin:4px 0 8px">🗓 View / update holiday list</button>
        <label>Extra local holidays (one per line: YYYY-MM-DD text)</label><textarea id="s_ph" class="gu" placeholder="2026-10-20 જાહેર રજા (દિવાળી)">${esc((p.publicHolidays || []).map(h => h.date + ' ' + (h.workText || '')).join('\n'))}</textarea>
        <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="s_route" style="width:auto" ${p.showRouteCols ? 'checked' : ''}> Print From/To/Vehicle columns by default</label>
        <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="s_extra" style="width:auto" ${p.showExtraSummary ? 'checked' : ''}> Print તારીજ rows 5–6 by default</label></div>
      <div class="card"><h3>Office location (for km)</h3><div class="grid2">${F('officeLat', 'Latitude')}${F('officeLng', 'Longitude')}</div>${F('roadFactor', 'Road factor (straight line × this)')}
        <button class="btn sec block" id="here">📍 I am at the office – use my location</button>
        <label>Km by area (one per line: Area = km)</label><textarea id="s_area">${esc(Object.entries(p.areaKm || {}).map(([a, k]) => a + ' = ' + k).join('\n'))}</textarea></div>
      <div class="card"><h3>WhatsApp alerts &amp; reminders</h3>${F('waNumber', 'Work WhatsApp number (alerts are sent here)', 'inputmode="tel"')}
        <div class="grid2"><div><label>Reminder on visit day</label><input type="time" id="s_rm" value="${esc(p.remindMorning || '08:00')}"></div><div><label>Reminder evening before</label><input type="time" id="s_re" value="${esc(p.remindEvening || '19:00')}"></div></div>
        <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="s_remon" style="width:auto" ${p.remindersOn !== false ? 'checked' : ''}> Phone reminders for planned visits (Android app)</label>
        <div class="muted">WhatsApp opens with the message typed in – you tap Send. Reminders need the Android app; the browser version cannot schedule them.</div></div>
      <button class="btn block" id="save">Save settings</button>`;
    let lh = p.letterhead;
    $('#lh').onclick = async () => { const f = await pickFile('image/*'); if (!f) return; lh = await readFile(f, 'dataurl'); $('#lhimg').src = lh; $('#lhimg').style.display = ''; };
    $('#lhx') && ($('#lhx').onclick = () => { lh = ''; $('#lhimg').style.display = 'none'; });
    $$('#sats .chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
    $('#here').onclick = () => navigator.geolocation.getCurrentPosition(pos => { $('#s_officeLat').value = pos.coords.latitude.toFixed(5); $('#s_officeLng').value = pos.coords.longitude.toFixed(5); }, e => alert(e.message));
    $('#save').onclick = async () => {
      for (const k of ['officerNameGu', 'designationGu', 'deptGu', 'placeGu', 'refPrefix', 'officeTitleGu', 'officeAddressGu', 'fromCode', 'vehicleCode', 'waNumber']) p[k] = $('#s_' + k).value;
      const remChanged = p.remindMorning !== $('#s_rm').value || p.remindEvening !== $('#s_re').value || (p.remindersOn !== false) !== $('#s_remon').checked;
      p.remindMorning = $('#s_rm').value || '08:00'; p.remindEvening = $('#s_re').value || '19:00'; p.remindersOn = $('#s_remon').checked;
      for (const k of ['officeLat', 'officeLng', 'roadFactor']) p[k] = Number($('#s_' + k).value) || DEFAULT_PROFILE[k];
      p.toLines = $('#s_to').value.split('\n'); p.letterhead = lh; p.vehicles = $('#s_veh').value.split(',').map(s => s.trim()).filter(Boolean);
      p.holidaySat = $$('#sats .chip.on').map(b => +b.dataset.n);
      p.publicHolidays = $('#s_ph').value.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const [d, ...t] = s.split(/\s+/); return { date: d, workText: t.join(' ') || 'જાહેર રજા' }; }).filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h.date));
      p.useGovtHolidays = $('#s_govh').checked; p.holidayNameInDiary = $('#s_hname').checked;
      p.showRouteCols = $('#s_route').checked; p.showExtraSummary = $('#s_extra').checked;
      p.areaKm = {}; $('#s_area').value.split('\n').forEach(s => { const [a, k] = s.split('='); if (a && k) p.areaKm[a.trim()] = Number(k); });
      await L.saveProfile(p); toast('Settings saved');
      if (remChanged) for (const v of await V.upcoming()) { if (p.remindersOn) await V.scheduleReminders(v); else await V.cancelReminders(v); } };
  },
  async holidays(arg) {
    const lists = await HOL.lists(), years = Object.keys(lists).sort(), prof = await L.profile();
    const y = arg && lists[arg] ? arg : (lists[todayStr().slice(0, 4)] ? todayStr().slice(0, 4) : years[years.length - 1]);
    setTop('Holiday list', 'જાહેર રજાઓ', true);
    const data = lists[y], t = todayStr(), taken = new Set(prof.optionalTaken || []);
    const row = h => `<li class="${h.date < t ? 'past' : ''}"><div style="width:52px;text-align:center"><b>${+h.date.slice(8)}</b><div class="muted">${EN_MON3[+h.date.slice(5, 7) - 1]} · ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseYmd(h.date).getDay()]}</div></div><div class="main"><div class="t gu">${esc(h.gu)}</div><div class="s">${esc(h.en)}</div></div>${h.type === 'optional' ? `<button class="chip ${taken.has(h.date) ? 'on' : ''}" data-opt="${h.date}">${taken.has(h.date) ? '✓ taken' : 'take'}</button>` : ''}</li>`;
    view().innerHTML = `${years.length > 1 ? `<div class="card"><div class="chips">${years.map(x => `<button class="chip ${x === y ? 'on' : ''}" onclick="go('#holidays/${x}')">${x}</button>`).join('')}</div></div>` : ''}
      ${data ? `<div class="card"><h3>${y} – Public holidays <small class="gu">જાહેર રજાઓ</small></h3><div class="muted">Source: ${esc(data.source || '')}${data.builtin ? ' · built into the app' : ' · imported'}. Shown orange in the calendar and filled into the diary. Every Sunday and the ${(prof.holidaySat || []).map(n => n + (['st','nd','rd','th','th'][n - 1])).join(' & ')} Saturday are holidays too.</div>
        <ul class="list hl">${data.list.filter(h => h.type === 'public').map(row).join('')}</ul>
        ${data.list.some(h => h.type === 'sunday') ? `<div class="sec-title">Festivals falling on Sunday (not separately notified)</div><ul class="list hl">${data.list.filter(h => h.type === 'sunday').map(row).join('')}</ul>` : ''}</div>
      <div class="card"><h3>Optional holidays <small class="gu">મરજીયાત રજાઓ</small></h3><div class="muted">Not marked as holidays. Any two may be availed – tap “take” and that day becomes a holiday (મરજીયાત રજા) in your diary.</div>
        <ul class="list hl">${data.list.filter(h => h.type === 'optional').map(row).join('') || '<li class="muted">None in this list</li>'}</ul></div>` : '<div class="card">No holiday list for this year yet.</div>'}
      <div class="card"><h3>Update holiday list</h3><div class="muted">For a new year, import the GAD list as CSV (columns: <code>date,type,name_gu,name_en</code>; type = public / optional / sunday; optional first line <code># source: notification no.</code>) or JSON. An imported year replaces the built-in list for that year.</div>
        <div class="btns"><button class="btn" id="himp">⬆ Import CSV / JSON</button><button class="btn sec" id="hexp">⬇ Save ${y} as CSV (template)</button></div>
        ${data && !data.builtin && BUILTIN_HOLIDAYS[y] ? `<button class="btn danger block" id="hres">Go back to built-in ${y} list</button>` : ''}</div>`;
    $$('[data-opt]').forEach(b => b.onclick = async () => { const p2 = await L.profile(), s = new Set(p2.optionalTaken || []); s.has(b.dataset.opt) ? s.delete(b.dataset.opt) : s.add(b.dataset.opt); p2.optionalTaken = [...s]; await L.saveProfile(p2); if (s.size > 2) toast('Note: only two optional holidays are normally allowed'); routes.holidays(y); });
    $('#himp').onclick = async () => { const f = await pickFile('.csv,.json,text/csv,application/json'); if (!f) return; try { const r = await HOL.importFile(await readFile(f), f.name); toast('Imported: ' + Object.entries(r).map(([k, v]) => `${k} (${v})`).join(', ')); routes.holidays(Object.keys(r)[0]); } catch (e) { alert(e.message); } };
    $('#hexp').onclick = () => data && saveFile(new Blob([HOL.csvFor(y, data)], { type: 'text/csv' }), `Gujarat-holidays-${y}.csv`);
    $('#hres') && ($('#hres').onclick = async () => { await HOL.resetYear(y); routes.holidays(y); });
  }
};
Object.assign(routes, VISIT_ROUTES, KW_ROUTES, DASH_ROUTES, TEAM_ROUTES, DLIST_ROUTES);
/* ---------------- GOOGLE DRIVE SYNC ---------------- */
async function syncCard() {
  if (!(await DB.getSetting('sync.enabled', false))) return SY.cfg().GOOGLE_CLIENT_ID ? `<div class="card warnbox" onclick="go('#sync')" style="cursor:pointer;padding:10px 14px">🔑 <b>Sync this phone with your other phone</b> – tap, then “Sign in with Google &amp; sync” / બીજા ફોન સાથે સિંક કરો ›</div>` : '';
  const last = await DB.getSetting('sync.last', null), st = SY.status.state;
  const icon = st === 'syncing' ? '⏳' : st === 'ok' || (last && st === 'idle') ? '🔄' : '⚠️';
  const msg = st === 'signin' ? 'Tap to sign in to Google again / ફરી સાઇન-ઇન કરો' : st === 'offline' ? 'Offline – will sync later / ઓફલાઇન' : st === 'error' ? 'Sync problem – tap / સિંક સમસ્યા' : '';
  return `<div class="card ${st === 'signin' || st === 'error' ? 'warnbox' : ''}" onclick="go('#sync')" style="cursor:pointer;padding:10px 14px"><div class="row"><div>${icon} <b>Last synced / છેલ્લું સિંક:</b> ${esc(SY.fmt(last?.at))}${msg ? '<br><span class="gu">' + esc(msg) + '</span>' : ''}</div><div style="flex:0">›</div></div></div>`;
}
document.addEventListener('syncstatus', () => { const el = document.getElementById('syncLive'); if (el && location.hash.startsWith('#sync')) routes.sync(); });
routes.sync = async function () {
  setTop('Sync with Google Drive', 'Google Drive સાથે સિંક', true);
  const c = SY.cfg(), en = await DB.getSetting('sync.enabled', false), last = await DB.getSetting('sync.last', null), email = await DB.getSetting('sync.email', '');
  const conf = await DB.getSetting('sync.conflicts', []), tok = !!SY.token(), st = SY.status, dirty = await DB.getSetting('sync.dirty', false);
  const stTxt = { syncing: '⏳ Syncing… / સિંક થાય છે…', ok: '✅ Up to date / અપ-ટુ-ડેટ', offline: '📴 Offline – changes are kept and will sync later / ઓફલાઇન – પછી સિંક થશે', signin: '🔑 Google sign-in needed / સાઇન-ઇન જરૂરી', error: '⚠️ ' + (st.error || 'Error') }[st.state] || (tok ? '✅ Connected' : en ? '🔑 Google sign-in needed / સાઇન-ઇન જરૂરી' : '');
  view().innerHTML = `<div id="syncLive"></div>
    ${!c.GOOGLE_CLIENT_ID ? `<div class="card warnbox"><b>Setup needed / સેટઅપ બાકી</b><br>Sync needs Sir's own Google Cloud "client ID" (one-time, about 15 minutes – see <b>GOOGLE-SETUP-GUIDE.pdf</b>). Then type it under <b>Setup</b> below.</div>` : ''}
    <div class="card ${st.state === 'error' || st.state === 'signin' || (en && !tok) ? 'warnbox' : 'okbox'}"><h3>🔄 Status / સ્થિતિ</h3>
      <div>${esc(stTxt)}</div>
      <div>Last synced / છેલ્લું સિંક: <b>${esc(SY.fmt(last?.at))}</b>${last ? ` · received ${last.received}, ${last.records} records in Drive` : ''}</div>
      ${email ? `<div class="muted">Google account: ${esc(email)}</div>` : ''}${dirty ? '<div class="muted">Changes on this phone are waiting to be synced. / ફેરફારો સિંક બાકી.</div>' : ''}
      <button class="btn block" id="sNow" style="margin-top:8px" ${c.GOOGLE_CLIENT_ID ? '' : 'disabled'}>${tok ? '🔄 Sync now / હમણાં સિંક કરો' : '🔑 Sign in with Google &amp; sync / Google સાથે જોડો'}</button>
      ${en ? `<button class="btn sec block" id="sOff">Turn sync off on this phone / આ ફોન પર સિંક બંધ</button>` : ''}</div>
    <div class="card"><h3>How it works / કેવી રીતે</h3><div class="muted">Your Android phone and iPhone each keep their own copy and work offline. When online they exchange changes through <b>one hidden file in your own Google Drive</b> (app folder – the app cannot see your other Drive files). Each district (Surat / Valsad) has its own sync file and syncs while that district is open. Sign in with the <b>same Google account</b> for a district on both phones. Sync runs when the app opens, a few seconds after you save or delete an inspection, visit or diary day, and when you press Sync now. If the same record was changed on both phones, the newer change wins and the other is kept in the conflict list below. A safety backup is taken before the first sync.</div></div>
    <div class="card"><h3>⚖️ Conflicts / અથડામણ (${conf.length})</h3>${conf.length ? `<ul class="list">${conf.slice(0, 30).map(x => `<li><div class="main"><div class="t">${esc(x.id.replace('|', ' › '))}</div><div class="s">${esc(SY.fmt(x.at))} · kept ${x.kept.deleted ? 'delete' : 'version'} of ${esc(SY.fmt(x.kept.u))}; older ${x.lost.deleted ? 'delete' : 'version'} of ${esc(SY.fmt(x.lost.u))} saved here</div></div></li>`).join('')}</ul><button class="btn sec block" id="cExp">Download conflict list (JSON)</button>` : '<div class="muted">None. 👍</div>'}</div>
    <div class="card"><h3>⚙️ Setup / સેટઅપ</h3><div class="muted">From GOOGLE-SETUP-GUIDE.pdf. Stored only on this phone.</div>
      <label>Google client ID in use (built in, read-only)</label><input readonly value="${esc(c.GOOGLE_CLIENT_ID || '(none)')}" style="font-size:12px;background:#f3f4f8">
      <label>Redirect address in use (read-only)</label><input readonly value="${esc(c.OAUTH_REDIRECT_URL || '(none)')}" style="font-size:12px;background:#f3f4f8">
      <button class="btn sec block" id="cReset">↺ Reset sync setup / સિંક સેટઅપ રીસેટ</button></div>`;
  $('#sNow').onclick = e => busy(e.target, async () => {
    await SY.rawPut('settings', { key: 'sync.enabled', value: true });
    if (!SY.token()) { const r = await SY.signIn(); if (r !== 'token') { if (r === 'browser') toast('Finish sign-in in the browser, then come back / બ્રાઉઝરમાં સાઇન-ઇન કરો'); return; } }
    const r = await SY.run('manual'); if (r.error) throw new Error(r.error); toast(r.needsSignIn ? 'Please sign in again' : r.offline ? 'Offline – will sync later' : `Synced ✓ (${r.received} received${r.conflicts ? ', ' + r.conflicts + ' conflicts' : ''})`); routes.sync(); });
  $('#sOff') && ($('#sOff').onclick = async () => { if (!confirm('Stop syncing this phone? Data on the phone and in Drive stays.')) return; await SY.rawPut('settings', { key: 'sync.enabled', value: false }); SY.signOutLocal(); routes.sync(); });
  $('#cReset').onclick = async () => { if (!confirm('Reset the Google sync setup on this phone? You will need to sign in again. Your data stays.\nસિંક સેટઅપ રીસેટ કરવું છે?')) return; await SY.resetSetup(); toast('Sync setup reset – please sign in again'); routes.sync(); };
  $('#cExp') && ($('#cExp').onclick = () => saveFile(new Blob([JSON.stringify(conf, null, 1)], { type: 'application/json' }), 'Inspection-App-sync-conflicts.json'));
};
function calLabel(d, prof) {
  const h = prof._hol?.[d.date];
  if (d.kind === 'holiday') return `<small class="gu hol">${esc(d.holidayName || (/\((.+)\)/.exec(d.work || '') || [])[1] || d.work || '')}</small>`;
  if (d.kind === 'tour') return `<small class="gu">${esc(d.to)}</small>`;
  if (h?.optional?.length) return `<small class="gu opt">${esc(h.optional[0].gu)}</small>`;
  return `<small class="gu">${esc((d.work || '').slice(0, 10))}</small>`;
}
async function saveDayQuick(date, work, kind) {
  const prof = await L.profile(), cur = (await DB.get('days', date)) || L.defaultDay(date, prof);
  const tour = kind === 'tour';
  await DB.put('days', { ...cur, auto: false, date, work, kind, from: tour ? (cur.from !== '-' ? cur.from : prof.fromCode) : '-', to: tour ? (cur.to !== '-' ? cur.to : (/ગાંધીનગર/.test(work) ? 'GNR' : '')) : '-', vehicle: tour ? (cur.vehicle || prof.vehicleCode) : '' });
  toast('Saved: ' + work);
}
function bulkDays(ym) {
  openSheet(`<h3>Fill several days</h3><div class="muted">Set the same work for a range of dates (e.g. a tour to Gandhinagar).</div>
    <div class="grid2"><div><label>From date</label><input type="date" id="bf" value="${ym}-01"></div><div><label>To date</label><input type="date" id="bt" value="${ym}-01"></div></div>
    <label>Work</label><select id="bw" class="gu">${(KW._cache ? KWL.sort(KW._cache.filter(k => k.cat === 'work')).map(k => [k.text, k.kind || 'office']) : WORK_PRESETS).map(([w, k]) => `<option value="${esc(w)}" data-k="${k}">${esc(w)}</option>`).join('')}</select>
    <label>To &amp; fro (for tours)</label><input id="bto" value="GNR">
    <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="bskip" checked style="width:auto"> Leave holidays unchanged</label>
    <button class="btn block" id="bgo">Apply</button><button class="btn sec block" onclick="closeSheet()">Cancel</button>`, el => {
    $('#bgo', el).onclick = async () => { const prof = await L.profile(), w = $('#bw', el).value, k = $('#bw', el).selectedOptions[0].dataset.k; let n = 0;
      for (const d of await L.rangeDays($('#bf', el).value, $('#bt', el).value, prof)) { if ($('#bskip', el).checked && d.kind === 'holiday') continue;
        await DB.put('days', { date: d.date, kind: k, work: w, from: k === 'tour' ? prof.fromCode : '-', to: k === 'tour' ? $('#bto', el).value : '-', vehicle: k === 'tour' ? prof.vehicleCode : '' }); n++; }
      closeSheet(); toast(n + ' days updated'); routes.diary(); }; });
}
let DEFAULT_TEMPLATES = {};
async function router() {
  closeSheet();
  const h = location.hash.slice(1) || 'home', [path, qs] = h.split('?'), [name, arg] = path.split('/');
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === (name === 'inspect' ? 'inspect' : ['diary', 'day', 'month', 'week', 'visit', 'visits'].includes(name) ? 'diary' : ['licensees', 'lic', 'licedit', 'licmissing'].includes(name) ? 'licensees' : ['home', 'due', 'today', 'reminders', 'reminder', 'meetings', 'meeting', 'offices', 'office', 'pendency', 'dlist'].includes(name) ? 'home' : ['team', 'join', 'staff', 'staffedit', 'monitor', 'meetnow'].includes(name) ? 'team' : 'more')));
  const fn = routes[name] || routes.home; window.scrollTo(0, 0);
  try { await fn(arg, qs); } catch (e) { console.error(e); view().innerHTML = `<div class="card warnbox">Error: ${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', router);
routes.notice = (id) => NT.route(id);
routes.perf = (ym) => PR.route(ym);
(async function init() {
  try { DEFAULT_TEMPLATES = await (await fetch('assets/form-templates.json')).json(); } catch (e) { DEFAULT_TEMPLATES = {}; }
  await SY.init(); try { TJ.install(); } catch (e) { console.warn('tour share', e); } try { await KW.seed(); } catch (e) { console.warn('kw seed', e); } try { await TEAM.init(); } catch (e) { console.warn('team init', e); } distBadge(); const bki = await BK.init(); V.initNotifications();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) { const hadCtl = !!navigator.serviceWorker.controller; navigator.serviceWorker.register('sw.js').catch(() => {}); navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtl && !window.__swReloaded) { window.__swReloaded = true; location.reload(); } }); }
  await router();
  setTimeout(() => PM.autoOnce().then(r => { if (r && r.done) router(); }).catch(e => console.warn('portal merge', e)), 1500);
  REM.resyncAll().catch(() => {}); try { const LN = V.isNative() && V.plugin('LocalNotifications'); LN && LN.addListener('localNotificationActionPerformed', a => { const id = a?.notification?.extra?.reminderId; if (id) go('#reminder/' + id); }); } catch (e) {}
  if (bki.latest) BK.offerAutoRestore(bki.latest);   // app started empty but a backup exists on the phone
})();
