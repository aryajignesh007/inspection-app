'use strict';
/* Imports (old Batti data, Excel files) and backup / restore. */
const IM = {};
IM.previewPrivate = data => {
  if (!data || data.kind !== 'batti-mobile-private-import') throw new Error('This is not an Inspection App existing-data file.');
  const suspect = data.inspections.filter(i => i.suspect && i.suspect.length).length;
  return { licensees: data.licensees.length, inspections: data.inspections.length, suspect, hasLetterhead: !!data.profile?.letterhead };
};
IM.importPrivate = async function (data, { skipSuspect = true } = {}) {
  IM.previewPrivate(data);
  const lics = (await DB.all('licensees')), byName = {}; lics.forEach(l => byName[l.name.trim().toLowerCase()] = l);
  // (a) duplicates that the new file merges (same firm written differently): fold the copy on this phone into the main record
  const allIns = await DB.all('inspections'), allVis = await DB.all('visits');
  for (const mg of data.merges || []) {
    const dup = byName[mg.name.trim().toLowerCase()]; let keep = byName[mg.into.trim().toLowerCase()];
    if (!dup || dup === keep) continue;
    if (!keep) { dup.aka = [...new Set([...(dup.aka || []), dup.name])]; dup.name = mg.into; delete byName[mg.name.trim().toLowerCase()]; byName[mg.into.trim().toLowerCase()] = dup; await DB.put('licensees', dup); continue; }
    IM.mergeInto(keep, dup); keep.aka = [...new Set([...(keep.aka || []), dup.name])];
    for (const i of allIns) if (i.licenseeId === dup.id) { i.licenseeId = keep.id; await DB.put('inspections', i); }
    for (const v of allVis) if ((v.licIds || []).includes(dup.id)) { v.licIds = [...new Set(v.licIds.map(x => x === dup.id ? keep.id : x))]; await DB.put('visits', v); }
    await DB.del('licensees', dup.id); delete byName[mg.name.trim().toLowerCase()]; await DB.put('licensees', keep);
  }
  // (b) add new licensees; for existing ones only fill details that are still empty (your own edits are kept)
  const idMap = {}; const toPut = [];
  for (const l of data.licensees) {
    const ex = byName[l.name.trim().toLowerCase()] || (l.aka || []).map(a => byName[a.trim().toLowerCase()]).find(Boolean);
    let rec;
    if (ex) { rec = IM.mergeInto(ex, l); rec.aka = [...new Set([...(ex.aka || []), ...(l.aka || [])])]; }
    else rec = { ...l, id: uid(), importedFrom: 'batti-v6' };
    delete rec.oldId; idMap[l.oldId] = rec.id; byName[rec.name.trim().toLowerCase()] = rec; toPut.push(rec);
  }
  await DB.putMany('licensees', toPut);
  const existing = new Set((await DB.all('inspections')).map(i => i.importKey).filter(Boolean));
  const ins = [];
  for (const i of data.inspections) {
    const key = 'v6:' + i.oldId; if (existing.has(key)) continue;
    if (skipSuspect && i.suspect && i.suspect.length) continue;
    ins.push({ id: uid(), importKey: key, reportNo: i.reportNo, date: i.date, time: i.time, licenseeId: idMap[i.licenseeOldId] || null, typeCode: i.typeCode, to: i.to, vehicle: i.vehicle,
      distanceKm: i.distanceKm || '', violations: i.violations, violationNotes: i.violationNotes, rules: i.rules, remarks: i.remarks, staff: i.staff, fields: i.fields || [], flags: i.suspect || [] });
  }
  await DB.putMany('inspections', ins);   // imported inspections do not overwrite the day diary (old data has no route info)
  // v1.8.0: the old Windows-app file is Surat's – never copy its profile / abstract totals into another district
  if (typeof DIST !== 'undefined' && DIST.key !== 'surat') return { licensees: toPut.length, inspections: ins.length };
  const prof = await L.profile(), pp = data.profile || {};
  for (const k of ['officerNameGu', 'designationGu', 'deptGu', 'placeGu', 'officerNameEn', 'phone', 'officeLat', 'officeLng', 'letterhead']) if (pp[k]) prof[k] = pp[k];
  if (pp.vehicles?.length) prof.vehicles = [...new Set([...(prof.vehicles || []), ...pp.vehicles])];
  await L.saveProfile(prof);
  const cfg = await L.abstractCfg();
  for (const r of ABSTRACT_ROWS) { const t = data.abstractTotals?.[r.label.trim()]; if (t != null && cfg.totals[r.key] == null) cfg.totals[r.key] = t; }
  if (data.progressiveBaseline && !cfg.baseline) { const v = {}; ABSTRACT_ROWS.forEach(r => { const x = data.progressiveBaseline.values?.[r.label.trim()]; if (x != null) v[r.key] = x; }); cfg.baseline = { month: data.progressiveBaseline.month, values: v }; }
  await L.saveAbstractCfg(cfg);
  const types = {}; (data.licenceTypes || []).forEach(t => { if (t.code) types[t.code] = { code: t.code, standard: t.standard, totalCount: t.totalCount }; });
  await DB.putMany('licenceTypes', Object.values(types));
  return { licensees: toPut.length, inspections: ins.length };
};
/* fill empty fields of `keep` from `src`; licences matched by type (+ number) */
IM.mergeInto = function (keep, src) {
  for (const [k, v] of Object.entries(src)) if (!['id', 'oldId', 'licences', 'aka', 'name'].includes(k) && v != null && v !== '' && (keep[k] == null || keep[k] === '')) keep[k] = v;
  keep.licences ||= [];
  for (const x of src.licences || []) {
    const same = keep.licences.find(y => y.typeCode === x.typeCode && (!y.licenceNo || !x.licenceNo || y.licenceNo === x.licenceNo));
    if (same) { for (const [k, v] of Object.entries(x)) if (v && !same[k]) same[k] = v; } else keep.licences.push({ ...x });
  }
  return keep;
};
IM.readSheet = async (file, opts = {}) => { const wb = XLSX.read(await readFile(file, 'buffer'), { cellDates: false, ...opts }); return wb; };
/* Licensee list: columns name, address, area/gidc_area, district, phone, email, contact_person, authorised_person, gstin, premises, license_type_code, license_number, validity, possession_limit, consumption_limit, purpose, prohibited_item (Gujarati headers also accepted). */
IM.importLicenseesExcel = async function (file) {
  const wb = await IM.readSheet(file), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const g = (r, ...ks) => { for (const k of ks) for (const rk of Object.keys(r)) if (rk.trim().toLowerCase().replace(/\s+/g, '_') === k && String(r[rk]).trim()) return String(r[rk]).trim(); return ''; };
  const lics = await DB.all('licensees'), byName = {}; lics.forEach(l => byName[l.name.trim().toLowerCase()] = l);
  let n = 0;
  for (const r of rows) {
    const name = g(r, 'name', 'licensee_name', 'નામ', 'name_of_licensee'); if (!name) continue;
    const l = byName[name.toLowerCase()] || { id: uid(), name, licences: [] };
    l.address ||= g(r, 'address', 'સરનામું'); l.area ||= g(r, 'area', 'gidc_area', 'gidc', 'વિસ્તાર'); l.phone ||= g(r, 'phone', 'mobile');
    l.email ||= g(r, 'email'); l.contactPerson ||= g(r, 'contact_person'); l.authorisedPerson ||= g(r, 'authorised_person', 'authorized_person', 'nokarnama_holder_name');
    l.district ||= g(r, 'district', 'જિલ્લો'); l.gstin ||= g(r, 'gstin', 'gst'); l.premises ||= g(r, 'premises', 'godown', 'storage');
    const code = normCode(g(r, 'license_type_code', 'license_type', 'licence_type', 'પરવાનાનો_પ્રકાર')), no = g(r, 'license_number', 'licence_number', 'license_no', 'uln', 'પરવાના_નંબર');
    if (code && !l.licences.some(x => x.typeCode === code && (x.licenceNo || '') === no)) l.licences.push({ typeCode: code, licenceNo: no, validity: g(r, 'validity', 'validity_date'), possessionLimit: g(r, 'possession_limit'), consumptionLimit: g(r, 'consumption_limit'), purpose: g(r, 'purpose'), prohibitedItems: g(r, 'prohibited_item', 'prohibited_items'), status: 'active' });
    byName[name.toLowerCase()] = l; await DB.put('licensees', l); n++;
  }
  return n;
};
/* Inspection form template (same columns as Batti's Inspection-Template-Upload.xlsx). */
IM.importTemplateExcel = async function (file) {
  const wb = await IM.readSheet(file), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const by = {};
  rows.forEach(r => { const code = normCode(r.license_type_code); if (!code || !r.field_label) return;
    let opts = []; try { opts = r.field_options ? JSON.parse(r.field_options) : []; } catch { opts = String(r.field_options).split(/[,;]/).map(s => s.trim()).filter(Boolean); }
    (by[code] ||= []).push({ order: Number(r.field_order) || 0, section: r.section_name, label: String(r.field_label).trim(), type: r.field_type || 'text', options: opts, required: String(r.is_required) === '1' }); });
  for (const [code, f] of Object.entries(by)) await DB.put('templates', { code, fields: f.sort((a, b) => a.order - b.order) });
  return Object.keys(by);
};
/* Old monthly diary workbook (Diary-*.xlsx in the office format): reads the day table and colours. */
IM.importDiaryExcel = async function (file) {
  const wb = await IM.readSheet(file, { cellStyles: true });
  const name = wb.SheetNames.find(n => { const s = wb.Sheets[n]; return s.B36 && /તારીખ/.test(s.B36.v); }) || wb.SheetNames[0];
  const s = wb.Sheets[name], out = [];
  for (let r = 37; r <= 67; r++) {
    const b = s['B' + r]; if (!b || typeof b.v !== 'number') continue;
    const date = fromExcelSerial(b.v), v = c => (s[c + r] ? String(s[c + r].v ?? '') : '');
    const rgb = (s['F' + r]?.s?.fgColor?.rgb || s['F' + r]?.s?.patternType && '' || '').toUpperCase();
    let kind = /FFFF00$/.test(rgb) ? 'tour' : /FFC000$/.test(rgb) ? 'holiday' : /00B0F0$/.test(rgb) ? 'leave' : '';
    const work = v('F');
    if (!kind) kind = /રજા/.test(work) ? 'holiday' : (v('D') && v('D') !== '-') ? 'tour' : 'office';
    out.push({ date, kind, from: v('C') || '-', to: v('D') || '-', vehicle: v('E'), work, importedFrom: file.name });
  }
  await DB.putMany('days', out);
  return out;
};
IM.backup = async function () {
  const data = await DB.dump();
  return new Blob([JSON.stringify({ kind: 'batti-mobile-backup', version: 1, createdAt: new Date().toISOString(), data })], { type: 'application/json' });
};
IM.restore = async function (obj) {
  if (!obj || obj.kind !== 'batti-mobile-backup') throw new Error('Not an Inspection App backup file');
  // device-local bookkeeping (sync.* / bk.*) and sync tombstones are kept – they are not part of a backup
  const keep = (await DB.all('settings')).filter(r => /^(sync|bk)\./.test(String(r.key)));
  for (const s of Object.keys(DB.STORES)) { if (s === 'tombstones') continue; if (['keywords', 'reminders', 'meetings', 'offices', 'pendency', 'staff', 'messages', 'receipts', 'teamdata', 'photos'].includes(s) && !Array.isArray(obj.data[s])) continue;   /* older backup: keep these stores as they are */ await DB.clear(s); const a = (obj.data[s] || []).filter(r => s !== 'settings' || !/^(sync|bk)\./.test(String(r.key))); if (a.length) await DB.putMany(s, a); }
  if (keep.length) await DB.putMany('settings', keep);
  if (typeof KW !== 'undefined') KW.invalidate();
};
/* v1.7.5 e-Prohibition licensee list (PRIVATE-eProhibition-licensees-<district>.json, kept only in Sir's own Drive).
   Merge rule: match by ULN / licence number first, then by firm name; only ADD licences and fill EMPTY details – nothing is ever deleted or overwritten.
   After import the normal Drive sync carries the new licensees to every phone of this district. */
IM.ulnKey = s => String(s || '').toUpperCase().replace(/\s+/g, '');
IM.nameKey = s => String(s || '').toLowerCase().replace(/\bprivate\b/g, 'pvt').replace(/\blimited\b/g, 'ltd').replace(/\bm\/s\.?/g, '').replace(/[^a-z0-9\u0a80-\u0aff]/g, '');
IM.previewPortal = (data, distKey) => {
  if (!data || data.kind !== 'inspection-app-portal-licensees') throw new Error('This is not an e-Prohibition licensee file.');
  const codes = {}; (data.licensees || []).forEach(l => (l.licences || []).forEach(x => codes[x.typeCode] = (codes[x.typeCode] || 0) + 1));
  return { district: data.district, wrongDistrict: !!distKey && data.district !== distKey, licensees: (data.licensees || []).length, licences: Object.values(codes).reduce((a, b) => a + b, 0), codes, source: data.source || '' };
};
const PM_isP = s => /e-Prohibition/i.test(String(s || ''));
IM.importPortal = async function (data, distKey) {
  const pv = IM.previewPortal(data, distKey);
  if (pv.wrongDistrict) throw new Error('This file is for ' + data.district + ' district. Switch to that district first.');
  const lics = await DB.all('licensees'), byUln = {}, byName = {};
  const index = l => { (l.licences || []).forEach(x => { for (const k of [x.uln, x.licenceNo]) if (k) byUln[IM.ulnKey(k)] = l; }); for (const n of [l.name, ...(l.aka || [])]) if (n) byName[IM.nameKey(n)] ||= l; };
  lics.forEach(index);
  const changed = new Map(); let added = 0, updated = 0, licAdded = 0;
  const expire = x => { if (typeof TJ !== 'undefined' && TJ.isExpired(x)) { x.status = 'inactive'; x.inactiveReason ||= 'Validity ended ' + TJ.validEnd(x.validity); } return x; };
  for (const original of data.licensees || []) {
    const src = { ...original, licences: (original.licences || []).map(x => expire({ ...x })) };
    let rec = (src.licences || []).map(x => byUln[IM.ulnKey(x.uln || x.licenceNo)]).find(Boolean) || byName[IM.nameKey(src.name)];
    if (!rec) { rec = { ...src, id: uid(), licences: (src.licences || []).map(x => ({ ...x })), importedFrom: 'e-Prohibition' }; added++; licAdded += rec.licences.length; changed.set(rec.id, rec); index(rec); continue; }
    const before = JSON.stringify(rec);
    for (const k of ['address', 'area', 'city', 'district', 'phone', 'email']) if (src[k] && !String(rec[k] || '').trim()) rec[k] = src[k];
    rec.licences ||= [];
    for (const x of src.licences || []) {
      const u = IM.ulnKey(x.uln || x.licenceNo);
      const same = rec.licences.find(y => IM.ulnKey(y.uln) === u || IM.ulnKey(y.licenceNo) === u) || rec.licences.find(y => y.typeCode === x.typeCode && !y.uln && !y.licenceNo);
      if (same) { for (const [k, v] of Object.entries(x)) if (v && !same[k]) same[k] = v; if (x.status === 'inactive' && same.status !== 'inactive') { same.status = 'inactive'; if (x.inactiveReason && !same.inactiveReason) same.inactiveReason = x.inactiveReason; } }
      else { rec.licences.push({ ...x }); licAdded++; }
    }
    if (src.name && IM.nameKey(src.name) !== IM.nameKey(rec.name) && !(rec.aka || []).some(a => IM.nameKey(a) === IM.nameKey(src.name))) rec.aka = [...(rec.aka || []), src.name];
    if (!PM_isP(rec.importedFrom)) rec.importedFrom = 'e-Prohibition';
    for (const x of rec.licences) if (!x.source && (src.licences || []).some(y => IM.ulnKey(y.uln || y.licenceNo) === IM.ulnKey(x.uln || x.licenceNo))) x.source = 'e-Prohibition';
    rec.licences.forEach(expire);
    if (JSON.stringify(rec) !== before) { rec.portalSyncedAt = src.portalSyncedAt || data.createdAt; changed.set(rec.id, rec); updated++; }
    index(rec);
  }
  // pf40: tag licences that are never counted (hospitals/schools/excluded types/non-factory RS2) so a re-import cannot add them back to the counts
  for (const rec of changed.values()) for (const x of rec.licences || []) { const r = typeof TJ !== 'undefined' ? TJ.skipLicence(rec, x) : ''; if (r) x.notCounted = r; else delete x.notCounted; }
  if (changed.size) await DB.putMany('licensees', [...changed.values()]);
  let merge = null; if (typeof PM !== 'undefined') { try { merge = await PM.run('after-portal-import'); await DB.setSetting(PM.FLAG, { at: new Date().toISOString(), via: 'import' }); } catch (e) { console.warn('portal merge', e); } }
  return { added, updated, licAdded, merge, total: (await DB.all('licensees')).length };
};

const licInactive = l => (l?.licences || []).some(x => TJ.isInactive(x));
const inactivePill = l => {
  const all = l?.licences || [], inactive = all.filter(x => TJ.isInactive(x));
  return inactive.length ? '<span class="pill bad" title="' + esc(inactive.map(x => x.typeCode + ': ' + TJ.inactiveReason(x)).join('; ')) + '">Inactive' + (inactive.length === all.length ? '' : ' (' + inactive.map(x => esc(x.typeCode)).join(', ') + ')') + '</span>' : '';
};
