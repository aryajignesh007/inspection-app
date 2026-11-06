'use strict';
/* v1.7.7 Dashboard drill-down: every Dashboard figure opens the list of records behind it (back = phone/browser back). */
const DLIST_ROUTES = {
  async dlist(kind, qs) {
    const q = new URLSearchParams(qs || ''), t = todayStr(), per = DSH.periods(t)[q.get('per') || S.dPer || 'fy'], type = q.get('type') || '';
    const [lics, ins] = await Promise.all([DB.all('licensees'), DB.all('inspections')]), scoped = await TEAM.scopeLicensees(lics), lm = {}; lics.forEach(l => lm[l.id] = l);
    const inPer = i => !TJ.skipInspection(i, lm[i.licenseeId]) && !i.excluded && i.date >= per.from && i.date <= per.to;
    const done = new Set(ins.filter(inPer).map(i => i.licenseeId + '|' + normCode(i.typeCode)));
    const tOk = c => !type || DSH.typeGroup(c) === type;
    const licRows = pred => { const out = []; for (const l of scoped) for (const lc of (l.licences || [])) { const c = normCode(lc.typeCode); if (tOk(c) && TJ.licBelongs(l, lc) && (kind === 'inactive' || !TJ.skipLicence(l, lc)) && pred(l, lc, c)) out.push({ l, lc, c }); } return out.sort((a, b) => a.l.name.localeCompare(b.l.name)); };
    const act = lc => !TJ.isInactive(lc);
    const T = { done: 'Inspected licences', pending: 'Licences pending inspection', ins: 'Inspections', active: 'Active licences', inactive: 'Inactive licences' };
    let rows = [], html = '';
    const licLi = r => `<li onclick="go('#lic/${esc(r.l.id)}')"><div class="main"><div class="t">${esc(r.l.name)}</div><div class="s">${esc(r.c)} · ULN ${esc(r.lc.uln || r.lc.licenceNo || '–')}${r.l.area ? ' · ' + esc(r.l.area) : ''}</div></div>${act(r.lc) ? '' : `<span class="pill bad" title="${esc(r.lc.inactiveReason || '')}">Inactive</span>`}</li>`;
    if (kind === 'done') rows = licRows((l, lc, c) => act(lc) && done.has(l.id + '|' + c));
    else if (kind === 'pending') rows = licRows((l, lc, c) => act(lc) && !done.has(l.id + '|' + c));
    else if (kind === 'active') rows = licRows((l, lc) => act(lc));
    else if (kind === 'inactive') rows = licRows((l, lc) => !act(lc));
    if (kind === 'ins') {
      rows = ins.filter(i => inPer(i) && tOk(normCode(i.typeCode))).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
      html = rows.map(i => `<li onclick="go('#insp/${esc(i.id)}')"><div class="main"><div class="t">${esc(lm[i.licenseeId]?.name || '-')}</div><div class="s">${dmy(i.date)} · ${esc(i.typeCode || '')} · ${esc(i.reportNo || '')}</div></div>${/^y/i.test(i.violations || '') ? '<span class="pill bad">violation</span>' : ''}</li>`).join('');
    } else html = rows.map(licLi).join('');
    const showPer = ['done', 'pending', 'ins'].includes(kind);
    setTop(T[kind] || 'List', `${DIST.info.en}${showPer ? ' · ' + per.en : ''}${type ? ' · ' + type : ''}`, true);
    view().innerHTML = `<div class="card"><h3>${esc(T[kind] || 'List')} <span class="pill">${rows.length}</span></h3><div class="muted">${esc(DIST.info.en)} district${showPer ? ' · ' + esc(per.en) + ': ' + dmy(per.from) + ' – ' + dmy(per.to > t ? t : per.to) : ''}${type ? ' · type ' + esc(type) : ''}. Tap an item to open it.</div>
      ${showPer ? `<div class="seg" style="margin-top:8px">${['fy', 'q', 'm'].map(k => `<button class="${per.key === k ? 'on' : ''}" onclick="go('#dlist/${kind}?per=${k}${type ? '&type=' + encodeURIComponent(type) : ''}')">${esc(DSH.periods(t)[k].en)}</button>`).join('')}</div>` : ''}
      ${type ? `<button class="btn sec sm" style="margin-top:8px" onclick="go('#dlist/${kind}?per=${per.key}')">Show all types</button>` : ''}</div>
      <div class="card">${html ? `<ul class="list" id="dl">${html}</ul>` : '<div class="muted">Nothing in this list.</div>'}</div>`;
  }
};
if (typeof module !== 'undefined') module.exports = { DLIST_ROUTES };
