'use strict';
/* v1.8.0 Monthly performance / efficiency report (portal disposal), from April 2026, per district.
   Two sources, never estimated:
   (a) portal-history.json – monthly summary of the twice-daily portal readings (pendency counts only);
   (b) monthly disposal figures typed from the portal's own monthly reports (stored in this district's 'pendency' store, Drive-synced).
   LEMS Health Permits are a separate line inside LEMS and are added into the LEMS totals. */
const PR = {
  START: '2026-04',
  URL: 'portal-history.json',
  FIELDS: [
    ['ep', 'e-Prohibition', [['epRecv', 'Applications received'], ['epDisp', 'Applications disposed (approved + rejected)']]],
    ['lems', 'LEMS', [['ipRecv', 'IP verifications received'], ['ipDisp', 'IP verifications disposed'], ['hpReg', 'Health Permits registered (FL2 Process)']]],
    ['es', 'e-Sarkar', [['esRecv', 'Files + e-Tappal received'], ['esDisp', 'Files + e-Tappal disposed']]]
  ],
  months(to) { const out = []; for (let m = PR.START; m <= to; m = addMonths(m, 1)) out.push(m); return out; },
  async history() { for (const u of [PR.URL, 'https://aryajignesh007.github.io/inspection-app/portal-history.json']) try { const r = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) { const j = await r.json(); localStorage.setItem(DIST.ls('pr.hist'), JSON.stringify(j)); return j; } } catch (e) {} try { return JSON.parse(localStorage.getItem(DIST.ls('pr.hist')) || 'null'); } catch (e) { return null; } },
  async days() { for (const u of ['portal-days.json', 'https://aryajignesh007.github.io/inspection-app/portal-days.json']) try { const r = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) { const j = await r.json(); localStorage.setItem(DIST.ls('pr.days'), JSON.stringify(j)); return j; } } catch (e) {} try { return JSON.parse(localStorage.getItem(DIST.ls('pr.days')) || 'null'); } catch (e) { return null; } },
  async manual() { const o = {}; (await DB.all('pendency')).filter(p => p.portal === 'monthly').forEach(p => o[p.ym] = p); return o; },
  n: v => v === '' || v == null || isNaN(v) ? null : Number(v),
  pct: (d, r) => (d == null || r == null || r === 0) ? null : Math.round(1000 * d / r) / 10,
  calc(man, h) {
    const hp = h?.healthPermitMonth || {}, c = { hpReg: hp.registered, ...(man?.counts || {}) }, N = k => PR.n(c[k]);
    const lemsR = [N('ipRecv')], lemsD = [N('ipDisp'), N('hpReg')], sum = a => a.some(x => x != null) ? a.reduce((s, x) => s + (x || 0), 0) : null;
    const row = { ep: { r: N('epRecv'), d: N('epDisp') }, lems: { r: sum(lemsR), d: sum(lemsD), ipD: N('ipDisp'), hpReg: N('hpReg') }, es: { r: N('esRecv'), d: N('esDisp') } };
    row.ep.eff = PR.pct(row.ep.d, row.ep.r); row.es.eff = PR.pct(row.es.d, row.es.r); row.lems.eff = PR.pct(row.lems.ipD, row.lems.r);   // Health Permit = registered count (no received/pending), so it is in LEMS disposal but not in efficiency
    const tr = sum([row.ep.r, row.lems.r, row.es.r]), td = sum([row.ep.d, row.lems.ipD, row.es.d]);
    row.all = { r: tr, d: td, eff: PR.pct(td, tr) };
    return row;
  },
  chart(months, series, { max = null, unit = '' } = {}) {
    const W = 340, H = 170, pl = 30, pb = 26, cols = ['#3949ab', '#00897b', '#ef6c00', '#8e24aa'];
    const vals = series.flatMap(s => s.v).filter(v => v != null), M = max || Math.max(1, ...vals), gw = (W - pl) / months.length, bw = Math.max(3, (gw - 6) / series.length);
    let g = `<line x1="${pl}" y1="${H - pb}" x2="${W}" y2="${H - pb}" stroke="#999"/>`;
    months.forEach((m, i) => { const x0 = pl + i * gw + 3;
      series.forEach((s, j) => { const v = s.v[i]; if (v == null) { g += `<text x="${x0 + j * bw + bw / 2}" y="${H - pb - 3}" font-size="7" text-anchor="middle" fill="#bbb">–</text>`; return; } const h = (H - pb - 12) * v / M; g += `<rect x="${x0 + j * bw}" y="${H - pb - h}" width="${bw - 1}" height="${h}" fill="${cols[j % 4]}"/><text x="${x0 + j * bw + bw / 2}" y="${H - pb - h - 2}" font-size="7" text-anchor="middle">${v}${unit}</text>`; });
      g += `<text x="${pl + i * gw + gw / 2}" y="${H - 10}" font-size="8" text-anchor="middle">${EN_MON3[+m.slice(5) - 1]}</text>`; });
    const leg = series.map((s, j) => `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;font-size:11px"><i style="width:10px;height:10px;background:${cols[j % 4]};display:inline-block"></i>${esc(s.l)}</span>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:520px;background:#fff">${g}</svg><div>${leg}</div>`;
  },
  async data(to) {
    const months = PR.months(to), hist = await PR.history(), H = hist?.districts?.[DIST.key] || {}, man = await PR.manual(), dj = await PR.days(), DD = dj?.districts?.[DIST.key] || {};
    return { months, H, man, DD, dj, rows: months.map(m => ({ ym: m, h: H[m] || { noData: true }, c: PR.calc(man[m], H[m]), dd: DD.months?.[m] || null })), hist };
  },
  html(D, forPdf) {
    const { months, rows } = D, ser = (f) => rows.map(f), dash = v => v == null ? '–' : v;
    const effChart = PR.chart(months, [{ l: 'e-Prohibition', v: ser(r => r.c.ep.eff) }, { l: 'LEMS IP', v: ser(r => r.c.lems.eff) }, { l: 'e-Sarkar', v: ser(r => r.c.es.eff) }, { l: 'Overall', v: ser(r => r.c.all.eff) }], { max: 100, unit: '%' });
    const dispChart = PR.chart(months, [{ l: 'e-Prohibition', v: ser(r => r.c.ep.d) }, { l: 'LEMS IP', v: ser(r => r.c.lems.ipD) }, { l: 'Health Permit registered', v: ser(r => r.c.lems.hpReg) }, { l: 'e-Sarkar', v: ser(r => r.c.es.d) }]);
    const pendChart = PR.chart(months, [{ l: 'e-Prohibition pending (month end)', v: ser(r => r.h.noData ? null : r.h.eprohibition?.end?.pending) }, { l: 'LEMS IP awaiting (avg)', v: ser(r => r.h.noData ? null : r.h.lems?.avgIpAwaiting) }, { l: 'e-Sarkar files (avg)', v: ser(r => r.h.noData ? null : r.h.esarkar?.avgFiles) }, { l: 'e-Tappal (avg)', v: ser(r => r.h.noData ? null : r.h.esarkar?.avgTappal) }]);
    const mom = (a, b) => a == null || b == null ? '' : (a - b === 0 ? ' (±0)' : ` (${a - b > 0 ? '▲' : '▼'}${Math.abs(Math.round((a - b) * 10) / 10)})`);
    const tbl = `<table class="t" style="width:100%;font-size:12px"><tr><th>Month</th><th>e-Prohibition disp./recd. (eff.)</th><th>LEMS IP disp./recd. (eff.)</th><th>Health Permit registered</th><th>e-Sarkar disp./recd. (eff.)</th><th>Overall eff.</th><th>Portal readings</th></tr>
      ${rows.map((r, i) => { const p = rows[i - 1]?.c, c = r.c, f = (x, k) => x.r == null && x.d == null ? '<span class="muted">not entered</span>' : `${dash(k === 'lems' ? x.ipD : x.d)}/${dash(x.r)}${x.eff != null ? ' (' + x.eff + '%' + (p ? mom(x.eff, p[k].eff) : '') + ')' : ''}`;
        const h = r.h.noData ? '<span class="muted">no saved reading</span>' : `${r.h.readings} readings · pending at end ${dash(r.h.eprohibition?.end?.pending)} · LEMS awaiting ${dash(r.h.lems?.end?.ipAwaiting)} · e-Sarkar files ${dash(r.h.esarkar?.end?.files)}${r.h.lems?.healthRecorded ? '' : ' · Health Permit registered not read yet'}`;
        return `<tr><td>${esc(monthLabelEn(r.ym))}</td><td>${f(c.ep, 'ep')}</td><td>${f(c.lems, 'lems')}</td><td>${c.lems.hpReg == null ? '<span class="muted">not read yet</span>' : c.lems.hpReg + (p && p.lems.hpReg != null ? mom(c.lems.hpReg, p.lems.hpReg) : '')}</td><td>${f(c.es, 'es')}</td><td>${c.all.eff == null ? '–' : c.all.eff + '%' + (p ? mom(c.all.eff, p.all.eff) : '')}</td><td style="font-size:11px">${h}</td></tr>`; }).join('')}</table>`;
    const noData = rows.filter(r => r.h.noData && !r.h.healthPermitMonth && r.c.all.r == null).map(r => monthLabelEn(r.ym));
    return `<h3>${esc(DIST.info.en)} – Monthly efficiency &amp; performance (portal disposal) <small class="gu">માસિક કામગીરી અહેવાલ</small></h3>
      <div class="muted">Efficiency = disposed ÷ received in the month (from the portal's monthly figures entered below). Health Permit = registered count from LEMS FL2 Process (pending is not used); it adds to LEMS disposal but not to efficiency %. Months with no figures show "–"; nothing is estimated.</div>
      ${noData.length ? `<div class="warnbox" style="margin:6px 0">No portal data saved for: ${noData.map(esc).join(', ')}. Enter them from the portal's monthly report to fill the charts.</div>` : ''}
      <h4>Efficiency % by month</h4>${effChart}<h4>Disposal by month</h4>${dispChart}<h4>Pendency from twice-daily portal readings</h4>${pendChart}
      <h4>e-Prohibition – days to dispose (application date → approved date) <small class="gu">નિકાલમાં લાગેલ દિવસ</small></h4>
      ${PR.chart(months, [{ l: 'Median days', v: ser(r => r.dd?.medianDays ?? null) }, { l: 'Average days', v: ser(r => r.dd?.avgDays ?? null) }])}
      <div class="scroll-x"><table class="t" style="width:100%;font-size:12px"><tr><th>Month disposed</th><th>Disposed (dated)</th><th>Median days</th><th>Average days</th><th>Min–Max</th><th>≤30 days</th><th>≤60 days</th></tr>
      ${rows.map((r, i) => { const d = r.dd, p = rows[i - 1]?.dd; return `<tr><td>${esc(monthLabelEn(r.ym))}</td>${d ? `<td>${d.disposed}${d.rejected ? ' (' + d.rejected + ' rej.)' : ''}</td><td>${d.medianDays}${p ? mom(d.medianDays, p.medianDays) : ''}</td><td>${d.avgDays}</td><td>${d.minDays}–${d.maxDays}</td><td>${d.within30} (${Math.round(100 * d.within30 / d.disposed)}%)</td><td>${d.within60} (${Math.round(100 * d.within60 / d.disposed)}%)</td>` : '<td colspan="6" class="muted">no dated disposal in the portal list</td>'}</tr>`; }).join('')}</table></div>
      <div class="muted">${D.DD.asOf ? `From the e-Prohibition Approved License List as read on ${esc(PFIG.when(D.DD.asOf))}. ` : 'Not read yet. '}${D.DD.rejectedRead ? '' : 'Rejections are not included yet (no rejection-date list read). '}Fewer days = faster disposal; ▼ = faster than the previous month.</div>
      <h4>Month-over-month table</h4><div class="scroll-x">${tbl}</div>`;
  },
  async route(ym) {
    ym ||= todayStr().slice(0, 7);
    setTop('Monthly performance', 'માસિક કામગીરી – ' + DIST.info.gu, true);
    const D = await PR.data(todayStr().slice(0, 7)), sel = D.man[ym] || {}, c = sel.counts || {};
    view().innerHTML = `<div class="card">${PR.html(D)}<div class="btns"><button class="btn" id="prPdf">PDF</button><button class="btn sec" id="prPrint">Print</button></div></div>
      <div class="card"><h3>Enter / correct monthly portal figures <small>${esc(DIST.info.en)}</small></h3><div class="muted">Copy from each portal's monthly disposal report. Leave blank if not available (it stays "–"). Health Permit: registered figure from LEMS › FL2 Process only (not pending).</div>
      <label>Month</label><select id="prM">${D.months.map(m => `<option value="${m}" ${m === ym ? 'selected' : ''}>${monthLabelEn(m)}</option>`).join('')}</select>
      ${PR.FIELDS.map(([, t, fs]) => `<h4>${esc(t)}</h4>` + fs.map(([k, l]) => `<label>${esc(l)}</label><input data-pr="${k}" inputmode="numeric" value="${esc(c[k] ?? '')}">`).join('')).join('')}
      <label>Note / source</label><input id="prN" value="${esc(sel.note || '')}"><button class="btn block" id="prSave" style="margin-top:8px">Save month</button></div>`;
    $('#prM').onchange = () => go('#perf/' + $('#prM').value);
    $('#prSave').onclick = async () => { const counts = {}; $$('[data-pr]').forEach(i => { if (i.value.trim() !== '') counts[i.dataset.pr] = Number(i.value); });
      await DB.put('pendency', { id: 'monthly-' + ym, portal: 'monthly', ym, asOf: todayStr(), counts, note: $('#prN').value }); toast('Saved ' + monthLabelEn(ym)); PR.route(ym); };
    const pages = () => [`<div class="pg" style="font-size:12px">${PR.html(D, true)}</div>`];
    $('#prPdf').onclick = e => busy(e.target, async () => saveFile(await X.pagesToPdf(pages()), `Performance-${DIST.info.en}-${ym}.pdf`));
    $('#prPrint').onclick = () => X.printPages(pages());
  }
};
