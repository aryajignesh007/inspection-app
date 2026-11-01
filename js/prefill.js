'use strict';
/* Auto-fill for the inspection form.
   Sources (shown as small "auto" tags):  master = licensee record · previous = last inspection of this licensee
   officer = your profile · system = date/time/number/GPS · visit = planned visit · default = standard answer (change if needed). */
const PF_SRC = { master: 'licensee record', previous: 'last inspection', officer: 'officer profile', system: 'system', visit: 'planned visit', default: 'standard answer – check' };
const PF_ITEM = [[/^MA/, 'Methanol'], [/^RS/, 'Rectified Spirit'], [/^FL/, 'Foreign Liquor'], [/^AC/, 'Ammonium Chloride'], [/^(M\d|MF)/, 'Molasses']];
const PF_RULES = [[/^MA/, 'Gujarat Methyl Alcohol Rules, 1981'], [/^RS/, 'Bombay Rectified Spirit Rules, 1951'], [/^FL/, 'Bombay Foreign Liquor Rules, 1953'], [/^DS/, 'Bombay Denatured Spirit Rules, 1959'],
  [/^AC/, 'Gujarat Rotten Gur and Ammonium Chloride Rules'], [/^(M\d|MF)/, 'Bombay Molasses Rules']];
const pfFamily = c => normCode(c).replace(/\d+$/, '').replace(/^MA$/, 'MA');
const PF = {
  codeFrom(map, code) { const c = normCode(code); return (map.find(([re]) => re.test(c)) || [])[1] || ''; },
  prettyCode(code) { const c = normCode(code); if (c === 'MA12') return 'M.A.-1 & M.A.-2'; const m = c.match(/^([A-Z]+)(\d*)([A-Z]?)$/); if (!m) return c; return m[1].split('').join('.') + '.' + (m[2] ? '-' + m[2] + m[3] : ''); },
  licenceFor(lic, code) {
    const c = normCode(code), ls = lic?.licences || [];
    return ls.find(x => normCode(x.typeCode) === c) || (c === 'MA12' ? ls.find(x => /^MA/.test(x.typeCode)) : null) || ls.find(x => pfFamily(x.typeCode) === pfFamily(c)) || null;
  },
  async context({ lic, code, prof, date, time, visit, excludeId }) {
    const all = lic ? (await DB.all('inspections')).filter(i => i.licenseeId === lic.id && i.id !== excludeId && (!date || i.date <= date)).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))) : [];
    const c = normCode(code);
    const prev = all.find(i => c && normCode(i.typeCode) === c) || all.find(i => c && pfFamily(i.typeCode) === pfFamily(c)) || null;
    return { lic, code: c, prof, date, time, visit, prev, prevAny: all[0] || null, licence: this.licenceFor(lic, c), history: all };
  },
  /* value of a field in the previous inspection(s) – same licence type first, then any type */
  prevVal(ctx, re) {
    for (const i of [ctx.prev, ...ctx.history.filter(h => h !== ctx.prev)].filter(Boolean)) {
      const f = (i.fields || []).find(f => re.test((f.label || '').trim()) && String(f.value ?? '').trim() && !/^-+$|^_+$/.test(String(f.value).trim()));
      if (f) return { v: String(f.value).trim(), src: 'previous', note: 'from ' + dmy(i.date) };
    }
    return null;
  },
  val(v, src, note) { return v != null && String(v).trim() !== '' ? { v: String(v).trim(), src, note } : null; },
  /* one template field → {v, src, note} or null (= observation, left for you) */
  forField(f, ctx) {
    const lab = (f.label || '').trim().replace(/\s+/g, ' '), L1 = lab.toLowerCase(), l = ctx.lic || {}, lc = ctx.licence || {}, p = ctx.prof, V = this.val.bind(this), P = re => this.prevVal(ctx, re);
    const either = (v, re, src = 'master') => V(v, src) || P(re);
    const prevOr = (re, def) => P(re) || V(def, 'default');
    if (/^name of licensee/.test(L1)) return V(l.name, 'master');
    if (/^address/.test(L1)) return V([...new Set([l.address, l.area, l.city].filter(Boolean))].join(', '), 'master');
    if (/^(uln|unique licen[cs]e)|licen[cs]e (no|number)|^registration no/.test(L1)) return V(lc.uln || lc.licenceNo, 'master', 'ULN from licensee record');
    if (/^area|gidc area|^taluka/.test(L1)) return V(l.area, 'master');
    if (/^(mobile|phone|contact) ?(no|number)?/.test(L1)) return either(l.phone, /^(mobile|phone|contact)/i);
    if (/^e-?mail/.test(L1)) return V(l.email, 'master');
    if (/^district/.test(L1)) return V(l.district || 'Surat District', l.district ? 'master' : 'default');
    if (/^name of authori[sz]ed person/.test(L1)) return either(l.authorisedPerson || l.contactPerson, /^name of authori[sz]ed person/i);
    if (/whether nokarnama holder is present/.test(L1)) return prevOr(/whether nokarnama holder is present/i, 'Yes');
    if (/nokarnama approved/.test(L1)) return prevOr(/nokarnama approved/i, 'Yes');
    if (/^list of prohibited item|^prohibited item$/.test(L1)) return V(lc.prohibitedItems, 'master') || P(/^list of prohibited item/i) || V(this.codeFrom(PF_ITEM, ctx.code), 'master', 'from licence type');
    if (/^types? of licen[cs]e/.test(L1)) return V(this.optionFor(f, ctx.code) || this.prettyCode(ctx.code), 'master', 'licence type');
    if (/^last amendment/.test(L1)) return either(lc.lastAmendment, /^last amendment/i);
    if (/^purpose( of licen[cs]e)?$/.test(L1)) return either(lc.purpose, /^purpose( of licen[cs]e)?$/i);
    if (/^other purposes/.test(L1)) return either(lc.otherPurpose, /^other purposes/i);
    if (/^validity/.test(L1)) return either(lc.validity, /^validity/i);
    if (/^possession limit$/.test(L1)) return either(lc.possessionLimit, /^possession limit$/i);
    if (/^consumption limit$/.test(L1)) return either(lc.consumptionLimit, /^consumption limit$/i);
    if (/no\. ?of products approved as per gpcb|^total no\. of products/.test(L1)) return either(lc.productsGpcb, /no\. ?of products approved as per gpcb|^total no\. of products/i);
    if (/prohibited item stored in/.test(L1)) return either(lc.storedIn, /prohibited item stored in/i);
    let m;
    if ((m = L1.match(/^opening stock\s*(?:\((.+)\))?/))) {   // closing stock of the last visit becomes today's opening stock
      const grp = m[1] ? m[1].split(/[\/ ]/)[0] : '';
      const r = P(new RegExp('^stock (at time of inspection|at above time)' + (grp ? '.*' + grp : ''), 'i'));
      return r ? { ...r, note: 'closing stock of last visit (' + r.note.replace('from ', '') + ')' } : null;
    }
    if (/officer'?s? signature/.test(L1)) return V([p.officerNameGu, p.designationGu].filter(Boolean).join(', '), 'officer');
    if (/^date:?$/.test(L1)) return V(ctx.date ? dmy(ctx.date) : '', 'system');
    if (/name of relevant authorit/.test(L1)) return V(this.codeFrom(PF_RULES, ctx.code), 'default', 'rules for this licence type');
    if (/name of (other )?subordinates|subordinate officer/.test(L1)) return P(/name of (other )?subordinates|subordinate officer/i) || V(ctx.prev?.staff, 'previous');
    if (/^violations found or not|^is there any violations/.test(L1)) return V('No', 'default');
    if (/crossed in last 3 years|any other product produced|prima facie short levy|whether any lapse found|product unadded|public display of liquor|^whether used for any other purpose/.test(L1)) return prevOr(new RegExp('^' + lab.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'No');
    if (/storage area approved|cordoned|cautionary signs|calibration of storage|formulae and flow chart|issue slip|quota and limit.*adhered|register is maintained|weigh slip|cctv|footage|walled and locked|checking of storage area|sampling is done|stamped challan|charges paid in advance|difference paid|layout approved|undertaking taken/.test(L1)) return prevOr(new RegExp('^' + lab.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'Yes');
    if (/^(peso|poison|fire ?noc|gpcb|factory license|app|fdca approval|fssai|star category|premises related lease deed|shop and establishment)/.test(L1)) return prevOr(new RegExp('^' + lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), /star category/.test(L1) ? '' : 'Yes');
    if (/director.*list/.test(L1)) return prevOr(/director.*list/i, 'Updated');
    if (/stage wise|continuous production|^recovery done|challan required|supervision\/escort required|whether reported by the licensee/.test(L1)) return P(new RegExp('^' + lab.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    if (/^excess\/shortage|^any other dues/.test(L1)) return V('Nil', 'default');
    return null;   // stock figures, recovery details, remarks, action checkboxes … = your observation
  },
  optionFor(f, code) {
    const opts = Array.isArray(f.options) ? f.options : [];
    return opts.find(o => normCode(o) === normCode(code)) || '';
  },
  /* fields shown above the licence form: background of this visit */
  background(ctx) {
    const out = [], S = '(0) Background / પૂર્વભૂમિકા', pv = ctx.prevAny;
    const add = (label, r, type = 'text', options) => out.push({ section: S, label, type, options, pre: r });
    if (ctx.visit) add('Purpose of visit', this.val(ctx.visit.purpose, 'visit'));
    if (pv) {
      add('Last inspection date', this.val(dmy(pv.date) + (pv.typeCode ? ' (' + pv.typeCode + ')' : ''), 'previous'));
      add('Last report no.', this.val(pv.reportNo, 'previous'));
      const def = [/^y/i.test(pv.violations || '') ? 'Violation: ' + (pv.violationNotes || 'yes') : '', pv.remarks].filter(x => x && !/^(-|no other remarks)$/i.test(x)).join(' | ');
      add('Deficiencies pointed out last time', this.val(def || 'Nil', 'previous'), 'textarea');
      add('Previous deficiencies rectified?', def ? null : this.val('Not applicable', 'default'), 'dropdown', ['Yes', 'No', 'Partly', 'Not applicable']);
    }
    return out;
  }
};
