'use strict';
/* File outputs: monthly diary (.xlsx from the office template, .docx, PDF/print), weekly diary, inspection reports. */
const X = {};
const LH_W = 1031, LH_H = 231;
/* Letterhead as JPEG bytes: the user's uploaded image, or a text letterhead drawn from the profile. */
X.letterheadJpeg = async function (prof) {
  const c = document.createElement('canvas'); c.width = LH_W; c.height = LH_H; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, LH_W, LH_H);
  if (prof.letterhead) {
    const img = new Image(); img.src = prof.letterhead; await img.decode();
    g.drawImage(img, 0, 0, LH_W, LH_H);
  } else {
    g.fillStyle = '#000'; g.textAlign = 'center';
    g.font = 'bold 54px "Noto Sans Gujarati","Shruti",sans-serif'; g.fillText(prof.officeTitleGu || '', LH_W / 2, 110);
    g.font = '24px "Noto Sans Gujarati","Shruti",sans-serif'; g.fillText(prof.officeAddressGu || '', LH_W / 2, 160);
    g.fillRect(40, 200, LH_W - 80, 3);
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  return { blob, dataUrl: c.toDataURL('image/jpeg', 0.92), bytes: new Uint8Array(await blob.arrayBuffer()) };
};
const sigLines = p => [`   ${p.officerNameGu}`, `    ${p.designationGu}`, `       ${p.deptGu} `, `    ${p.placeGu}`];
const kindXlStyle = { office: 62, tour: 68, holiday: 72, leave: 75 };

/* ---------- Monthly diary → Excel, filled into the office's own workbook layout ---------- */
X.diaryXlsx = async function (m) {
  const zip = await JSZip.loadAsync(await (await fetch('assets/diary-template.xlsx')).arrayBuffer());
  const doc = new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'), 'application/xml');
  const NS = doc.documentElement.namespaceURI, sd = doc.getElementsByTagNameNS(NS, 'sheetData')[0];
  const colNum = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const rowEl = r => {
    for (const el of sd.children) { const n = +el.getAttribute('r'); if (n === r) return el; if (n > r) { const x = doc.createElementNS(NS, 'row'); x.setAttribute('r', r); sd.insertBefore(x, el); return x; } }
    const x = doc.createElementNS(NS, 'row'); x.setAttribute('r', r); sd.appendChild(x); return x;
  };
  const cell = ref => {
    const [, col, r] = ref.match(/([A-Z]+)(\d+)/); const row = rowEl(+r);
    for (const c of row.children) { const cc = c.getAttribute('r').match(/[A-Z]+/)[0]; if (cc === col) return c; if (colNum(cc) > colNum(col)) { const x = doc.createElementNS(NS, 'c'); x.setAttribute('r', ref); row.insertBefore(x, c); return x; } }
    const x = doc.createElementNS(NS, 'c'); x.setAttribute('r', ref); row.appendChild(x); return x;
  };
  const reset = (c, s) => { while (c.firstChild) c.removeChild(c.firstChild); c.removeAttribute('t'); if (s != null) c.setAttribute('s', s); return c; };
  const el = (n, txt) => { const e = doc.createElementNS(NS, n); if (txt != null) e.textContent = txt; return e; };
  const str = (ref, v, s) => { const c = reset(cell(ref), s); if (v === '' || v == null) return; c.setAttribute('t', 'inlineStr'); const is = el('is'), t = el('t', v); t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); is.appendChild(t); c.appendChild(is); };
  const num = (ref, v, s) => { const c = reset(cell(ref), s); c.appendChild(el('v', String(v))); };
  const val = (ref, v, s) => (v !== '' && v != null && !isNaN(v) && String(v).trim() !== '') ? num(ref, Number(v), s) : str(ref, v, s);
  const fml = (ref, f, cached, isStr) => { const c = reset(cell(ref)); if (isStr) c.setAttribute('t', 'str'); c.appendChild(el('f', f)); c.appendChild(el('v', String(cached))); };
  const p = m.prof, mon = monthLabelGu(m.ym);
  str('F7', 'ક્રમાંક:' + m.refNo); str('I7', mon); str('F8', m.letterDate);
  (p.toLines || []).slice(0, 4).forEach((t, i) => str('A' + (12 + i), t));
  fml('E20', '"("&I7&")"', `(${mon})`, true);
  fml('A22', '"ઉપરોક્ત વિષય પરત્વે આપ સાહેબની સૂચના અન્વયે જણાવવાનું કે, માહે-"&I7&"ની"', `ઉપરોક્ત વિષય પરત્વે આપ સાહેબની સૂચના અન્વયે જણાવવાનું કે, માહે-${mon}ની`, true);
  fml('B26', 'I7', mon, true);
  const head = ` ${p.designationGu} ${p.deptGu}, ${p.placeGu}ની માહે- `;
  fml('D35', `"${head}" & I7 & "ની ડાયરી"`, `${head}${mon}ની ડાયરી`, true);
  fml('E75', '"માહે-"&I7&"ની તારીજ"', `માહે-${mon}ની તારીજ`, true);
  for (const r0 of [29, 69, 85, 135]) sigLines(p).forEach((t, i) => str('F' + (r0 + i), t));
  const merges = [];
  if (!m.showRoute) { str('C36', 'કામગીરી', 65); ['D', 'E', 'F'].forEach(c => str(c + '36', '', 65)); merges.push('C36:F36'); }
  for (let i = 0; i < 31; i++) {
    const r = 37 + i, d = m.days[i], last = r === 67, row = rowEl(r);
    if (!d) { ['B','C','D','E','F'].forEach(c => reset(cell(c + r))); row.setAttribute('hidden', '1'); continue; }
    row.removeAttribute('hidden');
    num('B' + r, excelSerial(d.date), last ? 32 : 58);
    const ws = kindXlStyle[d.kind] ?? 62, work = d.work || '';
    if (m.showRoute) {
      str('C' + r, d.from || (d.kind === 'tour' ? p.fromCode : '-'), last ? 29 : 59);
      str('D' + r, d.to || '-', last ? 29 : 59);
      str('E' + r, d.vehicle || '', last ? 66 : 60);
      str('F' + r, work, ws);
    } else {   // Sept-2025 style: only તારીખ + કામગીરી (work spread over C:F)
      str('C' + r, work, ws); ['D', 'E', 'F'].forEach(c => str(c + r, '', ws)); merges.push(`C${r}:F${r}`);
    }
    const lines = m.showRoute ? Math.ceil([...work].length / 20) || 1 : 1;
    row.setAttribute('ht', lines > 1 ? '30' : '19.5'); row.setAttribute('customHeight', '1');
  }
  const S = m.summary;
  for (const sr of SUMMARY_ROWS) { val('F' + sr.xlRow, S[sr.key]); if (sr.extra && !m.showExtra) rowEl(sr.xlRow).setAttribute('hidden', '1'); }
  for (const r of m.abstract) {
    const R = r.xlRow; val('D' + R, r.total); val('E' + R, r.inspected); val('G' + R, r.progressive);
    str('C' + R, r.std);
    if (Number(r.remaining) === Number(r.total) - Number(r.progressive)) fml('F' + R, `D${R}-G${R}`, r.remaining); else val('F' + R, r.remaining);
  }
  if (merges.length) {
    let mc = doc.getElementsByTagNameNS(NS, 'mergeCells')[0];
    if (!mc) { mc = el('mergeCells'); sd.parentNode.insertBefore(mc, sd.nextSibling); }
    merges.forEach(ref => { const x = el('mergeCell'); x.setAttribute('ref', ref); mc.appendChild(x); });
    mc.setAttribute('count', mc.getElementsByTagNameNS(NS, 'mergeCell').length);
  }
  zip.file('xl/worksheets/sheet1.xml', new XMLSerializer().serializeToString(doc));
  zip.file('xl/media/image1.jpeg', (await X.letterheadJpeg(p)).bytes);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
};

/* ---------- HTML pages (used for PDF + print + on-screen preview) ---------- */
const kindCls = { tour: 'y', holiday: 'o', leave: 'b', office: '' };
const sigHtml = p => `<div class="sig">${esc(p.officerNameGu)}<br>${esc(p.designationGu)}<br>${esc(p.deptGu)}<br>${esc(p.placeGu)}</div>`;
X.diaryPages = async function (m) {
  const p = m.prof, mon = monthLabelGu(m.ym), lh = (await X.letterheadJpeg(p)).dataUrl, route = m.showRoute;
  const pages = [];
  pages.push(`<div class="pg"><img class="lh" src="${lh}">
    <div style="margin-left:58%;line-height:1.8">ક્રમાંક:${esc(m.refNo)}<br>${esc(m.letterDate)}</div><br><br>
    <div style="line-height:1.6">${(p.toLines || []).map(esc).join('<br>')}</div><br><br><br>
    <div style="margin-left:14%">વિષય : ડાયરી મોકલવા બાબત &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(${esc(mon)})</div><br>
    <div style="line-height:1.7">ઉપરોક્ત વિષય પરત્વે આપ સાહેબની સૂચના અન્વયે જણાવવાનું કે, માહે-${esc(mon)}ની<br>કામગીરી દર્શાવતી ડાયરી આ સાથે સામેલ છે. જે આપ સાહેબશ્રીને વિદિત થવા વિનંતિ છે.</div><br><br>
    <div>બિડાણ: માહે- &nbsp;&nbsp;&nbsp; ${esc(mon)} &nbsp; ની ડાયરી</div>${sigHtml(p)}</div>`);
  pages.push(`<div class="pg"><div class="ttl">${esc(p.designationGu)} ${esc(p.deptGu)}, ${esc(p.placeGu)}ની માહે- ${esc(mon)}ની ડાયરી</div>
    <table class="dt"><tr><th style="width:95px">તારીખ</th>${route ? '<th>From</th><th>To &amp; fro</th><th>Vehicle</th>' : ''}<th style="width:150px">કામગીરી</th></tr>
    ${m.days.map(d => `<tr><td class="d">${dmy(d.date)}</td>${route ? `<td>${esc(d.from)}</td><td>${esc(d.to)}</td><td>${esc(d.vehicle)}</td>` : ''}<td class="${kindCls[d.kind] || ''}" style="text-align:left">${esc(d.work)}</td></tr>`).join('')}
    </table>${sigHtml(p)}</div>`);
  const sRows = SUMMARY_ROWS.filter(r => !r.extra || m.showExtra);
  pages.push(`<div class="pg"><div class="ttl">માહે-${esc(mon)}ની તારીજ</div>
    <table style="width:380px"><tr><th style="font-weight:400">અ.નં.</th><th style="font-weight:400;width:90px">કરેલ કામગીરીની વિગત</th><th style="font-weight:400">નિયત દિવસ</th><th style="font-weight:400">માસ દરમ્યાન</th></tr>
    ${sRows.map(r => `<tr><td>${guNum(r.sr)}</td><td>${esc(r.label)}</td><td>${r.noStd ? '' : '-'}</td><td>${esc(guNum(m.summary[r.key]))}</td></tr>`).join('')}</table>${sigHtml(p)}</div>`);
  const abRow = r => `<tr><td>${guNum(r.sr)}</td><td>${esc(r.label)}</td><td>${esc(r.std)}</td><td>${guNum(r.total)}</td><td>${guNum(r.inspected)}</td><td>${guNum(r.remaining)}</td><td>${guNum(r.progressive)}</td></tr>`;
  const abHead = `<tr><th>અનુ. ક્રમ</th><th>પરવાનાનો પ્રકાર</th><th>પરવાના તપાસવાનું ધોરણ</th><th>પરવાનાની કુલ સંખ્યા</th><th>માસ દરમ્યાન તપાસેલ પરવાનાની સંખ્યા</th><th>તપાસવાનાં બાકી રહેતા પરવાનાઓની સંખ્યા</th><th>તપાસેલ પરવાનાની સંખ્યાનું પ્રોગ્રેસીવ</th></tr><tr>${[1,2,3,4,5,6,7].map(n => `<th>${guNum(n)}</th>`).join('')}</tr>`;
  const cat = k => `<tr class="catrow"><td colspan="7">${CATS[k]}</td></tr>` + m.abstract.filter(r => r.cat === k).map(abRow).join('');
  pages.push(`<div class="pg"><div class="ttl">માસિક ડાયરીનું એબ્સ્ટ્રેક્ટ</div><table class="ab" style="width:100%">${abHead}${cat('imp')}${cat('main')}</table></div>`);
  pages.push(`<div class="pg"><table class="ab" style="width:100%">${cat('minor')}${cat('gen')}</table>${sigHtml(p)}</div>`);
  return pages;
};
/* v1.7.2 single-day diary page + its photo attachment pages (only when photos exist). */
X.dayPages = async function (date) {
  const p = await L.profile(), d = (await DB.get('days', date)) || L.defaultDay(date, p), ins = await L.inspectionsIn(date, date), lm = await L.licenseeMap();
  const ps = await PH.forDate(date);
  const pg = `<div class="pg"><div class="ttl">${esc(p.designationGu || '')} ${esc(p.deptGu || '')}, ${esc(p.placeGu || '')} – દૈનિક ડાયરી / Day diary: ${dmy(date)}</div>
    <table class="dt" style="width:100%"><tr><th style="width:150px">તારીખ</th><td style="text-align:left">${dmy(date)}</td></tr>
    <tr><th>Type of day</th><td style="text-align:left">${esc((DAY_KINDS[d.kind] || {}).en || d.kind || '')}</td></tr>
    <tr><th>કામગીરી</th><td style="text-align:left">${esc(d.work || '')}</td></tr>
    ${d.kind === 'tour' ? `<tr><th>From / To &amp; fro</th><td style="text-align:left">${esc(d.from)} → ${esc(d.to)}</td></tr><tr><th>Vehicle / Km</th><td style="text-align:left">${esc(d.vehicle || '')} ${d.km ? '· ' + esc(d.km) + ' km' : ''}</td></tr>` : ''}
    <tr><th>Inspections</th><td style="text-align:left">${ins.map(i => esc((lm[i.licenseeId]?.name || '-') + ' (' + i.typeCode + ')')).join('<br>') || '-'}</td></tr>
    ${d.note ? `<tr><th>Note</th><td style="text-align:left">${esc(d.note)}</td></tr>` : ''}
    ${ps.length ? `<tr><th>બિડાણ / Attachments</th><td style="text-align:left">${ps.length} photograph(s)</td></tr>` : ''}</table>${sigHtml(p)}</div>`;
  return [pg, ...PH.pages(ps, 'બિડાણ – ફોટોગ્રાફ્સ / Attachment – Photographs (' + dmy(date) + ')')];
};
/* Render page HTML strings into an A4 PDF (pages taller than A4 are split). */
X.pagesToPdf = async function (pages, name) {
  await loadScript('vendor/html2canvas.min.js'); await loadScript('vendor/jspdf.umd.min.js');
  const root = $('#printRoot'); root.innerHTML = pages.join('');
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' }); const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  let first = true;
  for (const pg of $$('.pg', root)) {
    const cv = await html2canvas(pg, { scale: 2, backgroundColor: '#fff', useCORS: true });
    const pagePx = Math.round(cv.width * H / W);
    for (let y = 0; y < cv.height; y += pagePx) {
      const h = Math.min(pagePx, cv.height - y); if (y > 0 && h < 40) break;
      const part = document.createElement('canvas'); part.width = cv.width; part.height = pagePx; const g = part.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, part.width, part.height); g.drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
      if (!first) pdf.addPage(); first = false;
      pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H);
    }
  }
  root.innerHTML = '';
  return pdf.output('blob');
};
X.printPages = function (pages) { $('#printRoot').innerHTML = pages.join(''); setTimeout(() => { window.print(); }, 300); };

/* ---------- Word (.docx) ---------- */
X.docxLib = async () => { await loadScript('vendor/docx.umd.js'); return window.docx; };
X.diaryDocx = async function (m) {
  const D = await X.docxLib(), p = m.prof, mon = monthLabelGu(m.ym), F = 'Shruti';
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, BorderStyle, ShadingType, PageBreak, VerticalAlign } = D;
  const T = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: F, size: o.size || 22, bold: o.bold, underline: o.u ? {} : undefined });
  const P = (text, o = {}) => new Paragraph({ alignment: o.align || AlignmentType.LEFT, spacing: { after: o.after ?? 60 }, indent: o.indent ? { left: o.indent } : undefined, children: Array.isArray(text) ? text : [T(text, o)] });
  const sig = () => sigLines(p).map(t => P(t.trim(), { align: AlignmentType.CENTER, indent: 5200, after: 0 }));
  const C = (text, o = {}) => new TableCell({ verticalAlign: VerticalAlign.CENTER, columnSpan: o.span, width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    borders: o.noBorder ? { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } : undefined,
    children: [new Paragraph({ alignment: o.align || AlignmentType.CENTER, children: [new TextRun({ text: String(text ?? ''), font: o.font || F, size: o.size || 20, bold: o.bold, underline: o.u ? {} : undefined })] })] });
  const lh = await X.letterheadJpeg(p);
  const fill = { tour: 'FFFF00', holiday: 'FFC000', leave: '00B0F0' };
  const route = m.showRoute;
  const dayRows = [new TableRow({ tableHeader: true, children: [C('તારીખ', { bold: true, w: 1500 }), ...(route ? [C('From', { bold: true }), C('To & fro', { bold: true }), C('Vehicle', { bold: true })] : []), C('કામગીરી', { bold: true, w: 3200 })] }),
    ...m.days.map(d => new TableRow({ children: [C(dmy(d.date), { bold: true, font: 'Arial', size: 18 }), ...(route ? [C(d.from, { size: 16 }), C(d.to, { size: 16 }), C(d.vehicle, { size: 16 })] : []), C(d.work, { align: AlignmentType.LEFT, size: 18, fill: fill[d.kind], bold: d.kind === 'tour' || d.kind === 'leave' })] }))];
  const sRows = SUMMARY_ROWS.filter(r => !r.extra || m.showExtra);
  const sumRows = [new TableRow({ children: ['અ.નં.', 'કરેલ કામગીરીની વિગત', 'નિયત દિવસ', 'માસ દરમ્યાન'].map(t => C(t)) }), ...sRows.map(r => new TableRow({ children: [C(guNum(r.sr)), C(r.label, { w: 2400 }), C(r.noStd ? '' : '-'), C(guNum(m.summary[r.key]))] }))];
  const abRows = [new TableRow({ tableHeader: true, children: ['અનુ. ક્રમ', 'પરવાનાનો પ્રકાર', 'પરવાના તપાસવાનું ધોરણ', 'પરવાનાની કુલ સંખ્યા', 'માસ દરમ્યાન તપાસેલ પરવાનાની સંખ્યા', 'તપાસવાનાં બાકી રહેતા પરવાનાઓની સંખ્યા', 'તપાસેલ પરવાનાની સંખ્યાનું પ્રોગ્રેસીવ'].map(t => C(t, { bold: true, size: 18 })) }),
    new TableRow({ children: [1,2,3,4,5,6,7].map(n => C(guNum(n), { bold: true, size: 18 })) })];
  for (const k of ['imp', 'main', 'minor', 'gen']) {
    abRows.push(new TableRow({ children: [C(CATS[k], { span: 7, u: true, size: 22 })] }));
    m.abstract.filter(r => r.cat === k).forEach(r => abRows.push(new TableRow({ children: [C(guNum(r.sr), { bold: true, size: 16 }), C(r.label), C(r.std), C(guNum(r.total)), C(guNum(r.inspected)), C(guNum(r.remaining)), C(guNum(r.progressive))] })));
  }
  const doc = new Document({ creator: 'Inspection App', title: `Diary ${mon}`, styles: { default: { document: { run: { font: F } } } }, sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 1000, right: 1000 } } }, children: [
      new Paragraph({ children: [new ImageRun({ data: lh.bytes, transformation: { width: 600, height: Math.round(600 * LH_H / LH_W) } })] }),
      P('ક્રમાંક:' + m.refNo, { indent: 5600, after: 0 }), P(m.letterDate, { indent: 5600, after: 400 }),
      ...(p.toLines || []).map(t => P(t, { after: 0 })), P('', { after: 500 }),
      P([T('વિષય : ડાયરી મોકલવા બાબત'), T(`          (${mon})`)], { indent: 1500, after: 300 }),
      P(`ઉપરોક્ત વિષય પરત્વે આપ સાહેબની સૂચના અન્વયે જણાવવાનું કે, માહે-${mon}ની કામગીરી દર્શાવતી ડાયરી આ સાથે સામેલ છે. જે આપ સાહેબશ્રીને વિદિત થવા વિનંતિ છે.`, { after: 400 }),
      P(`બિડાણ: માહે-    ${mon}  ની ડાયરી`, { after: 600 }), ...sig(),
      new Paragraph({ children: [new PageBreak()] }),
      P(`${p.designationGu} ${p.deptGu}, ${p.placeGu}ની માહે- ${mon}ની ડાયરી`, { align: AlignmentType.CENTER, bold: true, u: true }),
      new Table({ alignment: AlignmentType.CENTER, width: { size: route ? 8000 : 5200, type: WidthType.DXA }, columnWidths: route ? [1500, 900, 1700, 900, 3000] : [1500, 3700], rows: dayRows }), P('', { after: 300 }), ...sig(),
      new Paragraph({ children: [new PageBreak()] }),
      P(`માહે-${mon}ની તારીજ`, { align: AlignmentType.CENTER, bold: true, u: true }),
      new Table({ alignment: AlignmentType.CENTER, width: { size: 5600, type: WidthType.DXA }, columnWidths: [700, 2400, 1100, 1400], rows: sumRows }), P('', { after: 300 }), ...sig(),
      new Paragraph({ children: [new PageBreak()] }),
      P('માસિક ડાયરીનું એબ્સ્ટ્રેક્ટ', { align: AlignmentType.CENTER, bold: true, u: true }),
      new Table({ alignment: AlignmentType.CENTER, width: { size: 9800, type: WidthType.DXA }, columnWidths: [900, 1700, 1300, 1300, 1500, 1600, 1500], rows: abRows }), P('', { after: 300 }), ...sig()
    ] }] });
  return Packer.toBlob(doc);
};

/* ---------- Weekly diary ---------- */
X.weekTitle = (p, from, to) => `${p.designationGu} ${p.deptGu}, ${p.placeGu}ની તા. ${dmy(from)} થી ${dmy(to)} સુધીની સાપ્તાહિક ડાયરી`;
X.weekData = async function (from, to) {
  const p = await L.profile(), days = await L.rangeDays(from, to, p), ins = await L.inspectionsIn(from, to), lm = await L.licenseeMap();
  const det = {}; ins.forEach(i => (det[i.date] ||= []).push(`${lm[i.licenseeId]?.name || '-'} (${i.typeCode || ''})${/^y/i.test(i.violations) ? ' – ક્ષતિ' : ''}`));
  return { p, days, ins, det, from, to };
};
X.weekPages = async function (w) {
  const lh = (await X.letterheadJpeg(w.p)).dataUrl;
  return [`<div class="pg"><img class="lh" src="${lh}"><div class="ttl">${esc(X.weekTitle(w.p, w.from, w.to))}</div>
  <table class="dt" style="width:100%"><tr><th>તારીખ</th><th>વાર</th><th>From</th><th>To &amp; fro</th><th>Vehicle</th><th>કામગીરી</th><th>તપાસેલ પરવાના / વિગત</th></tr>
  ${w.days.map(d => `<tr><td class="d">${dmy(d.date)}</td><td>${GU_WDAYS[parseYmd(d.date).getDay()]}</td><td>${esc(d.from)}</td><td>${esc(d.to)}</td><td>${esc(d.vehicle)}</td><td class="${kindCls[d.kind]}" style="text-align:left">${esc(d.work)}</td><td style="text-align:left">${(w.det[d.date] || []).map(esc).join('<br>')}${d.note ? '<br><i>' + esc(d.note) + '</i>' : ''}</td></tr>`).join('')}
  </table><p style="font-size:13px">પ્રવાસના દિવસો: ${guNum(w.days.filter(d => d.kind === 'tour').length)} &nbsp; | &nbsp; તપાસેલ પરવાના: ${guNum(w.ins.length)} &nbsp; | &nbsp; ક્ષતિઓ: ${guNum(w.ins.filter(i => /^y/i.test(i.violations)).length)}</p>${sigHtml(w.p)}</div>`];
};
X.weekXlsx = function (w) {
  const rows = [[X.weekTitle(w.p, w.from, w.to)], [], ['તારીખ', 'વાર', 'From', 'To & fro', 'Vehicle', 'કામગીરી', 'તપાસેલ પરવાના / વિગત', 'Km', 'નોંધ']];
  w.days.forEach(d => rows.push([dmy(d.date), GU_WDAYS[parseYmd(d.date).getDay()], d.from, d.to, d.vehicle, d.work, (w.det[d.date] || []).join('; '), d.km || '', d.note || '']));
  rows.push([], ['પ્રવાસના દિવસો', w.days.filter(d => d.kind === 'tour').length, 'તપાસેલ પરવાના', w.ins.length]);
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [12, 7, 8, 14, 8, 26, 40, 6, 20].map(w => ({ wch: w })); ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Weekly diary');
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
X.weekDocx = async function (w) {
  const D = await X.docxLib(), F = 'Shruti';
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, ShadingType, ImageRun, WidthType } = D;
  const C = (t, o = {}) => new TableCell({ shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined, children: [new Paragraph({ alignment: o.left ? AlignmentType.LEFT : AlignmentType.CENTER, children: [new TextRun({ text: String(t ?? ''), font: F, size: 18, bold: o.b })] })] });
  const fill = { tour: 'FFFF00', holiday: 'FFC000', leave: '00B0F0' }, lh = await X.letterheadJpeg(w.p);
  const rows = [new TableRow({ tableHeader: true, children: ['તારીખ', 'વાર', 'From', 'To & fro', 'Vehicle', 'કામગીરી', 'તપાસેલ પરવાના / વિગત'].map(t => C(t, { b: true })) }),
    ...w.days.map(d => new TableRow({ children: [C(dmy(d.date), { b: true }), C(GU_WDAYS[parseYmd(d.date).getDay()]), C(d.from), C(d.to), C(d.vehicle), C(d.work, { left: true, fill: fill[d.kind] }), C((w.det[d.date] || []).join('\n'), { left: true })] }))];
  const sig = sigLines(w.p).map(t => new Paragraph({ alignment: AlignmentType.CENTER, indent: { left: 5200 }, children: [new TextRun({ text: t.trim(), font: F, size: 22 })] }));
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 800, right: 800 } } }, children: [
    new Paragraph({ children: [new ImageRun({ data: lh.bytes, transformation: { width: 620, height: Math.round(620 * LH_H / LH_W) } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: X.weekTitle(w.p, w.from, w.to), font: F, size: 24, bold: true, underline: {} })] }),
    new Table({ width: { size: 10300, type: WidthType.DXA }, columnWidths: [1250, 700, 800, 1300, 900, 2550, 2800], rows }), new Paragraph({ spacing: { after: 300 }, children: [] }), ...sig] }] });
  return Packer.toBlob(doc);
};

/* ---------- Inspection reports (M-A / F.L. etc. forms) ---------- */
X.inspectionPage = function (i, lic, lh, p) {
  const fields = (i.fields || []).filter(f => String(f.value ?? '').trim() !== '');
  const sections = {}; fields.forEach(f => (sections[f.section || 'Details'] ||= []).push(f));
  return `<div class="pg"><img class="lh" src="${lh}"><div class="ttl">નિરીક્ષણ અહેવાલ / Inspection Report</div>
  <table class="ir" style="width:100%">
  <tr><td class="k">Report No.</td><td>${esc(i.reportNo)}</td></tr><tr><td class="k">Date / Time of inspection</td><td>${dmy(i.date)} ${esc(i.time || '')}</td></tr>
  <tr><td class="k">Name of Licensee</td><td>${esc(lic?.name)}</td></tr><tr><td class="k">Address / Area</td><td>${esc([lic?.address, lic?.area].filter(Boolean).join(', '))}</td></tr>
  <tr><td class="k">Licence type</td><td>${esc(i.typeCode)} ${esc(i.licenceNo || '')}</td></tr><tr><td class="k">Place visited / Vehicle / Km</td><td>${esc(i.to || '')} ${esc(i.vehicle || '')} ${i.distanceKm ? esc(i.distanceKm) + ' km' : ''}</td></tr>
  ${Object.entries(sections).map(([s, fs]) => `<tr><td colspan="2" style="background:#dde3f5;font-weight:700">${esc(s)}</td></tr>` + fs.map(f => `<tr><td class="k">${esc(f.label)}</td><td>${/^data:image\//.test(f.value) ? `<img src="${esc(f.value)}" style="max-width:70mm;max-height:60mm">` : esc(Array.isArray(f.value) ? f.value.join(', ') : f.value)}</td></tr>`).join('')).join('')}
  <tr><td colspan="2" style="background:#dde3f5;font-weight:700">Violations / Action</td></tr>
  <tr><td class="k">Violations found?</td><td>${esc(i.violations)}</td></tr><tr><td class="k">Details / rules</td><td>${esc([i.violationNotes, i.rules].filter(Boolean).join(' — '))}</td></tr>
  <tr><td class="k">Remarks of Inspecting Officer</td><td>${esc(i.remarks)}</td></tr><tr><td class="k">Subordinate staff present</td><td>${esc(i.staff)}</td></tr>
  </table>${sigHtml(p)}</div>`;
};
X.inspectionRows = (i, lic) => [['Report No.', i.reportNo], ['Date', dmy(i.date)], ['Time', i.time || ''], ['Name of Licensee', lic?.name || ''], ['Address', lic?.address || ''], ['Area', lic?.area || ''],
  ['Licence type', i.typeCode], ['Licence No.', i.licenceNo || ''], ['Place visited', i.to || ''], ['Vehicle', i.vehicle || ''], ['Distance (km)', i.distanceKm || ''],
  ...(i.fields || []).filter(f => String(f.value ?? '').trim() !== '').map(f => [`${f.section ? f.section + ' – ' : ''}${f.label}`, Array.isArray(f.value) ? f.value.join(', ') : /^data:image\//.test(f.value) ? '[photo – see PDF]' : f.value]),
  ['Violations found?', i.violations], ['Violation details', i.violationNotes || ''], ['Rules', i.rules || ''], ['Remarks', i.remarks || ''], ['Subordinate staff', i.staff || '']];
X.inspectionXlsx = function (list, lm) {
  const wb = XLSX.utils.book_new();
  list.forEach((i, n) => { const ws = XLSX.utils.aoa_to_sheet([['Inspection Report'], [], ...X.inspectionRows(i, lm[i.licenseeId])]); ws['!cols'] = [{ wch: 55 }, { wch: 60 }]; XLSX.utils.book_append_sheet(wb, ws, (`${n + 1}-${i.typeCode || 'IR'}`).slice(0, 30)); });
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
X.registerXlsx = function (list, lm, title) {
  const rows = [[title], [], ['Sr', 'Date', 'Time', 'Report No.', 'Licensee', 'Area', 'Licence type', 'Violations', 'Violation details / rules', 'Remarks', 'Place', 'Vehicle', 'Km']];
  list.forEach((i, n) => { const l = lm[i.licenseeId]; rows.push([n + 1, dmy(i.date), i.time || '', i.reportNo, l?.name || '', l?.area || l?.address || '', i.typeCode, i.violations, [i.violationNotes, i.rules].filter(Boolean).join(' — '), i.remarks || '', i.to || '', i.vehicle || '', i.distanceKm || '']); });
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [4, 11, 6, 34, 34, 16, 9, 9, 40, 40, 14, 12, 6].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Register');
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
X.inspectionDocx = async function (list, lm, p) {
  const D = await X.docxLib(), F = 'Shruti';
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak } = D;
  const C = (t, b) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ''), font: F, size: 19, bold: b })] })] });
  const children = [];
  list.forEach((i, n) => {
    if (n) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: 'નિરીક્ષણ અહેવાલ / Inspection Report', font: F, size: 26, bold: true, underline: {} })] }));
    children.push(new Table({ width: { size: 10000, type: WidthType.DXA }, columnWidths: [4200, 5800], rows: X.inspectionRows(i, lm[i.licenseeId]).map(([k, v]) => new TableRow({ children: [C(k, true), C(v)] })) }));
    sigLines(p).forEach(t => children.push(new Paragraph({ alignment: AlignmentType.CENTER, indent: { left: 5200 }, children: [new TextRun({ text: t.trim(), font: F, size: 22 })] })));
  });
  return Packer.toBlob(new Document({ sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }] }));
};
