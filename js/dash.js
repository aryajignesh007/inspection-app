'use strict';
/* v1.7.0/1.7.1 Dashboard / ડેશબોર્ડ – reminders, meetings, office inspections, licence status charts, portal pendency.
   Pure logic in DSH (unit-tested in node); charts are tiny inline SVG (no CDN, works offline). */
const PORTALS = {
  eprohibition: { en: 'e-Prohibition', gu: 'ઈ-પ્રોહિબિશન', cats: ['New licence applications / નવી અરજી', 'Renewals / રીન્યુ', 'Permits / પરમિટ', 'Transport passes / પાસ', 'Other / અન્ય'] },
  esarkar: { en: 'e-Sarkar', gu: 'ઈ-સરકાર', cats: ['Inward tapal / આવક ટપાલ', 'Files pending / પડતર ફાઇલ', 'Replies due / જવાબ બાકી'] },
  lems: { en: 'LEMS – Liquor and Excise Management System', short: 'LEMS', gu: 'LEMS – લિકર એન્ડ એક્સાઇઝ મેનેજમેન્ટ સિસ્ટમ', cats: ['IP verification – New', 'IP verification – Extend', 'Other / અન્ય'] }
};
const REPEATS = { '': 'Once / એકવાર', daily: 'Daily / દરરોજ', weekly: 'Weekly / દર અઠવાડિયે', monthly: 'Monthly / દર મહિને' };
const DSH = {
  /* ---- reminders ---- */
  occursOn(r, date) {
    if (!r || !r.date || date < r.date) return false;
    if (!r.repeat) return r.date === date;
    if (r.until && date > r.until) return false;
    if (r.repeat === 'daily') return true;
    const a = parseYmd(r.date), b = parseYmd(date);
    if (r.repeat === 'weekly') return a.getDay() === b.getDay();
    if (r.repeat === 'monthly') { const dim = daysInMonth(b.getFullYear(), b.getMonth() + 1); return b.getDate() === Math.min(a.getDate(), dim); }
    return false;
  },
  isDone: (r, date) => r.repeat ? (r.doneDates || []).includes(date) : !!r.done,
  remindersFor(list, date) { return list.filter(r => DSH.occursOn(r, date)).map(r => ({ ...r, doneToday: DSH.isDone(r, date) })).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')); },
  overdueReminders: (list, today) => list.filter(r => !r.repeat && !r.done && r.date < today).sort((a, b) => a.date.localeCompare(b.date)),
  notifId(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return 1000000 + (Math.abs(h) % 900000); },
  /** Capacitor LocalNotifications schedule for a reminder ({at} once, or {on} repeating) */
  notifSchedule(r, now = new Date()) {
    const [h, m] = (r.time || '09:00').split(':').map(Number), d = parseYmd(r.date); d.setHours(h, m, 0, 0);
    if (!r.repeat) return d > now && !r.done ? { at: d, allowWhileIdle: true } : null;
    const on = { hour: h, minute: m }; if (r.repeat === 'weekly') on.weekday = d.getDay() + 1; if (r.repeat === 'monthly') on.day = d.getDate();
    return { on, allowWhileIdle: true };
  },
  /* ---- meetings ---- */
  meetingsOn: (list, date) => list.filter(m => m.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
  upcomingMeetings: (list, today, n = 8) => list.filter(m => m.date > today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, n),
  /* ---- office inspections ---- */
  officeStatus(o, today) {
    const months = Number(o.months) || 12;
    if (!o.last) return { due: null, overdue: true, thisMonth: false, label: 'never inspected / ક્યારેય નહીં' };
    const d = parseYmd(o.last); d.setMonth(d.getMonth() + months); const due = ymd(d);
    return { due, overdue: due < today, thisMonth: !(due < today) && due.slice(0, 7) === today.slice(0, 7), label: 'due ' + dmy(due) };
  },
  officesDue(list, today) { return list.map(o => ({ o, s: DSH.officeStatus(o, today) })).filter(x => x.s.overdue || x.s.thisMonth).sort((a, b) => (a.s.due || '0').localeCompare(b.s.due || '0')); },
  /* ---- licence inspection status ---- */
  periods(today) {
    const y = +today.slice(0, 4), m = +today.slice(5, 7), fy = m >= 4 ? y : y - 1;
    const qStartM = m >= 4 ? 4 + 3 * Math.floor((m - 4) / 3) : 1, qy = y;
    const qs = `${qy}-${pad(qStartM)}-01`, qe = ymd(new Date(qy, qStartM - 1 + 3, 0));
    return {
      fy: { key: 'fy', en: `FY ${fy}-${String(fy + 1).slice(2)}`, gu: 'નાણાકીય વર્ષ', from: `${fy}-04-01`, to: `${fy + 1}-03-31` },
      q: { key: 'q', en: 'This quarter', gu: 'આ ત્રિમાસિક', from: qs, to: qe },
      m: { key: 'm', en: 'This month', gu: 'આ મહિનો', from: today.slice(0, 7) + '-01', to: today.slice(0, 7) + '-31' }
    };
  },
  typeGroup: code => { const c = normCode(code); if (/^MA[12]$|^MA12$/.test(c)) return c; const g = /^([A-Z]+)/.exec(c); return g ? g[1] : c || '?'; },
  /** active licences, inspected (any inspection of that licensee + type in the period) vs pending, per type group */
  licStats(lics, ins, per) {
    const done = new Set(ins.filter(i => !i.excluded && i.date >= per.from && i.date <= per.to).map(i => i.licenseeId + '|' + normCode(i.typeCode)));
    const by = {}; let total = 0, insp = 0;
    for (const l of lics) for (const lc of (l.licences || [])) {
      if ((lc.status || 'active') !== 'active') continue;
      const c = normCode(lc.typeCode), g = DSH.typeGroup(c), ok = done.has(l.id + '|' + c);
      const b = (by[g] ||= { type: g, total: 0, done: 0 }); b.total++; total++; if (ok) { b.done++; insp++; }
    }
    const rows = Object.values(by).map(b => ({ ...b, pending: b.total - b.done })).sort((a, b) => b.total - a.total);
    return { total, done: insp, pending: total - insp, rows };
  },
  /* ---- portal pendency ---- */
  pendTotal: e => Object.values(e.counts || {}).reduce((s, v) => s + (Number(v) || 0), 0),
  pendSeries(list, portal) { return list.filter(e => e.portal === portal).sort((a, b) => a.asOf.localeCompare(b.asOf) || String(a._u || '').localeCompare(String(b._u || ''))).map(e => ({ x: e.asOf, y: DSH.pendTotal(e), e })); },
  latestPend(list, portal) { const s = DSH.pendSeries(list, portal); return s[s.length - 1] || null; },
  /* ---- SVG charts ---- */
  svgBars(rows, { w = 340, bar = 18, gap = 8, labelW = 56 } = {}) {
    if (!rows.length) return '<div class="muted">No data yet</div>';
    const max = Math.max(1, ...rows.map(r => r.total)), H = rows.length * (bar + gap) + 6, BW = w - labelW - 44;
    return `<svg class="chart" viewBox="0 0 ${w} ${H}" role="img" aria-label="Inspected vs pending">${rows.map((r, i) => { const y = i * (bar + gap) + 2, a = BW * r.done / max, b = BW * r.pending / max;
      return `<text x="0" y="${y + bar - 5}" font-size="12" font-weight="600" fill="#1c2033">${esc(r.type)}</text><rect x="${labelW}" y="${y}" width="${a.toFixed(1)}" height="${bar}" rx="3" fill="#2e7d32"/><rect x="${(labelW + a).toFixed(1)}" y="${y}" width="${b.toFixed(1)}" height="${bar}" rx="3" fill="#ffb74d"/><text x="${(labelW + a + b + 4).toFixed(1)}" y="${y + bar - 5}" font-size="11" fill="#6b7280">${r.done}/${r.total}</text>`; }).join('')}</svg>`;
  },
  svgDonut(done, total, { size = 92, label = '' } = {}) {
    const r = 36, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="46" cy="46" r="${r}" fill="none" stroke="#ffe0b2" stroke-width="12"/><circle cx="46" cy="46" r="${r}" fill="none" stroke="#2e7d32" stroke-width="12" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 46 46)"/><text x="46" y="50" text-anchor="middle" font-size="16" font-weight="700" fill="#1a237e">${Math.round(f * 100)}%</text>${label ? `<text x="46" y="64" text-anchor="middle" font-size="9" fill="#6b7280">${esc(label)}</text>` : ''}</svg>`;
  },
  svgLine(pts, { w = 320, h = 90 } = {}) {
    if (pts.length < 2) return pts.length ? `<div class="muted">One entry so far – the trend appears after the next one.</div>` : '<div class="muted">No entries yet</div>';
    const max = Math.max(1, ...pts.map(p => p.y)), sx = i => 8 + (w - 16) * i / (pts.length - 1), sy = v => h - 18 - (h - 30) * v / max;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Trend"><path d="${d}" fill="none" stroke="#3949ab" stroke-width="2.5"/>${pts.map((p, i) => `<circle cx="${sx(i).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="#1a237e"/><text x="${sx(i).toFixed(1)}" y="${(sy(p.y) - 7).toFixed(1)}" font-size="10" text-anchor="middle" fill="#1c2033">${p.y}</text>`).join('')}<text x="8" y="${h - 3}" font-size="9" fill="#6b7280">${dmy(pts[0].x)}</text><text x="${w - 8}" y="${h - 3}" font-size="9" text-anchor="end" fill="#6b7280">${dmy(pts[pts.length - 1].x)}</text></svg>`;
  }
};
/* ---------- local notifications for reminders (Android app; iPhone / web = in-app only) ---------- */
const REM = {
  LN: () => (typeof V !== 'undefined' && V.isNative() && V.plugin('LocalNotifications')) || null,
  async schedule(r) {
    const LN = REM.LN(); if (!LN) return { ok: false, why: 'web' };
    try { await LN.cancel({ notifications: [{ id: DSH.notifId(r.id) }] }); } catch (e) {}
    const sch = DSH.notifSchedule(r); if (!sch || r.deleted) return { ok: true, n: 0 };
    try { let p = await LN.checkPermissions(); if (p.display !== 'granted') p = await LN.requestPermissions(); if (p.display !== 'granted') return { ok: false, why: 'denied' };
      await LN.schedule({ notifications: [{ id: DSH.notifId(r.id), title: '⏰ ' + r.title, body: (r.notes || 'Reminder / રીમાઇન્ડર') + (r.time ? ' · ' + r.time : ''), schedule: sch, smallIcon: 'ic_stat_batti', extra: { reminderId: r.id } }] });
      return { ok: true, n: 1 }; } catch (e) { console.warn(e); return { ok: false, why: e.message }; }
  },
  async cancel(id) { const LN = REM.LN(); if (LN) try { await LN.cancel({ notifications: [{ id: DSH.notifId(id) }] }); } catch (e) {} },
  /** after start-up / Drive sync: make the phone's alarms match the reminders list */
  async resyncAll() { const LN = REM.LN(); if (!LN) return; for (const r of await DB.all('reminders')) await REM.schedule(r); }
};

/* ---------- v1.7.1 portal figures (fetched JSON, cached per district) ---------- */
const PFIG = {
  URL: 'https://silver-haupia-758dcf.netlify.app/portal-figures.json',
  K: { cur: 'pf.cur', prev: 'pf.prev', err: 'pf.err' },
  get(k) { try { return JSON.parse(localStorage.getItem(DIST.ls(PFIG.K[k])) || 'null'); } catch (e) { return null; } },
  set(k, v) { localStorage.setItem(DIST.ls(PFIG.K[k]), JSON.stringify(v)); },
  /** file is either flat {asOf,district,...} or {districts:{surat:{...},valsad:{...}}}; returns figures for district or null */
  pick(j, dist) {
    if (!j || typeof j !== 'object') return null;
    if (j.districts) return j.districts[dist] || null;
    return (j.district || 'surat') === dist ? j : null;
  },
  validate(f) { if (!f || !f.asOf || !(f.eprohibition || f.esarkar || f.lems)) throw new Error('Not a portal-figures file (needs asOf and eprohibition / esarkar / lems)'); return f; },
  /** store new figures; previous kept for delta only when asOf changed */
  accept(f) { const cur = PFIG.get('cur'); if (cur && cur.asOf !== f.asOf) PFIG.set('prev', cur); if (!cur || cur.asOf !== f.asOf || JSON.stringify(cur) !== JSON.stringify(f)) PFIG.set('cur', f); PFIG.set('err', null); return f; },
  async fetchNow() {
    try { const r = await fetch(PFIG.URL + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const f = PFIG.pick(await r.json(), DIST.key); if (!f) { PFIG.set('err', 'not fetched yet'); return null; } return PFIG.accept(PFIG.validate(f));
    } catch (e) { PFIG.set('err', 'offline – showing last saved (' + e.message + ')'); return null; }
  },
  importText(txt) { const j = JSON.parse(txt), f = PFIG.pick(j, DIST.key) || (j.districts ? null : j); if (!f) throw new Error('This file has no figures for ' + DIST.info.en); return PFIG.accept(PFIG.validate(f)); },
  n: v => (v === null || v === undefined || v === '') ? null : Number(v),
  delta(cur, prev) { const a = PFIG.n(cur), b = PFIG.n(prev); if (a === null || b === null) return ''; const d = a - b; return d === 0 ? '<span class="dl">±0</span>' : `<span class="dl ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`; },
  when(s) { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); },
  bars(rows) { const vals = rows.map(r => PFIG.n(r.v)).filter(v => v !== null), max = Math.max(1, ...vals), w = 300, bh = 16, g = 6, lw = 108;
    return `<svg class="chart" viewBox="0 0 ${w} ${rows.length * (bh + g) + 4}">${rows.map((r, i) => { const y = i * (bh + g) + 2, v = PFIG.n(r.v), bw = v === null ? 0 : (w - lw - 40) * v / max;
      return `<text x="0" y="${y + bh - 4}" font-size="11" fill="#1c2033">${esc(r.l)}</text><rect x="${lw}" y="${y}" width="${bw.toFixed(1)}" height="${bh}" rx="3" fill="${r.c || '#3949ab'}"/><text x="${(lw + bw + 4).toFixed(1)}" y="${y + bh - 4}" font-size="11" fill="#6b7280">${v === null ? 'not checked' : v}</text>`; }).join('')}</svg>`; },
  card() {
    const f = PFIG.get('cur'), p = PFIG.get('prev') || {}, err = PFIG.get('err'), V = v => PFIG.n(v) === null ? '–' : PFIG.n(v);
    if (!f) return `<div class="card span2" id="pfcard"><h3>📋 Portal figures <small class="gu">પોર્ટલ પડતર</small> – ${esc(DIST.info.en)}</h3><div class="muted">${esc(DIST.info.en)}: not fetched yet / હજુ મેળવેલ નથી.</div><div class="btns"><button class="btn sec sm" data-pf="refresh">↻ Refresh</button><button class="btn sec sm" data-pf="import">⬆ Import figures</button></div></div>`;
    const ep = f.eprohibition || {}, pe = p.eprohibition || {}, es = f.esarkar || {}, ps = p.esarkar || {}, le = f.lems || {}, pl = p.lems || {};
    const other = o => Object.entries(o || {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `<span class="chip sm">${esc(k)}: ${esc(v)}</span>`).join(' ');
    return `<div class="card span2" id="pfcard"><h3>📋 Portal figures <small class="gu">પોર્ટલ પડતર</small> – ${esc(DIST.info.en)}</h3>
      <div class="muted">as of ${PFIG.when(f.asOf)}${err ? ' · ⚠️ ' + esc(err) : ''}</div>
      <div class="pfsec"><div class="pn">e-Prohibition <small class="gu">ઈ-પ્રોહિબિશન</small>${ep.asOf ? ` <small class="muted">${PFIG.when(ep.asOf)}</small>` : ''}</div>
        <div class="pgrid4">${[['New', 'newApplications'], ['Pending', 'pending'], ['Approved', 'approved'], ['Rejected', 'rejected']].map(([l, k]) => `<div class="pcard" style="cursor:pointer" onclick="go('#pendency/eprohibition')"><div class="pn">${l}</div><b>${V(ep[k])}</b>${PFIG.delta(ep[k], pe[k])}</div>`).join('')}</div>
        ${PFIG.bars([{ l: 'New applications', v: ep.newApplications, c: '#3949ab' }, { l: 'Pending', v: ep.pending, c: '#ef6c00' }, { l: 'Approved', v: ep.approved, c: '#2e7d32' }, { l: 'Rejected', v: ep.rejected, c: '#c62828' }])}
        ${ep.officerPendency && (ep.officerPendency.rows || []).length ? `<details open><summary>Office pendency – officer-wise (as on portal)</summary><table class="t"><tr><th>Pending with</th>${ep.officerPendency.columns.map(c => `<th>${esc(c.replace(' Application', ''))}</th>`).join('')}</tr>${ep.officerPendency.rows.map(r => `<tr><td>${esc(r.pendingWith)}</td>${ep.officerPendency.columns.map(c => `<td>${esc(r.counts[c] ?? '–')}</td>`).join('')}</tr>`).join('')}<tr><th>Total</th>${ep.officerPendency.columns.map(c => `<th>${ep.officerPendency.rows.reduce((a, r) => a + (Number(r.counts[c]) || 0), 0)}</th>`).join('')}</tr></table></details>` : ''}
        ${(ep.officers || []).length ? `<details><summary>Officer-wise (${ep.officers.length})</summary><table class="t"><tr><th>Officer</th><th>Post</th><th>Pending</th></tr>${ep.officers.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.post || '')}</td><td>${o.pending === null || o.pending === undefined ? '–' : esc(o.pending)}</td></tr>`).join('')}</table></details>` : ''}</div>
      <div class="pfsec"><div class="pn">e-Sarkar <small class="gu">ઈ-સરકાર</small>${es.asOf ? ` <small class="muted">${PFIG.when(es.asOf)}</small>` : ''}</div>
        <div class="pgrid4"><div class="pcard" style="cursor:pointer" onclick="go('#pendency/esarkar')"><div class="pn">Files</div><b>${V(es.files)}</b>${PFIG.delta(es.files, ps.files)}</div></div><div>${other(es.other)}</div></div>
      <div class="pfsec"><div class="pn">LEMS – Liquor and Excise Management System${le.asOf ? ` <small class="muted">${PFIG.when(le.asOf)}</small>` : ''}</div>
        <div class="pgrid4"><div class="pcard" style="cursor:pointer" onclick="go('#pendency/lems')"><div class="pn">IP verif. New</div><b>${V(le.ipVerificationNew)}</b>${PFIG.delta(le.ipVerificationNew, pl.ipVerificationNew)}</div><div class="pcard" style="cursor:pointer" onclick="go('#pendency/lems')"><div class="pn">IP verif. Extend</div><b>${V(le.ipVerificationExtend)}</b>${PFIG.n(le.ipVerificationExtend) === null ? '<div class="muted">not checked yet</div>' : PFIG.delta(le.ipVerificationExtend, pl.ipVerificationExtend)}</div></div><div>${other(le.other)}</div></div>
      <div class="btns"><button class="btn sec sm" data-pf="refresh">↻ Refresh</button><button class="btn sec sm" data-pf="import">⬆ Import figures</button></div>
      <div class="muted">Pull down on the Dashboard to refresh. ▲▼ = change since previous figures.</div></div>`;
  },
  bind(rerender) {
    $$('[data-pf="refresh"]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = '…'; await PFIG.fetchNow(); rerender(); });
    $$('[data-pf="import"]').forEach(b => b.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
      i.onchange = async () => { try { PFIG.importText(await i.files[0].text()); toast('Figures imported ✓'); rerender(); } catch (e) { alert('Import failed: ' + e.message); } }; i.click(); });
  },
  /** pull-to-refresh on the dashboard */
  ptr(rerender) {
    if (PFIG._ptr) return; PFIG._ptr = true; let y0 = null;
    addEventListener('touchstart', e => { y0 = (location.hash || '#home').startsWith('#home') && scrollY <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    addEventListener('touchend', async e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (dy > 90) { toast('Refreshing figures…'); await PFIG.fetchNow(); if ((location.hash || '#home').startsWith('#home')) rerender(); } }, { passive: true });
  }
};
/* ---------- screens ---------- */
const DASH_ROUTES = {
  async home() {
    const t = todayStr(), prof = await L.profile(), role = await TEAM.role();
    setTop('Dashboard / ડેશબોર્ડ', `${DIST.info.gu} · ${parseYmd(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`);
    const [rems, meets, offs, pend, lics, ins] = await Promise.all(['reminders', 'meetings', 'offices', 'pendency', 'licensees', 'inspections'].map(s => DB.all(s)));
    const day = (await DB.get('days', t)) || L.defaultDay(t, prof), bst = await BK.status();
    const todayR = DSH.remindersFor(rems, t), lateR = DSH.overdueReminders(rems, t), todayM = DSH.meetingsOn(meets, t), upM = DSH.upcomingMeetings(meets, t, 4);
    const od = DSH.officesDue(offs, t), per = DSH.periods(t); S.dPer ||= 'fy';
    const scoped = await TEAM.scopeLicensees(lics), st = { fy: DSH.licStats(scoped, ins, per.fy), q: DSH.licStats(scoped, ins, per.q), m: DSH.licStats(scoped, ins, per.m) };
    const inbox = await TEAM.inboxForMe();
    const remLi = r => `<li><button class="tick ${r.doneToday ? 'on' : ''}" data-rt="${esc(r.id)}" aria-label="Done">${r.doneToday ? '✓' : ''}</button><div class="main" onclick="go('#reminder/${esc(r.id)}')"><div class="t ${r.doneToday ? 'strike' : ''}">${esc(r.title)}</div><div class="s">${esc(r.time || '')}${r.repeat ? ' · 🔁 ' + esc(REPEATS[r.repeat].split(' / ')[0]) : ''}${r.date < t && !r.repeat ? ' · <span class="bad">from ' + dmy(r.date) + '</span>' : ''}</div></div></li>`;
    const meetLi = m => `<li onclick="go('#meeting/${esc(m.id)}')"><div style="width:52px;text-align:center"><b>${esc(m.time || '–')}</b><div class="muted">${m.date === t ? 'today' : dmy(m.date).slice(0, 5)}</div></div><div class="main"><div class="t">${esc(m.title)}</div><div class="s">${esc(m.place || '')}${m.meetLink ? ' · 🎥 Google Meet' : ''}</div></div>${m.meetLink ? `<a class="btn sm" href="${esc(m.meetLink)}" target="_blank" onclick="event.stopPropagation()">Join</a>` : ''}</li>`;
    view().innerHTML = `<div class="dash">
    <div class="card span2 hello"><div class="row"><div><h3 style="margin:0">${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, ${role === 'admin' ? 'Sir' : esc((await TEAM.me())?.name || 'Sir')}</h3>
      <div class="gu" style="margin-top:4px">📅 ${esc(day.work)} ${kindPill(day.kind)}</div></div><button class="btn sec sm" style="flex:0" onclick="go('#day/${t}')">Diary</button></div>
      <div class="chips gu" id="quick">${(await KW.list('work')).slice(0, 6).map(k => `<button class="chip" data-w="${esc(k.text)}" data-k="${k.kind || 'office'}">${esc(k.text)}</button>`).join('')}</div>
      <div class="muted" style="margin-top:6px;cursor:pointer" onclick="go('#backup')">${bst.needsReminder ? '⚠️' : '💾'} Last backup: ${esc(BK.fmt(BK.isNative() ? bst.lastAt : bst.offAt))}</div></div>
    ${inbox.unread.length ? `<div class="card span2 warnbox"><h3>📢 Instructions / સૂચનાઓ <span class="pill bad">${inbox.unread.length} new</span></h3><ul class="list">${inbox.unread.slice(0, 4).map(m => `<li><div class="main" onclick="go('#team')"><div class="t gu">${esc(m.text)}</div><div class="s">${esc(m.fromName || m.from)} · ${esc(TEAM.when(m.at))}</div></div><button class="btn sm" data-read="${esc(m.id)}">Read ✓</button></li>`).join('')}</ul></div>` : ''}
    <div class="card"><h3>⏰ Today's reminders <small class="gu">આજના રીમાઇન્ડર</small></h3>
      ${todayR.length || lateR.length ? `<ul class="list">${[...lateR.map(r => ({ ...r, doneToday: false })), ...todayR].map(remLi).join('')}</ul>` : '<div class="muted">Nothing for today.</div>'}
      <div class="btns"><button class="btn sm" onclick="go('#reminder/new')">＋ Reminder</button><button class="btn sec sm" onclick="go('#reminders')">All</button></div></div>
    <div class="card"><h3>👥 Meetings <small class="gu">મીટીંગ</small></h3>
      ${todayM.length ? `<div class="sec-title">Today</div><ul class="list">${todayM.map(meetLi).join('')}</ul>` : '<div class="muted">No meeting today.</div>'}
      ${upM.length ? `<div class="sec-title">Upcoming</div><ul class="list">${upM.map(meetLi).join('')}</ul>` : ''}
      <div class="btns"><button class="btn sm" onclick="go('#meeting/new')">＋ Meeting</button>${role === 'admin' ? `<button class="btn acc sm" onclick="go('#meetnow')">🎥 Team meeting</button>` : ''}<button class="btn sec sm" onclick="go('#meetings')">All</button></div></div>
    <div class="card span2"><h3>📊 Licence inspection status <small class="gu">પરવાના તપાસણી સ્થિતિ</small></h3>
      <div class="donuts">${['fy', 'q', 'm'].map(k => `<button class="dn ${S.dPer === k ? 'on' : ''}" data-per="${k}">${DSH.svgDonut(st[k].done, st[k].total)}<div><b>${st[k].done}</b> / ${st[k].total}</div><small>${esc(per[k].en)}<br><span class="gu">${per[k].gu}</span></small></button>`).join('')}</div>
      <div class="legend"><span><i style="background:#2e7d32"></i>Inspected / તપાસેલ</span><span><i style="background:#ffb74d"></i>Pending / બાકી</span> <span class="muted">${esc(per[S.dPer].en)}: ${dmy(per[S.dPer].from)} – ${dmy(per[S.dPer].to > t ? t : per[S.dPer].to)}</span></div>
      <div class="btns dtiles">${(() => { const P = S.dPer, s = st[P], nIns = ins.filter(i => !i.excluded && i.date >= per[P].from && i.date <= per[P].to).length, nAct = scoped.reduce((a, l) => a + (l.licences || []).filter(x => (x.status || 'active') === 'active').length, 0), nIna = scoped.reduce((a, l) => a + (l.licences || []).filter(x => (x.status || 'active') !== 'active').length, 0);
        return `<button class="btn sm" onclick="go('#dlist/done?per=${P}')">✓ Inspected ${s.done} ›</button><button class="btn sec sm" onclick="go('#dlist/pending?per=${P}')">⏳ Pending ${s.pending} ›</button><button class="btn sec sm" onclick="go('#dlist/ins?per=${P}')">📝 Inspections ${nIns} ›</button><button class="btn sec sm" onclick="go('#dlist/active')">Active licences ${nAct} ›</button><button class="btn sec sm" onclick="go('#dlist/inactive')">⛔ Inactive ${nIna} ›</button>`; })()}</div>
      ${DSH.svgBars(st[S.dPer].rows)}
      <div class="chips dchips">${st[S.dPer].rows.map(r => `<button class="chip" onclick="go('#dlist/pending?per=${S.dPer}&type=${encodeURIComponent(r.type)}')">${esc(r.type)} ${r.done}/${r.total} ›</button>`).join('')}</div>
      <button class="btn sec block sm" onclick="go('#due')">Licences due as per ધોરણ ›</button></div>
    <div class="card"><h3>🏢 Office inspections due <small class="gu">કચેરી તપાસણી</small></h3>
      ${od.length ? `<ul class="list">${od.slice(0, 6).map(({ o, s }) => `<li onclick="go('#office/${esc(o.id)}')"><div class="main"><div class="t">${esc(o.name)}</div><div class="s">last: ${o.last ? dmy(o.last) : '—'} · every ${o.months || 12} months</div></div><span class="pill ${s.overdue ? 'bad' : 'warn'}">${s.overdue ? 'overdue' : 'this month'}</span></li>`).join('')}</ul>` : `<div class="muted">${offs.length ? 'Nothing due this month. 👍' : 'Add the offices under you to track their inspections.'}</div>`}
      <div class="btns"><button class="btn sec sm" onclick="go('#offices')">Offices (${offs.length})</button></div></div>
    ${PFIG.card()}
    ${role === 'admin' ? `<div class="card span2"><div class="btns" style="margin:0"><button class="btn" onclick="go('#monitor')">📈 Monitoring board</button><button class="btn sec" onclick="go('#staff')">👮 Staff register</button><button class="btn sec" onclick="go('#team')">💬 Team chat</button></div></div>` : ''}
    </div>`;
    PFIG.bind(() => DASH_ROUTES.home()); PFIG.ptr(() => DASH_ROUTES.home());
    if (!DASH_ROUTES._pfOpened) { DASH_ROUTES._pfOpened = true; PFIG.fetchNow().then(f => { if (f && (location.hash || '#home').startsWith('#home')) DASH_ROUTES.home(); }); }
    $$('#quick .chip').forEach(b => b.onclick = async () => { await saveDayQuick(t, b.dataset.w, b.dataset.k); DASH_ROUTES.home(); });
    $$('[data-per]').forEach(b => b.onclick = () => { S.dPer = b.dataset.per; DASH_ROUTES.home(); });
    $$('[data-rt]').forEach(b => b.onclick = async () => { const r = rems.find(x => x.id === b.dataset.rt); await DSH_ACT.toggleDone(r, r.repeat || r.date >= t ? t : r.date); DASH_ROUTES.home(); });
    $$('[data-read]').forEach(b => b.onclick = async () => { await TEAM.markRead(b.dataset.read); toast('Marked read ✓'); DASH_ROUTES.home(); });
  },
  async reminders() {
    setTop('Reminders', 'રીમાઇન્ડર', true, `<button onclick="go('#reminder/new')">＋</button>`);
    const t = todayStr(), all = (await DB.all('reminders')).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const act = all.filter(r => r.repeat || !r.done), done = all.filter(r => !r.repeat && r.done).reverse();
    const li = r => `<li onclick="go('#reminder/${esc(r.id)}')"><div class="main"><div class="t">${esc(r.title)}</div><div class="s">${dmy(r.date)} ${esc(r.time || '')}${r.repeat ? ' · 🔁 ' + esc(REPEATS[r.repeat]) : ''}</div></div>${!r.repeat && r.date < t && !r.done ? '<span class="pill bad">late</span>' : ''}</li>`;
    view().innerHTML = `<div class="card"><h3>Active (${act.length})</h3>${act.length ? `<ul class="list">${act.map(li).join('')}</ul>` : '<div class="muted">None</div>'}<button class="btn block" onclick="go('#reminder/new')">＋ Add reminder</button></div>
      ${done.length ? `<div class="card"><h3>Done (${done.length})</h3><ul class="list">${done.slice(0, 30).map(li).join('')}</ul></div>` : ''}
      <div class="card muted">${REM.LN() ? '🔔 The phone will notify you at the reminder time.' : '🔔 On iPhone / browser, reminders show on the Dashboard (no pop-up alarm).'}</div>`;
  },
  async reminder(id) {
    const r = id === 'new' ? { id: uid(), title: '', date: todayStr(), time: '10:00', repeat: '', notes: '', done: false, doneDates: [] } : await DB.get('reminders', id);
    if (!r) return go('#reminders');
    setTop(id === 'new' ? 'New reminder' : 'Reminder', 'રીમાઇન્ડર', true);
    view().innerHTML = `<div class="card gu"><label>What / શું</label><input id="rt" value="${esc(r.title)}" placeholder="e.g. Send monthly diary to Gandhinagar">
      <div class="grid2"><div><label>Date</label><input type="date" id="rd" value="${esc(r.date)}"></div><div><label>Time</label><input type="time" id="rh" value="${esc(r.time || '')}"></div></div>
      <label>Repeat / પુનરાવર્તન</label><div class="seg" id="rr">${Object.entries(REPEATS).map(([k, v]) => `<button data-r="${k}" class="${(r.repeat || '') === k ? 'on' : ''}">${esc(v.split(' / ')[0])}</button>`).join('')}</div>
      <label>Notes</label><textarea id="rn">${esc(r.notes || '')}</textarea>
      ${!r.repeat && id !== 'new' ? `<label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="rdone" style="width:auto" ${r.done ? 'checked' : ''}> Done ✓</label>` : ''}
      <button class="btn block" id="save">Save</button>${id === 'new' ? '' : '<button class="btn danger block" id="del">Delete</button>'}</div>`;
    let rep = r.repeat || ''; $$('#rr button').forEach(b => b.onclick = () => { rep = b.dataset.r; $$('#rr button').forEach(x => x.classList.toggle('on', x === b)); });
    KW.attach($('#rt'), { cat: 'remark' });
    $('#save').onclick = async () => { if (!$('#rt').value.trim()) return alert('Please type the reminder'); Object.assign(r, { title: $('#rt').value.trim(), date: $('#rd').value || todayStr(), time: $('#rh').value, repeat: rep, notes: $('#rn').value, done: $('#rdone') ? $('#rdone').checked : r.done });
      await DB.put('reminders', r); const s = await REM.schedule(r); toast(s.ok && s.n ? 'Saved – phone will remind you 🔔' : 'Saved'); go('#reminders'); };
    $('#del') && ($('#del').onclick = async () => { if (!confirm('Delete this reminder?')) return; await REM.cancel(r.id); await DB.del('reminders', r.id); go('#reminders'); });
  },
  async meetings() {
    setTop('Meetings', 'મીટીંગ', true, `<button onclick="go('#meeting/new')">＋</button>`);
    const t = todayStr(), all = (await DB.all('meetings')).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const up = all.filter(m => m.date >= t), past = all.filter(m => m.date < t).reverse();
    const li = m => `<li onclick="go('#meeting/${esc(m.id)}')"><div class="main"><div class="t">${esc(m.title)}</div><div class="s">${dmy(m.date)} ${esc(m.time || '')} · ${esc(m.place || '')}${m.meetLink ? ' · 🎥 Meet' : ''}</div></div></li>`;
    view().innerHTML = `<div class="card"><h3>Upcoming (${up.length})</h3>${up.length ? `<ul class="list">${up.map(li).join('')}</ul>` : '<div class="muted">None</div>'}
      <div class="btns"><button class="btn" onclick="go('#meeting/new')">＋ Add meeting</button>${(await TEAM.role()) === 'admin' ? `<button class="btn acc" onclick="go('#meetnow')">🎥 Team meeting (Meet)</button>` : ''}</div></div>
      ${past.length ? `<div class="card"><h3>Past</h3><ul class="list">${past.slice(0, 30).map(li).join('')}</ul></div>` : ''}`;
  },
  async meeting(id) {
    const m = id === 'new' ? { id: uid(), title: '', date: todayStr(), time: '11:00', place: '', notes: '' } : await DB.get('meetings', id);
    if (!m) return go('#meetings');
    setTop(id === 'new' ? 'New meeting' : 'Meeting', 'મીટીંગ', true);
    view().innerHTML = `<div class="card gu"><label>Title / વિષય</label><input id="mt" value="${esc(m.title)}">
      <div class="grid2"><div><label>Date</label><input type="date" id="md" value="${esc(m.date)}"></div><div><label>Time</label><input type="time" id="mh" value="${esc(m.time || '')}"></div></div>
      <label>Place / સ્થળ</label><input id="mp" value="${esc(m.place || '')}" placeholder="Collector office, VC, Gandhinagar…">
      ${m.meetLink ? `<label>Google Meet</label><a class="btn acc block" href="${esc(m.meetLink)}" target="_blank">🎥 Join ${esc(m.meetLink.replace('https://', ''))}</a>` : ''}
      <label>Notes</label><textarea id="mn">${esc(m.notes || '')}</textarea>
      <label style="display:flex;gap:8px;color:var(--txt)"><input type="checkbox" id="mrem" style="width:auto" ${id === 'new' ? 'checked' : ''}> Remind me 30 minutes before</label>
      <button class="btn block" id="save">Save</button>${id === 'new' ? '' : '<button class="btn danger block" id="del">Delete</button>'}</div>`;
    KW.attach($('#mt'), { cat: 'remark' });
    $('#save').onclick = async () => { if (!$('#mt').value.trim()) return alert('Please type the title');
      Object.assign(m, { title: $('#mt').value.trim(), date: $('#md').value || todayStr(), time: $('#mh').value, place: $('#mp').value, notes: $('#mn').value }); await DB.put('meetings', m);
      if ($('#mrem').checked && m.time) { const [h, mi] = m.time.split(':').map(Number), d = new Date(parseYmd(m.date).setHours(h, mi - 30)); const r = { id: 'mt-' + m.id, title: 'Meeting: ' + m.title, date: ymd(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()), repeat: '', notes: m.place || '', done: false, meetingId: m.id }; await DB.put('reminders', r); await REM.schedule(r); }
      toast('Saved'); go('#meetings'); };
    $('#del') && ($('#del').onclick = async () => { if (!confirm('Delete this meeting?')) return; await DB.del('meetings', m.id); if (await DB.get('reminders', 'mt-' + m.id)) { await REM.cancel('mt-' + m.id); await DB.del('reminders', 'mt-' + m.id); } go('#meetings'); });
  },
  async offices() {
    setTop('Offices under you', 'તાબાની કચેરીઓ', true, `<button onclick="go('#office/new')">＋</button>`);
    const t = todayStr(), all = (await DB.all('offices')).map(o => ({ o, s: DSH.officeStatus(o, t) })).sort((a, b) => (a.s.due || '0').localeCompare(b.s.due || '0'));
    view().innerHTML = `<div class="card">${all.length ? `<ul class="list">${all.map(({ o, s }) => `<li onclick="go('#office/${esc(o.id)}')"><div class="main"><div class="t">${esc(o.name)}</div><div class="s">${esc(o.place || '')} · last ${o.last ? dmy(o.last) : '—'} · every ${o.months || 12} m</div></div><span class="pill ${s.overdue ? 'bad' : s.thisMonth ? 'warn' : 'ok'}">${s.overdue ? 'overdue' : s.thisMonth ? 'this month' : esc(s.label)}</span></li>`).join('')}</ul>` : '<div class="muted">No offices yet. Add the sub-offices / police stations / check posts you have to inspect.</div>'}
      <button class="btn block" onclick="go('#office/new')">＋ Add office</button></div>`;
  },
  async office(id) {
    const o = id === 'new' ? { id: uid(), name: '', place: '', last: '', months: 12, notes: '' } : await DB.get('offices', id);
    if (!o) return go('#offices');
    setTop(id === 'new' ? 'New office' : 'Office', 'કચેરી', true);
    view().innerHTML = `<div class="card gu"><label>Office name / કચેરીનું નામ</label><input id="on" value="${esc(o.name)}"><label>Place</label><input id="op" value="${esc(o.place || '')}">
      <div class="grid2"><div><label>Last inspected</label><input type="date" id="ol" value="${esc(o.last || '')}"></div><div><label>Every (months)</label><input id="om" inputmode="numeric" value="${esc(o.months || 12)}"></div></div>
      <label>Notes</label><textarea id="ono">${esc(o.notes || '')}</textarea>
      <div class="btns"><button class="btn" id="save">Save</button><button class="btn acc" id="today">✓ Inspected today</button></div>${id === 'new' ? '' : '<button class="btn danger block" id="del">Delete</button>'}</div>`;
    const save = async last => { if (!$('#on').value.trim()) return alert('Please type the office name'); Object.assign(o, { name: $('#on').value.trim(), place: $('#op').value, last: last ?? $('#ol').value, months: Number($('#om').value) || 12, notes: $('#ono').value }); await DB.put('offices', o); toast('Saved'); go('#offices'); };
    $('#save').onclick = () => save(); $('#today').onclick = () => save(todayStr());
    $('#del') && ($('#del').onclick = async () => { if (!confirm('Delete this office?')) return; await DB.del('offices', o.id); go('#offices'); });
  },
  async pendency(portal) {
    portal = PORTALS[portal] ? portal : 'eprohibition'; const P = PORTALS[portal];
    setTop(P.en + ' pendency', 'પડતર – ' + P.gu, true);
    const all = await DB.all('pendency'), ser = DSH.pendSeries(all, portal), last = ser[ser.length - 1]?.e, cats = await DB.getSetting('pend.cats.' + portal, P.cats);
    view().innerHTML = `<div class="card"><div class="seg">${Object.entries(PORTALS).map(([k, p]) => `<button class="${k === portal ? 'on' : ''}" onclick="go('#pendency/${k}')">${esc(p.short || p.en)}</button>`).join('')}</div></div>
      <div class="card"><h3>Trend / વલણ <small>(total pending)</small></h3>${DSH.svgLine(ser.slice(-12))}</div>
      <div class="card gu"><h3>New entry / નવી એન્ટ્રી</h3><label>As of / તારીખ</label><input type="date" id="pa" value="${todayStr()}">
      ${cats.map((c, i) => `<div class="row" style="margin-top:6px"><div style="flex:1">${esc(c)}</div><input data-ci="${i}" inputmode="numeric" style="width:90px" value="${esc(last?.counts?.[c] ?? '')}"></div>`).join('')}
      <button class="btn sec sm" id="pcat" style="margin-top:8px">＋ / ✎ Categories</button>
      <label>Note</label><input id="pn"><button class="btn block" id="psave">Save entry</button></div>
      <div class="card"><h3>History</h3>${ser.length ? `<div class="scroll-x"><table class="t"><tr><th>As of</th>${cats.map(c => `<th>${esc(c.split(' / ')[0])}</th>`).join('')}<th>Total</th><th></th></tr>${ser.slice().reverse().map(({ e, y }) => `<tr><td>${dmy(e.asOf)}</td>${cats.map(c => `<td>${esc(e.counts?.[c] ?? '')}</td>`).join('')}<td><b>${y}</b></td><td><button class="icon-btn sm" data-pdel="${esc(e.id)}">🗑</button></td></tr>`).join('')}</table></div>` : '<div class="muted">No entries yet.</div>'}</div>`;
    $('#psave').onclick = async () => { const counts = {}; $$('[data-ci]').forEach(i => { if (i.value !== '') counts[cats[+i.dataset.ci]] = Number(i.value) || 0; }); if (!Object.keys(counts).length) return alert('Enter at least one count');
      await DB.put('pendency', { id: uid(), portal, asOf: $('#pa').value || todayStr(), counts, note: $('#pn').value }); toast('Saved'); DASH_ROUTES.pendency(portal); };
    $('#pcat').onclick = () => openSheet(`<h3>Categories – ${esc(P.en)}</h3><div class="muted">One per line</div><textarea id="pc" rows="7" class="gu">${esc(cats.join('\n'))}</textarea><div class="btns"><button class="btn" id="pcs">Save</button><button class="btn sec" onclick="closeSheet()">Cancel</button></div>`, c => {
      $('#pcs', c).onclick = async () => { const v = $('#pc', c).value.split('\n').map(x => x.trim()).filter(Boolean); if (!v.length) return; await DB.setSetting('pend.cats.' + portal, v); closeSheet(); DASH_ROUTES.pendency(portal); }; });
    $$('[data-pdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this entry?')) return; await DB.del('pendency', b.dataset.pdel); DASH_ROUTES.pendency(portal); });
  }
};
const DSH_ACT = {
  async toggleDone(r, date) {
    if (r.repeat) { const s = new Set(r.doneDates || []); s.has(date) ? s.delete(date) : s.add(date); r.doneDates = [...s].sort().slice(-60); }
    else { r.done = !r.done; if (r.done) await REM.cancel(r.id); else await REM.schedule(r); }
    const { doneToday, ...rec } = r; await DB.put('reminders', rec);
  }
};
if (typeof module !== 'undefined') module.exports = { DSH, PORTALS, DSH_ACT, REM, PFIG };
