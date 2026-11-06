'use strict';
/* v1.8.0 કારણદર્શક નોટિસ (lapse show-cause notice) – DRAFT for the officer to review, sign and issue.
   Skeleton = the office's issued MA-2 show-cause notice (30/10/2026). Wording is in NT.TPL so it can be changed in one place.
   On the notice only the Act / Rules are cited (never a commentary book or website). Section suggestions were prepared
   internally from the office's commentary copy. Licensee name, address, type, ULN and validity are taken from the
   inspection report and cross-checked against this district's e-Prohibition licensee record; mismatches are flagged. */
const NT = {
  ACT: 'ગુજરાત નશાબંધી અધિનિયમ, ' + guNum(1949),
  MAR: 'ગુજરાત મિથાઈલ આલ્કોહોલ રૂલ્સ-' + guNum(1981),
  OFFICE: {
    surat: { addr: 'એ- સાતમો માળ, બહુમાળી મકાન, નાનપુરા, સુરત-' + guNum('395001'), contact: 'ફોન નં-' + guNum('0261-2462280') + ', ઈ-મેઈલ-sp-pne-sur@gujarat.gov.in', distGu: 'સુરત' },
    valsad: { addr: "ત્રીજો માળ, 'આશિષ' બિલ્ડીંગ, જૂની આરટીઓ ઓફિસ, મદનવાડ, વલસાડ-" + guNum('396001'), contact: 'ઈ-મેઈલ: sp-pne-val@gujarat.gov.in', distGu: 'વલસાડ' }
  },
  /* suggested citations (officer edits). t = linking phrase used in the ક્ષતિ sentence */
  CITES: [
    { k: 'r11_2', t: () => `${NT.MAR}ના નિયમ-${guNum('11(2)')} નો ભંગ કરીને` },
    { k: 'r12_4', t: () => `${NT.MAR}ના નિયમ-${guNum('2(bb)')} તથા નિયમ-${guNum('12(4)')} નો ભંગ કરીને`, hint: 'delivery-challan chain' },
    { k: 'r12_6', t: () => `${NT.MAR}ના નિયમ-${guNum('12(6)')} નો ભંગ કરીને` },
    { k: 'r12_7', t: () => `${NT.MAR}ના નિયમ-${guNum('12(7)')} નો ભંગ કરીને` },
    { k: 'r12_9', t: () => `${NT.MAR}ના નિયમ-${guNum('12(9)')} નો ભંગ કરીને` },
    { k: 'r14_1', t: () => `${NT.MAR}ના નિયમ-${guNum('14(1)')} નો ભંગ કરીને` },
    { k: 'r14_2', t: () => `${NT.MAR}ના નિયમ-${guNum('14(2)')} નો ભંગ કરીને` },
    { k: 's54', t: () => `${NT.ACT}ની કલમ-${guNum('54(1)') + '(સી)'} નું ઉલ્લંઘન કરીને`, def: true },
    { k: 's77b', t: () => `${NT.ACT}ની કલમ-${guNum('77')}(બી) હેઠળ "MISCONDUCT" કરેલ છે`, hint: 'optional – criminal, on conviction' }
  ],
  TPL: {
    draftMark: 'મુસદ્દો – અધિકારીશ્રીની ચકાસણી, સહી તથા સિક્કા બાદ જ બજાવવી',
    title: 'કારણદર્શક નોટિસ',
    subject: f => `વિષય- ${f.typeGu} પરવાના હેઠળ ક્ષતિ કરવા બાબત.`,
    open: f => `જય ભારતસહ ઉપર્યુક્ત વિષય અને સંદર્ભ પરત્વે જણાવવાનું કે, આપ આ ખાતાના ${f.typeGu} પરવાના નં-${f.uln} તા.${f.validGu} સુધીની મુદત માટેનો ધરાવો છો. અધિક્ષકશ્રી, નશાબંધી અને આબકારી, ${f.distGu}નાઓએ તા.${f.inspGu}ના રોજ કરેલ તપાસણી દરમ્યાન ધ્યાને આવેલ આપના દ્વારા કરાયેલ ક્ષતિઓ નીચે મુજબ છે:`,
    lapse: (l, i) => `ક્ષતિ-${guNum(i + 1)}: ${l.text.replace(/[.।]?\s*$/, '.')}${l.cites.length ? ' આમ, આપે ' + l.cites.join(', ') + (/છે$/.test(l.cites[l.cites.length - 1]) ? '.' : ' ક્ષતિ કરેલ છે.') : ''}`,
    reply: f => `આથી, ${NT.ACT}ની કલમ-${guNum(54)} હેઠળ આપનો પરવાનો રદ/મોકૂફ કરતા પહેલાં આપને આ નોટિસ મળ્યેથી દિન-${guNum(f.days)}${f.holidays ? ' (રજાના દિવસો સહિત)' : ''}માં આપનો લેખિત ખુલાસો આ કચેરીને રજૂ કરવા જણાવવામાં આવે છે. નિયત સમયમર્યાદામાં ખુલાસો રજૂ નહીં થાય તો આપને આ બાબતે કંઈ કહેવાનું નથી તેમ માની નિયમાનુસાર કાર્યવાહી કરવામાં આવશે.`,
    nosale: f => `વધુમાં, તપાસણી દરમ્યાન વધુ ઉલ્લંઘન અટકાવવા વેચાણ/વપરાશ બંધ કરાવેલ હોઈ, તા.${f.stopGu}થી આપના દ્વારા કાયદાના પાલન અંગેની પુરતી વ્યવસ્થા (COMPLETE COMPLIANCE) કરવામાં ન આવે ત્યાં સુધી કોઈ પણ પ્રકારનું વેચાણ કરવું નહીં.`,
    sign: f => [`(${f.signName})`, f.signDesig, 'નશાબંધી અને આબકારી', f.distGu],
    copyHead: 'નકલ રવાના કાર્યવાહી સારૂ'
  },
  fv(i, re) { const x = (i?.fields || []).find(f => re.test(f.label || '')); return x ? (Array.isArray(x.value) ? x.value.join(', ') : String(x.value ?? '')).trim() : ''; },
  validEnd: s => String(s || '').split(/\s+to\s+/i).pop().trim(),
  ulnKey: s => String(s || '').toUpperCase().replace(/\s+/g, ''),
  dmyGu: s => { if (!s) return '—'; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return guNum(m ? `${m[3]}/${m[2]}/${m[1]}` : s); },
  async fields(insId) {
    const i = await DB.get('inspections', insId), lic = i?.licenseeId ? await DB.get('licensees', i.licenseeId) : null, p = await L.profile();
    const ulnIR = NT.fv(i, /unique\s*licen[cs]e\s*number|^ULN/i), nameIR = NT.fv(i, /name of (the )?licensee/i);
    const lc = (lic?.licences || []).find(x => NT.ulnKey(x.uln || x.licenceNo) === NT.ulnKey(ulnIR)) || (lic?.licences || []).find(x => normCode(x.typeCode) === normCode(i?.typeCode)) || {};
    const lapsesTxt = [NT.fv(i, /lapses,? if any/i), i?.violationNotes, i?.rules].filter(Boolean).join('\n');
    const stopped = /^y/i.test(NT.fv(i, /stopped to prevent further violation/i));
    const saved = (await DB.getSetting('notice.' + insId, null)) || {}, yr = todayStr().slice(0, 4);
    const f = Object.assign({ insId, name: (nameIR || lic?.name || '').toUpperCase(), address: ([lic?.address, lic?.area].filter(Boolean).join(', ')).toUpperCase(),
      typeCode: lc.typeCode || i?.typeCode || '', uln: ulnIR || lc.uln || lc.licenceNo || '', validTo: NT.validEnd(lc.validity), inspDate: i?.date || '', reportNo: i?.reportNo || '',
      lapses: lapsesTxt.split(/\n+/).map(t => t.trim()).filter(Boolean).map(text => ({ text, keys: ['s54'] })), stopped, nosale: stopped, stopDate: i?.date ? ymd(new Date(parseYmd(i.date).getTime() + 864e5)) : '',
      outNo: '', fileNo: `ક્રમાંક-મથલ/૭-૨/${guNum(yr)}/`, noticeDate: todayStr(), days: 7, holidays: false,
      signName: p.signShortGu || p.officerNameGu || '', signDesig: 'અધિક્ષક', copies: ['સબ ઈન્સ્પેક્ટરશ્રી, નશાબંધી અને આબકારી (સંબંધિત બીટ)'] }, saved);
    f._lic = lic; f._ulnIR = ulnIR; f._ins = i; return f;
  },
  /** cross-check against this district's e-Prohibition licensee record */
  verify(f) {
    const out = [], lic = f._lic, u = NT.ulnKey(f.uln), pre = TJ.PREFIX[DIST.key];
    if (!u) out.push('ULN is blank.');
    else {
      const m = u.match(/^([A-Z]{3})\/([A-Z0-9]+)\/(\d{6})\/(\d{5})$/);
      if (!m) out.push(`ULN "${f.uln}" is not in the portal format XXX/TYPE/MMYYYY/NNNNN.`);
      else { if (m[1] !== pre) out.push(`ULN ${f.uln} is not a ${DIST.info.en} (${pre}/…) licence.`); if (normCode(m[2]) !== normCode(f.typeCode)) out.push(`Licence type ${f.typeCode} does not match the ULN (${m[2]}).`); }
      const portal = (lic?.licences || []).find(x => NT.ulnKey(x.uln || x.licenceNo) === u);
      if (!lic) out.push('Inspection is not linked to a licensee record.');
      else if (!portal) out.push(`ULN ${f.uln} is not in ${DIST.info.en} e-Prohibition record of this licensee (portal ULNs: ${(lic.licences || []).map(x => x.uln || x.licenceNo).filter(Boolean).join(', ') || 'none'}).`);
      else { if (!/e-Prohibition/i.test(portal.source || lic.importedFrom || '')) out.push('This licence was not pulled from e-Prohibition – check it on the portal.');
        if (portal.validity && f.validTo && NT.validEnd(portal.validity) !== f.validTo) out.push(`Validity ${f.validTo} differs from portal ${NT.validEnd(portal.validity)}.`);
        if ((portal.status || 'active') !== 'active') out.push('Portal shows this licence as inactive.'); }
      if (f._ulnIR && NT.ulnKey(f._ulnIR) !== u) out.push(`ULN on the notice (${f.uln}) differs from the inspection report (${f._ulnIR}).`);
    }
    if (lic && f.name && IM.nameKey(f.name) !== IM.nameKey(lic.name) && !(lic.aka || []).some(a => IM.nameKey(a) === IM.nameKey(f.name))) out.push(`Name "${f.name}" differs from e-Prohibition "${lic.name}".`);
    if (lic && !TJ.licenseeBelongs(lic)) out.push(`This licensee looks like ${DISTRICTS[TJ.otherKey()].en} district data.`);
    if (!f.validTo) out.push('Validity (તા. … સુધી) is blank.');
    else { const v = String(f.validTo).match(/^(\d{2})\/(\d{2})\/(\d{4})$/), iso = v ? `${v[3]}-${v[2]}-${v[1]}` : String(f.validTo).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && f.inspDate && iso < f.inspDate) out.push(`Validity ${f.validTo} is before the inspection date – check the renewed validity on e-Prohibition.`); }
    if (!f.outNo) out.push('Outward number (જાવક નં.) is blank – fill from the register.');
    return out;
  },
  build(f) {
    const C = {}; NT.CITES.forEach(c => C[c.k] = c.t());
    const lapses = f.lapses.map(l => ({ text: l.text, cites: (l.keys || []).filter(k => C[k]).sort((a, b) => NT.CITES.findIndex(c => c.k === a) - NT.CITES.findIndex(c => c.k === b)).map(k => C[k]) }));
    return { ...f, typeGu: f.typeCode, distGu: NT.OFFICE[DIST.key].distGu, validGu: NT.dmyGu(f.validTo), inspGu: NT.dmyGu(f.inspDate), stopGu: NT.dmyGu(f.stopDate), lapsesB: lapses };
  },
  logos: async () => ({ l: await DB.getSetting('notice.logoL', ''), r: await DB.getSetting('notice.logoR', '') }),
  pageHtml(f, lg) {
    const g = NT.build(f), T = NT.TPL, O = NT.OFFICE[DIST.key], img = (s, alt) => s ? `<img src="${s}" style="height:80px">` : `<div style="width:80px;height:80px;border:1px dashed #999;font-size:9px;display:flex;align-items:center;justify-content:center;text-align:center">${alt}</div>`;
    return `<div class="pg gu" style="font-size:14px;line-height:1.65;color:#000">
      <div style="text-align:center;font-size:10px">${esc(T.draftMark)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between">${img(lg.l, 'emblem')}<div style="text-align:center"><div style="font-size:19px;font-weight:700">નશાબંધી અને આબકારી અધિક્ષકની કચેરી</div><div>${esc(O.addr)}</div><div>${esc(O.contact)}</div></div>${img(lg.r, 'સત્યમેવ જયતે')}</div><hr style="border:0;border-top:2px solid #000">
      <div>આર.પી.એ.ડી.</div><div style="display:flex;justify-content:space-between"><span>${esc(g.fileNo)}${esc(guNum(g.outNo))}</span><span>તા.${esc(NT.dmyGu(g.noticeDate))}</span></div><br>
      <div>પ્રતિ,<br>${esc(g.name)}<br>${esc(g.address)}</div><br>
      <div style="text-align:center"><b><u>${esc(T.title)}</u></b></div>
      <div style="margin-left:10%">${esc(T.subject(g))}</div><div>મહાશય,</div>
      <p style="text-indent:40px">${esc(T.open(g))}</p>
      ${g.lapsesB.map((l, i) => `<p style="text-indent:40px">${esc(T.lapse(l, i))}</p>`).join('')}
      <p style="text-indent:40px">${esc(T.reply(g))}</p>${g.nosale ? `<p style="text-indent:40px">${esc(T.nosale(g))}</p>` : ''}
      <div style="margin-left:60%;text-align:center;margin-top:30px">${T.sign(g).map(esc).join('<br>')}</div>
      <div style="margin-top:14px"><u>${esc(T.copyHead)}</u><br>${g.copies.filter(Boolean).map((c, i) => `${guNum(i + 1)}. ${esc(c)}`).join('<br>')}</div></div>`;
  },
  async docx(f) {
    const D = await X.docxLib(), F = 'Shruti', { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType } = D, g = NT.build(f), T = NT.TPL, O = NT.OFFICE[DIST.key], lg = await NT.logos();
    const R = (t, o = {}) => new TextRun({ text: String(t ?? ''), font: F, size: o.size || 24, bold: o.b, underline: o.u ? {} : undefined });
    const P = (t, o = {}) => new Paragraph({ alignment: o.al || AlignmentType.JUSTIFIED, spacing: { after: o.after ?? 100 }, indent: o.first ? { firstLine: 600 } : o.ind ? { left: o.ind } : undefined, children: Array.isArray(t) ? t : [R(t, o)], ...(o.tabs ? { tabStops: [{ type: TabStopType.RIGHT, position: 9600 }] } : {}) });
    const nb = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } };
    const logo = s => { if (!s) return new Paragraph({ children: [R('', {})] }); const b = Uint8Array.from(atob(s.split(',')[1]), c => c.charCodeAt(0)); return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: b, transformation: { width: 70, height: 70 } })] }); };
    const head = new Table({ width: { size: 9800, type: WidthType.DXA }, columnWidths: [1500, 6800, 1500], borders: { ...nb, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [
      new TableCell({ borders: nb, children: [logo(lg.l)] }),
      new TableCell({ borders: nb, children: [P('નશાબંધી અને આબકારી અધિક્ષકની કચેરી', { al: AlignmentType.CENTER, b: true, size: 30, after: 0 }), P(O.addr, { al: AlignmentType.CENTER, size: 22, after: 0 }), P(O.contact, { al: AlignmentType.CENTER, size: 22, after: 0 })] }),
      new TableCell({ borders: nb, children: [logo(lg.r)] })] })] });
    const ch = [P(T.draftMark, { al: AlignmentType.CENTER, size: 16 }), head, new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' } }, children: [] }),
      P('આર.પી.એ.ડી.', { after: 0 }), P([R(g.fileNo + guNum(g.outNo)), R('\tતા.' + NT.dmyGu(g.noticeDate))], { tabs: true, al: AlignmentType.LEFT }),
      P('પ્રતિ,', { after: 0, al: AlignmentType.LEFT }), P(g.name, { after: 0, al: AlignmentType.LEFT }), P(g.address, { al: AlignmentType.LEFT }),
      P([R(T.title, { b: true, u: true, size: 26 })], { al: AlignmentType.CENTER }), P(T.subject(g), { ind: 1000 }), P('મહાશય,', { al: AlignmentType.LEFT }),
      P(T.open(g), { first: true }), ...g.lapsesB.map((l, i) => P(T.lapse(l, i), { first: true })), P(T.reply(g), { first: true }), ...(g.nosale ? [P(T.nosale(g), { first: true })] : []), P(''),
      ...T.sign(g).map(t => P(t, { al: AlignmentType.CENTER, ind: 5600, after: 0 })), P(''),
      P([R(T.copyHead, { u: true })], { al: AlignmentType.LEFT, after: 0 }), ...g.copies.filter(Boolean).map((c, i) => P(guNum(i + 1) + '. ' + c, { al: AlignmentType.LEFT, after: 0 }))];
    return Packer.toBlob(new Document({ creator: 'Inspection App', title: T.title, styles: { default: { document: { run: { font: F } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 700, bottom: 700, left: 1000, right: 1000 } } }, children: ch }] }));
  },
  async route(insId) {
    const f = await NT.fields(insId);
    setTop('Notice', 'કારણદર્શક નોટિસ', true);
    const C = NT.CITES, cbx = (li, l) => C.map(c => `<label class="te-chk" style="font-size:12px"><input type="checkbox" data-c="${li}:${c.k}" ${(l.keys || []).includes(c.k) ? 'checked' : ''}> ${esc(c.t())}${c.hint ? ` <small class="muted">(${esc(c.hint)})</small>` : ''}</label>`).join('');
    const draw = () => {
      const warn = NT.verify(f);
      view().innerHTML = `<div class="card ${warn.length ? 'warnbox' : 'okbox'}"><b>e-Prohibition cross-check (${esc(DIST.info.en)})</b><br>${warn.length ? warn.map(w => '⚠️ ' + esc(w)).join('<br>') : '✓ ULN, name, type and validity match this district\'s e-Prohibition record.'}</div>
      <div class="card gu"><h3>કારણદર્શક નોટિસ <small>${esc(DIST.info.en)} · draft</small></h3><div class="muted">Draft only – check, sign and stamp before issue. ULN, name and type come from the inspection report – do not retype the ULN.</div>
      ${[['name', 'પરવાનેદાર (caps)'], ['address', 'સરનામું'], ['typeCode', 'પરવાનાનો પ્રકાર'], ['uln', 'ULN'], ['validTo', 'મુદત તા. (સુધી)'], ['fileNo', 'ફાઈલ ક્રમાંક'], ['outNo', 'જાવક નં. (register)'], ['signName', 'સહી કરનાર (ટૂંકું નામ)'], ['signDesig', 'હોદ્દો (અધિક્ષક / ઇ/ચા. અધિક્ષક)']].map(([k, l]) => `<label>${l}</label><input data-f="${k}" value="${esc(f[k])}" ${k === 'uln' ? 'style="font-family:monospace"' : ''}>`).join('')}
      <label>તપાસણી તા.</label><input type="date" data-f="inspDate" value="${esc(f.inspDate)}"><label>નોટિસ તા.</label><input type="date" data-f="noticeDate" value="${esc(f.noticeDate)}">
      <label>ખુલાસા માટે દિવસ</label><input data-f="days" inputmode="numeric" value="${esc(f.days)}"><label class="te-chk"><input type="checkbox" id="hol" ${f.holidays ? 'checked' : ''}> mention holidays (રજાના દિવસો સહિત)</label>
      <label class="te-chk"><input type="checkbox" id="ns" ${f.nosale ? 'checked' : ''} ${f.stopped ? '' : 'disabled'}> Interim no-sale direction ${f.stopped ? '' : '<small class="muted">(only when the report says sale/use was stopped)</small>'}</label><label>વેચાણ બંધ તા. થી</label><input type="date" data-f="stopDate" value="${esc(f.stopDate)}">
      <h4>ક્ષતિઓ</h4>${f.lapses.map((l, i) => `<div class="card" style="margin:6px 0"><label>ક્ષતિ-${guNum(i + 1)}</label><textarea data-l="${i}" rows="3">${esc(l.text)}</textarea>${cbx(i, l)}<button class="btn sec sm" data-rm="${i}">Remove</button></div>`).join('')}
      <button class="btn sec" id="addL">＋ Add ક્ષતિ</button>
      <label>નકલ રવાના (one per line)</label><textarea id="cp" rows="3">${esc(f.copies.join('\n'))}</textarea>
      <h4>Office emblems (optional images)</h4><div class="btns"><button class="btn sec sm" id="lgL">Left emblem</button><button class="btn sec sm" id="lgR">Right (સત્યમેવ જયતે)</button></div>
      <div class="btns" style="margin-top:10px"><button class="btn sec" id="ntSave">Save</button><button class="btn sec" id="ntPrev">Preview</button><button class="btn" id="ntW">Word</button><button class="btn" id="ntP">PDF</button><button class="btn sec" id="ntPr">Print</button></div></div><div id="ntView"></div>`;
      const read = () => { $$('[data-f]').forEach(i => f[i.dataset.f] = i.value); f.days = Number(f.days) || 7; f.holidays = $('#hol').checked; f.nosale = $('#ns').checked && f.stopped;
        f.lapses = $$('[data-l]').map(t => ({ text: t.value.trim(), keys: $$(`[data-c^="${t.dataset.l}:"]:checked`).map(c => c.dataset.c.split(':')[1]) })).filter(l => l.text); f.copies = $('#cp').value.split('\n').map(x => x.trim()).filter(Boolean); };
      const save = async () => { read(); const { _lic, _ins, _ulnIR, ...keep } = f; await DB.setSetting('notice.' + insId, keep); };
      const gate = async () => { await save(); const w = NT.verify(f); return !w.length || confirm('e-Prohibition cross-check found:\n\n• ' + w.join('\n• ') + '\n\nExport the draft anyway?'); };
      const nm = () => 'Notice-' + (f.reportNo || insId).replace(/[\/\\\s]+/g, '_');
      $('#addL').onclick = async () => { await save(); f.lapses.push({ text: '…', keys: ['s54'] }); draw(); };
      $$('[data-rm]').forEach(b => b.onclick = async () => { await save(); f.lapses.splice(+b.dataset.rm, 1); draw(); });
      for (const [id, k] of [['#lgL', 'notice.logoL'], ['#lgR', 'notice.logoR']]) $(id).onclick = async () => { const fl = await pickFile('image/*'); if (!fl) return; await DB.setSetting(k, await readFile(fl, 'dataurl')); toast('Saved'); };
      $('#ntSave').onclick = async () => { await save(); toast('Saved'); draw(); };
      $('#ntPrev').onclick = async () => { await save(); $('#ntView').innerHTML = `<div class="card" style="overflow:auto">${NT.pageHtml(f, await NT.logos())}</div>`; };
      $('#ntW').onclick = e => busy(e.target, async () => { if (await gate()) saveFile(await NT.docx(f), nm() + '.docx'); });
      $('#ntP').onclick = e => busy(e.target, async () => { if (await gate()) saveFile(await X.pagesToPdf([NT.pageHtml(f, await NT.logos())]), nm() + '.pdf'); });
      $('#ntPr').onclick = async () => { if (await gate()) X.printPages([NT.pageHtml(f, await NT.logos())]); };
    };
    draw();
  }
};
if (typeof module !== 'undefined') module.exports = { NT };
