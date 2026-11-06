'use strict';
/* Business logic: day log defaults, inspections, monthly diary maths, due list. */
const L = {
  async profile() { const saved = await DB.getSetting('profile', {}), dd = (typeof DISTRICT_PROFILE !== 'undefined' && DISTRICT_PROFILE[DIST.key]) || {};
    const p = Object.assign({}, DEFAULT_PROFILE, dd, saved);
    // v1.8.0: a Surat profile restored/imported into Valsad (or vice versa) printed the wrong district in the diary/taarij
    for (const [k, other] of Object.entries(DISTRICT_PROFILE || {})) if (k !== DIST.key) for (const f of ['placeGu', 'fromCode']) if (saved[f] && saved[f] === other[f] && dd[f]) p[f] = dd[f]; Object.defineProperty(p, '_hol', { value: await HOL.map(), enumerable: false, writable: true }); return p; },
  async saveProfile(p) { const c = { ...p }; delete c._hol; await DB.setSetting('profile', c); },
  /* Government holiday on this date (built-in GAD list / imported list), plus optional holidays you marked as taken */
  holidayOf(dateStr, prof) {
    const h = prof._hol?.[dateStr]; if (!h) return null;
    if (h.public) return { ...h.public, kind: 'public' };
    if ((h.optional || []).length && (prof.optionalTaken || []).includes(dateStr)) return { gu: h.optional.map(o => o.gu).join(' / '), en: h.optional.map(o => o.en).join(' / '), kind: 'optional' };
    if (h.sunday && parseYmd(dateStr).getDay() === 0) return { ...h.sunday, kind: 'sunday' };
    return null;
  },
  async abstractCfg() { return Object.assign({ totals: {}, std: {}, extraCodes: {}, baseline: null }, await DB.getSetting('abstract', {})); },
  async saveAbstractCfg(c) { await DB.setSetting('abstract', c); },
  async abstractRows() {
    const c = await this.abstractCfg();
    const rows = ABSTRACT_ROWS.map(r => ({ ...r, std: c.std[r.key] ?? r.std, codes: [...r.codes, ...(c.extraCodes[r.key] || [])].map(normCode) }));
    // v1.8.0: totals counted live from THIS district's e-Prohibition licensees (typed totals only when manualTotals is on)
    const lists = await TJ.lists(rows);
    rows.forEach(r => { r.liveTotal = lists[r.key].length; r.total = c.manualTotals ? Number(c.totals[r.key] ?? 0) : r.liveTotal; });
    Object.defineProperty(rows, 'lists', { value: lists, enumerable: false });
    return rows;
  },
  isAutoHoliday(dateStr, prof) {
    const d = parseYmd(dateStr), wd = d.getDay();
    if (wd === 0) return true;
    if (wd === 6 && (prof.holidaySat || []).includes(Math.ceil(d.getDate() / 7))) return true;
    if ((prof.publicHolidays || []).some(h => h.date === dateStr)) return true;
    const g = this.holidayOf(dateStr, prof); return !!g && prof.useGovtHolidays !== false;
  },
  defaultDay(dateStr, prof) {
    const ph = (prof.publicHolidays || []).find(h => h.date === dateStr);
    if (this.isAutoHoliday(dateStr, prof)) {
      const g = prof.useGovtHolidays !== false ? this.holidayOf(dateStr, prof) : null;
      const work = ph && ph.workText ? ph.workText : g ? ((g.kind === 'optional' ? 'મરજીયાત રજા' : 'જાહેર રજા') + (prof.holidayNameInDiary !== false ? ` - ${g.gu}` : '')) : 'જાહેર રજા';
      return { date: dateStr, kind: 'holiday', from: '-', to: '-', vehicle: '', work, holidayName: g ? g.gu : (ph ? ph.workText : ''), auto: true };
    }
    return { date: dateStr, kind: 'office', from: '-', to: '-', vehicle: '', work: 'કચેરી ખાતે કામગીરી ', auto: true };
  },
  async monthDays(ym, prof) {
    prof ||= await this.profile();
    const [y, m] = ym.split('-').map(Number), n = daysInMonth(y, m), saved = {};
    (await DB.all('days')).forEach(d => { if (d.date.startsWith(ym)) saved[d.date] = d; });
    const out = [];
    for (let i = 1; i <= n; i++) { const ds = `${ym}-${pad(i)}`; out.push(saved[ds] || this.defaultDay(ds, prof)); }
    return out;
  },
  async rangeDays(from, to, prof) {
    prof ||= await this.profile();
    const all = {}; (await DB.all('days')).forEach(d => all[d.date] = d);
    const out = []; for (let d = parseYmd(from); ymd(d) <= to; d.setDate(d.getDate() + 1)) { const s = ymd(d); out.push(all[s] || this.defaultDay(s, prof)); }
    return out;
  },
  /* what a complete licensee record needs for the inspection forms */
  missingDetails(l) {
    if (!l) return [];
    const m = [];
    if (!l.address || l.address.trim() === (l.area || '').trim()) m.push('full address');
    if (!l.district) m.push('district');
    if (!(l.authorisedPerson || l.contactPerson)) m.push('authorised person');
    if (!l.phone) m.push('phone');
    if (!(l.licences || []).length) m.push('licence');
    for (const x of l.licences || []) {
      const c = x.typeCode || '?', need = [];
      if (!x.licenceNo) need.push('no.'); if (!x.validity) need.push('validity');
      if (/^(MA|RS|DS|AC|SA|SP)/.test(c)) { if (!x.possessionLimit) need.push('possession limit'); if (!x.consumptionLimit) need.push('consumption limit'); if (!x.purpose) need.push('purpose'); }
      if (need.length) m.push(c + ' ' + need.join('/'));
    }
    return m;
  },
  async licenseeMap() { const m = {}; (await DB.all('licensees')).forEach(l => m[l.id] = l); return m; },
  async inspectionsIn(from, to) { return (await DB.all('inspections')).filter(i => i.date >= from && i.date <= to && !i.excluded).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); },
  async nextReportNo(ins, lic) {
    const y = ins.date.slice(0, 4), mon = EN_MON3[Number(ins.date.slice(5, 7)) - 1];
    const short = (lic?.name || 'NA').replace(/[^A-Za-z0-9]/g, '').slice(0, 14) || 'NA';
    const n = (await DB.all('inspections')).filter(i => (i.date || '').startsWith(y)).length + 1;
    return `IR/SPE/${y}/${short}/${mon}/${ins.typeCode || 'NA'}/${n}`;
  },
  /** Save an inspection and make sure that day's diary row shows the visit. */
  async saveInspection(ins) {
    const prof = await this.profile();
    ins.id ||= uid(); ins.updatedAt = new Date().toISOString();
    await DB.put('inspections', ins);
    if (ins.date && !ins.excluded) {
      const cur = await DB.get('days', ins.date);
      if (!cur || cur.auto || cur.kind === 'office') {
        const lic = ins.licenseeId ? await DB.get('licensees', ins.licenseeId) : null;
        const place = ins.to || lic?.area || lic?.address || '';
        await DB.put('days', { date: ins.date, kind: 'tour', from: prof.fromCode || (DIST.key === 'valsad' ? 'VLS' : 'SRT'), to: (cur && !cur.auto && cur.to && cur.to !== '-') ? cur.to : place, vehicle: ins.vehicleCode || prof.vehicleCode || 'G', work: 'કચેરી+ તપાસણી', km: ins.distanceKm || '', fromInspection: true });
      }
    }
    return ins;
  },
  distanceFor(lic, prof) {
    if (!lic) return '';
    if (lic.distanceKm) return lic.distanceKm;
    if (lic.lat && lic.lng && prof.officeLat) return Math.round(haversineKm({ lat: prof.officeLat, lng: prof.officeLng }, lic) * (prof.roadFactor || 1.3));
    const a = (prof.areaKm || {})[(lic.area || '').trim()]; return a || '';
  },
  rowsForCode(code, rows) { const c = normCode(code); return rows.filter(r => r.codes.includes(c)); },
  /** Everything needed to print the monthly diary (auto values; user overrides are applied on top). */
  async computeMonth(ym) {
    const prof = await this.profile(), cfg = await this.abstractCfg(), rows = await this.abstractRows();
    const days = await this.monthDays(ym, prof);
    const [y, m] = ym.split('-').map(Number);
    const lmap = await this.licenseeMap(), mineOnly = list => list.filter(i => !i.licenseeId || !lmap[i.licenseeId] || TJ.licenseeBelongs(lmap[i.licenseeId]));   // v1.8.0: never count the other district's licensees
    const ins = mineOnly(await this.inspectionsIn(`${ym}-01`, `${ym}-${pad(daysInMonth(y, m))}`));
    const keyOf = i => i.licenseeId || i.reportNo || i.id;
    const monthSets = {}, unmapped = new Set();
    for (const i of ins) { const rs = this.rowsForCode(i.typeCode, rows); if (!rs.length) unmapped.add(i.typeCode || '(blank)'); rs.forEach(r => (monthSets[r.key] ||= new Set()).add(keyOf(i))); }
    // progressive: from FY start (or carry-forward baseline) up to this month.
    // Valsad additional charge began 30 Sept 2026 — do not count earlier officers' checks.
    const fy = fyStartYm(ym); let base = {}, fromDate = `${fy}-01`;
    const charge = (DISTRICT_PROFILE[DIST.key] || {}).chargeFrom;
    if (charge && charge >= fromDate && charge.slice(0, 7) <= ym) fromDate = charge;
    const b = cfg.baseline;
    if (b && b.month && fyStartYm(b.month) === fy && b.month <= ym && (!charge || (b.month + '-31') >= charge)) {
      base = b.values || {}; fromDate = addMonths(b.month, 1) + '-01';
      if (charge && charge > fromDate) fromDate = charge;
    }
    const progIns = fromDate.slice(0, 7) <= ym ? mineOnly(await this.inspectionsIn(fromDate, `${ym}-31`)) : [];
    const progSets = {};
    for (const i of progIns) this.rowsForCode(i.typeCode, rows).forEach(r => (progSets[r.key] ||= new Set()).add(keyOf(i)));
    const abstract = rows.map(r => {
      const inspected = monthSets[r.key]?.size || 0;
      const progressive = Number(base[r.key] ?? base[r.label] ?? 0) + (progSets[r.key]?.size || 0);
      return { ...r, inspected, progressive, remaining: Math.max(0, r.total - progressive) };
    });
    const holidays = days.filter(d => d.kind === 'holiday').length, leave = days.filter(d => d.kind === 'leave').length;
    const licSet = new Set(ins.map(keyOf));
    const summary = {
      working: days.length - holidays - leave, travel: days.filter(d => d.kind === 'tour').length,
      inspected: abstract.reduce((s, r) => s + r.inspected, 0) || licSet.size,
      defects: new Set(ins.filter(i => /^y/i.test(i.violations || '')).map(keyOf)).size, subOffices: '-', publicity: '-'
    };
    const km = days.reduce((s, d) => s + (Number(d.km) || 0), 0);
    return { ym, prof, days, ins, abstract, summary, unmapped: [...unmapped], km, lists: rows.lists, district: DIST.key };
  },
  /** Merge saved overrides (from the preview screen) into the computed month. */
  async monthForExport(ym) {
    const c = await this.computeMonth(ym), o = (await DB.get('diaries', ym)) || {}; c.manual = !!(await this.abstractCfg()).manualTotals;
    const summary = { ...c.summary, ...(o.summary || {}) };
    const abstract = c.abstract.map(r => { const ov = { ...((o.abstract || {})[r.key] || {}) }; if (!c.manual) delete ov.total; const x = { ...r, ...ov }; x.remaining = ov.remaining ?? Math.max(0, Number(x.total) - Number(x.progressive)); return x; });
    const year = Number(ym.slice(0, 4)) + (ym.endsWith('-12') ? 1 : 0);
    return { ...c, summary, abstract, refNo: o.refNo ?? (c.prof.refPrefix || '').replace('{YEAR}', guNum(year)), letterDate: o.letterDate ?? `તારીખ:    /     /${guNum(year)}`,
      showRoute: o.showRoute ?? c.prof.showRouteCols, showExtra: o.showExtra ?? c.prof.showExtraSummary };
  },
  /** Licences due / overdue for inspection according to the standard (ધોરણ) of their abstract row. */
  async dueList() {
    const rows = await this.abstractRows(), lics = await DB.all('licensees'), ins = await DB.all('inspections');
    const last = {};
    ins.filter(i => !i.excluded).forEach(i => this.rowsForCode(i.typeCode, rows).forEach(r => { const k = i.licenseeId + '|' + r.key; if (!last[k] || last[k] < i.date) last[k] = i.date; }));
    const today = todayStr(), out = [];
    for (const l of lics) for (const lc of (l.licences || [])) {
      if ((lc.status || 'active') !== 'active') continue;
      const r = this.rowsForCode(lc.typeCode, rows)[0]; if (!r) continue;
      const months = STD_MONTHS[(r.std || '').trim()]; if (!months) continue;
      const lastDate = last[l.id + '|' + r.key];
      let due = lastDate ? ymd(new Date(parseYmd(lastDate).setMonth(parseYmd(lastDate).getMonth() + months))) : null;
      out.push({ lic: l, code: lc.typeCode, row: r, lastDate, due, overdue: !due || due <= today, months });
    }
    return out.sort((a, b) => (a.due || '0').localeCompare(b.due || '0'));
  }
};
